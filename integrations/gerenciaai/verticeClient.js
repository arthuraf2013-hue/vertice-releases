/**
 * Instância única da integração com o Vértice, já apontando para o projeto da Vetta (vertice-7ffa0).
 * Copie para o GerenciaAI junto com verticeSync.js (ex.: src/integrations/vertice/).
 *
 * Esta configuração é do app Web do Firebase do Vértice. Ela fica visível no app de propósito:
 * quem protege os dados são as regras do Firestore (o caixa só escreve pedidos da própria unidade).
 */
import { createVerticeSync } from './verticeSync';
import pkg from '../../../package.json'; // ajuste o caminho até o package.json do GerenciaAI

export const VERTICE_FIREBASE = {
  apiKey: 'AIzaSyC_jEusdUXEY1xEpiZe8ArkVMDWrAAGx-8',
  authDomain: 'vertice-7ffa0.firebaseapp.com',
  projectId: 'vertice-7ffa0',
  storageBucket: 'vertice-7ffa0.firebasestorage.app',
  messagingSenderId: '124691310670',
  appId: '1:124691310670:web:81b4b1b9cacd15f29b3b1f',
};

export const vertice = createVerticeSync({
  firebaseConfig: VERTICE_FIREBASE,
  terminal: 'Caixa', // troque pelo nome do PDV (ou chame vertice.setTerminal(nome) depois de carregar as configurações)
  appVersion: pkg.version,
});

vertice.start();
