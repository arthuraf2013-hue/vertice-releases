// Backend real: Firebase (Auth + Firestore) + mídias no servidor próprio (ou Firebase Storage).
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch, runTransaction, serverTimestamp, increment,
  Timestamp, deleteField, connectFirestoreEmulator,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage, ref as sref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  PAIRING_KIND, ORDER_BOARD_DEFAULTS, PLANS, screenCode, normalizePairingCode,
} from '@vertice/shared';

const NOW = Symbol('now');
const DELETE = Symbol('delete');
const INC = (n) => ({ __inc: n });

export function createFirebaseBackend(config, { emulator = false, mediaServerUrl = '' } = {}) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  // Com VITE_MEDIA_SERVER_URL, as mídias vão para o servidor próprio (servers/media) e o
  // Firebase Storage nem é usado (o projeto pode ficar no plano grátis).
  const mediaBase = (mediaServerUrl || '').replace(/\/$/, '');
  const storage = mediaBase ? null : getStorage(app);
  if (emulator) {
    // Desenvolvimento local: `npx firebase emulators:start` e VITE_FIREBASE_EMULATOR=1.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  /** Timestamp → milissegundos, recursivo. O app só trabalha com números. */
  const norm = (v) => {
    if (v instanceof Timestamp) return v.toMillis();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k in v) o[k] = norm(v[k]);
      return o;
    }
    return v;
  };
  /** Sentinelas do app → sentinelas do Firestore. */
  const out = (v) => {
    if (v === NOW) return serverTimestamp();
    if (v === DELETE) return deleteField();
    if (v && typeof v === 'object' && '__inc' in v) return increment(v.__inc);
    if (Array.isArray(v)) return v.map(out);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = {};
      for (const k in v) if (v[k] !== undefined) o[k] = out(v[k]);
      return o;
    }
    return v;
  };
  async function idToken() {
    if (!auth.currentUser) throw new Error('Faça login de novo.');
    return auth.currentUser.getIdToken();
  }
  async function mediaError(res) {
    try {
      return (await res.json()).error || `Servidor de mídias respondeu ${res.status}.`;
    } catch {
      return `Servidor de mídias respondeu ${res.status}.`;
    }
  }
  /** PUT com progresso (fetch não informa progresso de envio; XHR sim). */
  async function uploadToMediaServer(path, file, onProgress) {
    const token = await idToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${mediaBase}/v1/files/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* resposta vazia */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve({ url: body.url });
        else reject(new Error(body.error || `Servidor de mídias respondeu ${xhr.status}.`));
      };
      xhr.onerror = () => reject(new Error('Não foi possível falar com o servidor de mídias. Confira o endereço e a internet.'));
      xhr.send(file);
    });
  }

  const snapDoc = (s) => (s.exists() ? { id: s.id, ...norm(s.data()) } : null);
  const buildQuery = (path, q = {}) => {
    const parts = [];
    for (const [f, op, val] of q.where || []) parts.push(where(f, op, val));
    if (q.orderBy) parts.push(orderBy(q.orderBy[0], q.orderBy[1] || 'asc'));
    if (q.limit) parts.push(limit(q.limit));
    return query(collection(db, path), ...parts);
  };

  return {
    kind: 'firebase',
    NOW,
    DELETE,
    inc: INC,

    auth: {
      onChange(cb) {
        return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null));
      },
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      signOut: () => signOut(auth),
      resetPassword: (email) => sendPasswordResetEmail(auth, email),
      /** Cria o usuário e, se não houver convite, a empresa dele (como proprietário). */
      async signUp({ name, email, password, companyName }) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        await updateProfile(cred.user, { displayName: name });
        const emailKey = email.trim().toLowerCase();
        const invite = await getDoc(doc(db, 'invites', emailKey));
        const batch = writeBatch(db);
        if (invite.exists()) {
          const { companyId, role } = invite.data();
          batch.set(doc(db, 'companies', companyId, 'members', uid), {
            role, name, email: emailKey, joinedAt: serverTimestamp(), inviteEmail: emailKey,
          });
          batch.set(doc(db, 'users', uid), { companyId, name, email: emailKey });
          batch.delete(doc(db, 'invites', emailKey));
        } else {
          const cRef = doc(collection(db, 'companies'));
          batch.set(cRef, {
            name: companyName || `Empresa de ${name}`,
            ownerUid: uid,
            plan: 'start',
            screenLimit: PLANS.start.screens,
            storageQuotaMB: PLANS.start.storageMB,
            storageUsedBytes: 0,
            screenSeq: 0,
            createdAt: serverTimestamp(),
          });
          batch.set(doc(db, 'companies', cRef.id, 'members', uid), {
            role: 'owner', name, email: emailKey, joinedAt: serverTimestamp(),
          });
          batch.set(doc(db, 'users', uid), { companyId: cRef.id, name, email: emailKey });
        }
        await batch.commit();
      },
    },

    watchDoc(path, cb, onErr) {
      return onSnapshot(doc(db, path), (s) => cb(snapDoc(s)), (e) => (onErr ? onErr(e) : console.error(path, e)));
    },
    watchCol(path, q, cb, onErr) {
      return onSnapshot(
        buildQuery(path, q),
        (s) => cb(s.docs.map(snapDoc)),
        (e) => (onErr ? onErr(e) : console.error(path, e)),
      );
    },
    async getDoc(path) {
      return snapDoc(await getDoc(doc(db, path)));
    },
    async getCol(path, q) {
      return (await getDocs(buildQuery(path, q))).docs.map(snapDoc);
    },
    newId(colPath) {
      return doc(collection(db, colPath)).id;
    },
    set: (path, data, merge = false) => setDoc(doc(db, path), out(data), { merge }),
    update: (path, data) => updateDoc(doc(db, path), out(data)),
    async add(colPath, data) {
      const r = await addDoc(collection(db, colPath), out(data));
      return r.id;
    },
    remove: (path) => deleteDoc(doc(db, path)),
    async batch(ops) {
      // O Firestore aceita até 500 operações por lote.
      for (let i = 0; i < ops.length; i += 450) {
        const b = writeBatch(db);
        for (const o of ops.slice(i, i + 450)) {
          const r = doc(db, o.path);
          if (o.op === 'delete') b.delete(r);
          else if (o.op === 'update') b.update(r, out(o.data));
          else b.set(r, out(o.data), { merge: !!o.merge });
        }
        await b.commit();
      }
    },

    /**
     * Pareamento por código. A TV (ou o GerenciaAI) criou `pairings/{code}` com o
     * uid anônimo dela; aqui o painel "reivindica" o código numa transação:
     * cria a tela/integração, registra `devices/{uid}` e marca o código como usado.
     */
    async claimPairing({ companyId, code, kind, name, unitId = null }) {
      code = normalizePairingCode(code);
      return runTransaction(db, async (tx) => {
        const pRef = doc(db, 'pairings', code);
        const cRef = doc(db, 'companies', companyId);
        const [pSnap, cSnap] = await Promise.all([tx.get(pRef), tx.get(cRef)]);
        if (!pSnap.exists()) throw new Error('Código não encontrado. Confira o que aparece na tela.');
        const p = pSnap.data();
        if (p.claimed) throw new Error('Este código já foi usado. A tela vai mostrar um novo em instantes.');
        if (p.expiresAt && p.expiresAt.toMillis() < Date.now()) throw new Error('Código expirado. Use o novo código que aparece na tela.');
        if (p.kind !== kind) {
          throw new Error(kind === PAIRING_KIND.SCREEN
            ? 'Este código é de uma integração. Use Empresa › Integrações.'
            : 'Este código é de uma tela. Use Telas › Parear tela.');
        }
        const company = cSnap.data();
        let targetId;
        if (kind === PAIRING_KIND.SCREEN) {
          const used = (await getDocs(collection(db, 'companies', companyId, 'screens'))).size;
          if (company.screenLimit && used >= company.screenLimit) {
            throw new Error(`Seu plano permite ${company.screenLimit} telas. Fale com a Vetta para ampliar.`);
          }
          const seq = (company.screenSeq || 0) + 1;
          const sRef = doc(collection(db, 'companies', companyId, 'screens'));
          targetId = sRef.id;
          tx.set(sRef, {
            code: screenCode(seq),
            name: name || screenCode(seq),
            unitId,
            groupIds: [],
            orientation: 'landscape',
            orderBoard: ORDER_BOARD_DEFAULTS,
            deviceUid: p.uid,
            platform: p.platform || null,
            appVersion: p.appVersion || null,
            pairedAt: serverTimestamp(),
            lastSeen: null,
          });
          tx.update(cRef, { screenSeq: seq });
        } else {
          targetId = p.uid;
          tx.set(doc(db, 'companies', companyId, 'integrations', p.uid), {
            name: name || 'GerenciaAI',
            type: p.integrationType || 'gerenciaai',
            unitId,
            deviceUid: p.uid,
            pairedAt: serverTimestamp(),
            lastSeen: null,
          });
        }
        tx.set(doc(db, 'devices', p.uid), { companyId, kind, targetId, unitId, pairingCode: code });
        tx.update(pRef, {
          claimed: true, companyId, targetId, companyName: company.name || '', claimedAt: serverTimestamp(),
        });
        return { id: targetId };
      });
    },

    upload(path, file, onProgress) {
      if (mediaBase) return uploadToMediaServer(path, file, onProgress);
      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(sref(storage, path), file, { contentType: file.type });
        task.on(
          'state_changed',
          (s) => onProgress?.(s.bytesTransferred / s.totalBytes),
          reject,
          async () => resolve({ url: await getDownloadURL(task.snapshot.ref) }),
        );
      });
    },
    async deleteFile(path) {
      if (mediaBase) {
        const res = await fetch(`${mediaBase}/v1/files/${path}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${await idToken()}` },
        });
        if (!res.ok && res.status !== 404) throw new Error(await mediaError(res));
        return;
      }
      try {
        await deleteObject(sref(storage, path));
      } catch (e) {
        if (e.code !== 'storage/object-not-found') throw e;
      }
    },
  };
}
