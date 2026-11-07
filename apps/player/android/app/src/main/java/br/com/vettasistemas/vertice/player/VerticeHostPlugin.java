package br.com.vettasistemas.vertice.player;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Ponte do player com o Android: menu do operador (configurações, reiniciar, fechar),
 * diagnóstico (armazenamento, foto da tela) e atualização automática.
 *
 * Atualização em duas camadas:
 *  1. Conteúdo (HTML/JS/CSS do player): baixa um .zip, confere o SHA-256, descompacta em
 *     files/web/<versão> e o Capacitor passa a servir de lá. Silencioso, sem reinstalar.
 *     Se a versão nova não confirmar que abriu (markReady) em 2 minutos, volta sozinha para
 *     a versão que veio no APK e não tenta mais aquela versão.
 *  2. APK (só quando a parte nativa muda): instala pelo PackageInstaller. No Android 12+,
 *     depois que o próprio player já se atualizou uma vez, a instalação é silenciosa; antes
 *     disso o Android pede um "Instalar" na tela, que só abrimos quando o operador pede.
 */
@CapacitorPlugin(name = "VerticeHost")
public class VerticeHostPlugin extends Plugin {
    private static final String TAG = "VerticeHost";
    private static final String PREFS = "VerticeHost";
    private static final String CAP_PREFS = "CapWebViewSettings"; // com.getcapacitor.plugin.WebView
    private static final String CAP_SERVER_PATH = "serverBasePath";
    private static final long CONFIRMAR_EM_MS = 120_000;
    private static final int TIMEOUT_MS = 30_000;
    static final String ACTION_INSTALL = "br.com.vettasistemas.vertice.player.INSTALL_STATUS";

    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable vigia;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public void load() {
        // Roda antes de o WebView abrir: se a última versão do conteúdo não confirmou, desfaz já.
        SharedPreferences p = prefs();
        // APK novo instalado: o Capacitor volta ao conteúdo de dentro do APK; esquece o pacote antigo.
        long nativo = codigoNativo();
        if (p.getString("webPath", null) != null && p.getLong("webForNative", -1) != nativo) {
            p.edit().remove("webVersion").remove("webPath").putBoolean("webPending", false).putInt("webAttempts", 0).apply();
            getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_SERVER_PATH, "").apply();
        }
        if ("installing".equals(p.getString("apkStatus", null))) p.edit().remove("apkStatus").apply();
        if (p.getBoolean("webPending", false)) {
            int tentativas = p.getInt("webAttempts", 0) + 1;
            p.edit().putInt("webAttempts", tentativas).apply();
            if (tentativas >= 3) {
                desfazerConteudo("não abriu em 3 tentativas", false);
            } else {
                vigiar();
            }
        }
    }

    /** Tela recriada (Reiniciar): o vigia passa para a instância nova do plugin. */
    @Override
    protected void handleOnDestroy() {
        cancelarVigia();
        super.handleOnDestroy();
    }

    private long codigoNativo() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return PackageInfoCompat.getLongVersionCode(pi);
        } catch (Exception e) {
            return -1;
        }
    }

    /* ---------------- Informações ---------------- */

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("versionName", pi.versionName);
            r.put("versionCode", PackageInfoCompat.getLongVersionCode(pi));
        } catch (Exception e) {
            r.put("versionName", "");
        }
        SharedPreferences p = prefs();
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        r.put("canInstall", podeInstalar());
        r.put("webVersion", p.getString("webVersion", null));
        r.put("webPending", p.getBoolean("webPending", false));
        r.put("apkStatus", p.getString("apkStatus", null));
        JSArray ruins = new JSArray();
        for (String v : p.getStringSet("badWeb", new HashSet<>())) ruins.put(v);
        r.put("badWeb", ruins);
        call.resolve(r);
    }

    @PluginMethod
    public void storage(PluginCall call) {
        JSObject r = new JSObject();
        StatFs st = new StatFs(getContext().getFilesDir().getAbsolutePath());
        r.put("freeBytes", st.getAvailableBytes());
        r.put("totalBytes", st.getTotalBytes());
        long[] media = tamanho(new File(getContext().getFilesDir(), "vx-media"));
        r.put("mediaBytes", media[0]);
        r.put("mediaFiles", media[1]);
        call.resolve(r);
    }

    private long[] tamanho(File dir) {
        long bytes = 0, arquivos = 0;
        File[] lista = dir.listFiles();
        if (lista != null) {
            for (File f : lista) {
                if (f.isFile()) {
                    bytes += f.length();
                    arquivos++;
                }
            }
        }
        return new long[] { bytes, arquivos };
    }

    /* ---------------- Menu do operador ---------------- */

    @PluginMethod
    public void openSettings(PluginCall call) {
        String tela = call.getString("screen", "geral");
        Uri pacote = Uri.parse("package:" + getContext().getPackageName());
        Intent i;
        switch (tela) {
            case "wifi": i = new Intent(Settings.ACTION_WIFI_SETTINGS); break;
            case "tela": i = new Intent(Settings.ACTION_DISPLAY_SETTINGS); break;
            case "som": i = new Intent(Settings.ACTION_SOUND_SETTINGS); break;
            case "data": i = new Intent(Settings.ACTION_DATE_SETTINGS); break;
            case "armazenamento": i = new Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS); break;
            case "app": i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pacote); break;
            case "sobrepor": i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pacote); break;
            case "instalar":
                i = Build.VERSION.SDK_INT >= 26 ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, pacote) : new Intent(Settings.ACTION_SECURITY_SETTINGS);
                break;
            case "inicial": i = new Intent(Settings.ACTION_HOME_SETTINGS); break;
            default: i = new Intent(Settings.ACTION_SETTINGS);
        }
        boolean abriu = abrir(i);
        // TV Box com Android "capado" não tem algumas telas: cai na configuração geral.
        if (!abriu) abriu = abrir(new Intent(Settings.ACTION_SETTINGS));
        JSObject r = new JSObject();
        r.put("opened", abriu);
        call.resolve(r);
    }

    private boolean abrir(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    /** Lista as telas iniciais instaladas para abrir outra (o player costuma ser a padrão). */
    @PluginMethod
    public void otherLauncher(PluginCall call) {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        boolean ok = abrir(Intent.createChooser(home, "Abrir com"));
        JSObject r = new JSObject();
        r.put("opened", ok);
        call.resolve(r);
    }

    /** Recria a tela do player (WebView do zero), sem matar o processo. */
    @PluginMethod
    public void restart(PluginCall call) {
        call.resolve();
        Activity a = getActivity();
        if (a != null) main.postDelayed(a::recreate, 300);
    }

    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve();
        Activity a = getActivity();
        if (a != null) main.postDelayed(a::finishAndRemoveTask, 300);
    }

    /** Foto do que está na tela (vídeos podem sair pretos: o Android desenha vídeo à parte). */
    @PluginMethod
    public void screenshot(PluginCall call) {
        main.post(() -> {
            try {
                WebView v = getBridge().getWebView();
                int w = Math.max(1, v.getWidth());
                int h = Math.max(1, v.getHeight());
                Bitmap full = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
                v.draw(new Canvas(full));
                Bitmap menor = w > 960 ? Bitmap.createScaledBitmap(full, 960, Math.max(1, h * 960 / w), true) : full;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                menor.compress(Bitmap.CompressFormat.JPEG, 62, out);
                JSObject r = new JSObject();
                r.put("image", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não foi possível tirar a foto da tela: " + e.getMessage());
            }
        });
    }

    /* ---------------- Rede ---------------- */

    /** GET de texto pelo Android (sem CORS). Usado para ler o manifesto de atualização. */
    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        new Thread(() -> {
            try {
                HttpURLConnection c = conectar(url);
                byte[] corpo = lerTudo(c.getInputStream(), 512 * 1024);
                JSObject r = new JSObject();
                r.put("status", c.getResponseCode());
                r.put("text", new String(corpo, "UTF-8"));
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    private HttpURLConnection conectar(String endereco) throws IOException {
        if (endereco == null || !endereco.startsWith("https://")) throw new IOException("Endereço inválido");
        URL url = new URL(endereco);
        // Segue redirecionamentos (o GitHub manda para outro domínio, o que o HttpURLConnection não segue sozinho).
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "VerticePlayer");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String destino = c.getHeaderField("Location");
                c.disconnect();
                if (destino == null) throw new IOException("Redirecionamento sem destino");
                url = new URL(url, destino);
                if (!"https".equals(url.getProtocol())) throw new IOException("Redirecionamento inseguro");
                continue;
            }
            if (code != 200) throw new IOException("Servidor respondeu " + code);
            return c;
        }
        throw new IOException("Redirecionamentos demais");
    }

    private static byte[] lerTudo(InputStream in, int limite) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > limite) throw new IOException("Resposta grande demais");
        }
        in.close();
        return out.toByteArray();
    }

    /** Baixa para um arquivo conferindo o SHA-256 (hex). */
    private void baixar(String url, File destino, String sha256) throws Exception {
        File parcial = new File(destino.getPath() + ".part");
        HttpURLConnection c = conectar(url);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(parcial)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
                out.write(buf, 0, n);
            }
        }
        String hex = hex(md.digest());
        if (sha256 != null && !sha256.isEmpty() && !sha256.equalsIgnoreCase(hex)) {
            parcial.delete();
            throw new IOException("Arquivo baixado não confere (SHA-256)");
        }
        if (destino.exists()) destino.delete();
        if (!parcial.renameTo(destino)) throw new IOException("Não foi possível salvar o arquivo");
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /* ---------------- Atualização do conteúdo (silenciosa) ---------------- */

    @PluginMethod
    public void applyWebBundle(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha256");
        String versao = call.getString("version", "");
        if (!versao.matches("[0-9]+(\\.[0-9]+){0,3}")) {
            call.reject("Versão inválida");
            return;
        }
        new Thread(() -> {
            File base = new File(getContext().getFilesDir(), "web");
            File zip = new File(getContext().getCacheDir(), "web-" + versao + ".zip");
            File pasta = new File(base, versao);
            try {
                base.mkdirs();
                baixar(url, zip, sha);
                apagar(pasta);
                descompactar(zip, pasta);
                zip.delete();
                if (!new File(pasta, "index.html").isFile()) throw new IOException("Pacote sem index.html");
                prefs().edit()
                    .putString("webVersion", versao)
                    .putString("webPath", pasta.getAbsolutePath())
                    .putBoolean("webPending", true)
                    .putInt("webAttempts", 0)
                    .putLong("webForNative", codigoNativo())
                    .apply();
                getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit()
                    .putString(CAP_SERVER_PATH, pasta.getAbsolutePath()).apply();
                call.resolve();
                // Troca o conteúdo e recarrega. O vigia desfaz se a versão nova não confirmar.
                main.post(() -> {
                    vigiar();
                    getBridge().setServerBasePath(pasta.getAbsolutePath());
                });
            } catch (Exception e) {
                zip.delete();
                apagar(pasta);
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    /** O conteúdo novo abriu direito: fica valendo e as versões antigas são apagadas. */
    @PluginMethod
    public void markReady(PluginCall call) {
        cancelarVigia();
        SharedPreferences p = prefs();
        if (p.getBoolean("webPending", false)) {
            p.edit().putBoolean("webPending", false).putInt("webAttempts", 0).apply();
        }
        String atual = p.getString("webPath", null);
        File[] versoes = new File(getContext().getFilesDir(), "web").listFiles();
        if (versoes != null) {
            for (File f : versoes) {
                if (atual == null || !f.getAbsolutePath().equals(atual)) apagar(f);
            }
        }
        call.resolve();
    }

    /** Volta para o conteúdo que veio dentro do APK. */
    @PluginMethod
    public void resetWeb(PluginCall call) {
        call.resolve();
        main.post(() -> desfazerConteudo(null, true));
    }

    private void vigiar() {
        cancelarVigia();
        vigia = () -> desfazerConteudo("não confirmou que abriu", true);
        main.postDelayed(vigia, CONFIRMAR_EM_MS);
    }

    private void cancelarVigia() {
        if (vigia != null) main.removeCallbacks(vigia);
        vigia = null;
    }

    private void desfazerConteudo(String motivo, boolean recarregar) {
        cancelarVigia();
        SharedPreferences p = prefs();
        String versao = p.getString("webVersion", null);
        SharedPreferences.Editor e = p.edit()
            .remove("webVersion").remove("webPath").putBoolean("webPending", false).putInt("webAttempts", 0);
        if (motivo != null && versao != null) {
            Set<String> ruins = new HashSet<>(p.getStringSet("badWeb", new HashSet<>()));
            ruins.add(versao);
            e.putStringSet("badWeb", ruins);
            Log.w(TAG, "Conteúdo " + versao + " desfeito: " + motivo);
        }
        e.apply();
        getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_SERVER_PATH, "").apply();
        if (recarregar && getBridge() != null) getBridge().setServerAssetPath("public");
    }

    private static void descompactar(File zip, File destino) throws IOException {
        destino.mkdirs();
        String raiz = destino.getCanonicalPath() + File.separator;
        try (ZipInputStream in = new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry e;
            byte[] buf = new byte[65536];
            while ((e = in.getNextEntry()) != null) {
                File f = new File(destino, e.getName());
                // Nada de "../": cada arquivo tem que ficar dentro da pasta da versão.
                if (!f.getCanonicalPath().startsWith(raiz)) throw new IOException("Pacote inválido");
                if (e.isDirectory()) {
                    f.mkdirs();
                    continue;
                }
                File pai = f.getParentFile();
                if (pai != null) pai.mkdirs();
                try (OutputStream out = new FileOutputStream(f)) {
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
    }

    private static void apagar(File f) {
        if (f == null || !f.exists()) return;
        File[] filhos = f.listFiles();
        if (filhos != null) for (File c : filhos) apagar(c);
        f.delete();
    }

    /* ---------------- Atualização do APK ---------------- */

    private boolean podeInstalar() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /**
     * Baixa e instala o APK novo. interactive=false (automático): só instala se o Android deixar
     * sem perguntar; senão guarda "needs-confirmation" e espera o operador. interactive=true: abre
     * o pedido de permissão ou a confirmação "Instalar" na tela.
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha256");
        boolean interativo = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        if (!podeInstalar()) {
            prefs().edit().putString("apkStatus", "needs-permission").apply();
            if (interativo) abrir(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
            JSObject r = new JSObject();
            r.put("status", "needs-permission");
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            File apk = new File(getContext().getCacheDir(), "atualizacao.apk");
            try {
                baixar(url, apk, sha);
                prefs().edit().putString("apkStatus", "installing").apply();
                instalar(apk, interativo);
                JSObject r = new JSObject();
                r.put("status", "installing");
                call.resolve(r);
            } catch (Exception e) {
                prefs().edit().putString("apkStatus", "error: " + e.getMessage()).apply();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    private void instalar(File apk, boolean interativo) throws IOException {
        PackageInstaller pi = getContext().getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("vertice.apk", 0, apk.length())) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            }
            Intent status = new Intent(getContext(), InstallReceiver.class).setAction(ACTION_INSTALL).putExtra("interactive", interativo);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pi2 = PendingIntent.getBroadcast(getContext(), id, status, flags);
            s.commit(pi2.getIntentSender());
        }
    }
}
