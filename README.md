# Vértice

Digital signage da Vetta Sistemas: mídias, ofertas e pedidos prontos nas TVs da loja, controlados de um painel só.

```
vertice/
├─ apps/panel/          Painel de gestão (React + Vite). Web no Firebase Hosting e desktop no Electron.
├─ apps/player/         Player da TV (React + Vite + Capacitor). APK Android e player web em /tv.
├─ packages/shared/     Regras de negócio, tokens do design system, fontes e logos (usado pelos dois apps).
├─ integrations/gerenciaai/  Módulo para o GerenciaAI enviar pedidos às TVs.
├─ firebase/            Regras do Firestore e do Storage, índices e testes das regras.
├─ e2e/                 Teste ponta a ponta (emuladores + Playwright).
└─ docs/ARQUITETURA.md  Como as peças conversam.
```

## Começar

```bash
npm install
npm run dev:panel:demo      # painel com dados de exemplo, sem Firebase (http://localhost:5173)
npm run dev:player          # player; sem .env ele abre a tela de pareamento de exemplo
```

Estados do player para conferir o visual: `http://localhost:5174/?demo=pairing` (também `play`, `overlay`, `sidebar`, `board`, `empty`, `offline`).

### Com Firebase de verdade

1. Projeto Firebase do Vértice: `vertice-7ffa0`. Usa **Authentication** (E-mail/senha e Anônimo) e **Firestore**. As mídias ficam no servidor próprio (`servers/media`), não no Firebase Storage.
2. Copie `apps/panel/.env.example` e `apps/player/.env.example` para `.env` e preencha com o app Web do projeto.
3. Troque `vertice-xxxx` em `.firebaserc` pelo id do projeto.
4. Publique as regras: `npm run deploy:rules`.
5. Ative a limpeza automática de pedidos (24 h):
   `gcloud firestore fields ttls update expireAt --collection-group=orders --enable-ttl`
6. Libere o download das mídias pelo player web (CORS do bucket):
   `gsutil cors set firebase/storage-cors.json gs://SEU_BUCKET`

### Desenvolvimento local com emuladores

```bash
npm run emulators           # auth, firestore e storage locais
# nos .env: VITE_FIREBASE_EMULATOR=1 e VITE_FIREBASE_PROJECT_ID=demo-vertice
```

## Testes

```bash
npm test                    # regras de negócio (status, pareamento, manifesto, pedidos)
npm run test:rules          # regras de segurança do Firestore no emulador
npm run e2e                 # fluxo completo: conta → parear TV → mídia → grade → GerenciaAI → pedido na TV
```

O e2e precisa de Java (emuladores) e de Python com Playwright (`pip install playwright && playwright install chromium`).

## Publicar e testar (Windows)

Na pasta do projeto, no PowerShell:

| O quê | Comando | Saída |
|---|---|---|
| Instalar dependências (1ª vez e quando o package.json mudar) | `npm install` | — |
| Servidor de mídias neste PC | `npm run midias` | ouve na porta 8787 |
| Painel Windows | `npm run win:painel` | `apps/panel/release/Vertice-Painel-Setup-x.y.z.exe` |
| Player Windows | `npm run win:player` | `apps/player/release/Vertice-Player-Setup-x.y.z.exe` |
| APK da TV | `npm run apk` | `apps/player/android/app/build/outputs/apk/debug/app-debug.apk` |
| Regras do Firestore | `npx firebase-tools deploy --only firestore` | — |
| Painel web + player web | `npm run deploy:hosting` | Firebase Hosting |

O APK precisa do Android SDK (instalado pelo Android Studio) e do JDK 21. Na primeira vez, crie `apps/player/android/local.properties` com `sdk.dir=C:\\Users\\SEU_USUARIO\\AppData\\Local\\Android\\Sdk`.

## Player: versões novas sobem sozinhas

O repositório fica no GitHub (`arthuraf2013-hue/vertice-releases`, público para as TVs baixarem sem senha).
Para lançar, faça um commit com a mensagem começando por `release:` e dê push na `main`. O GitHub Actions
(`.github/workflows/player-release.yml`) roda os testes, sobe a versão (`scripts/player-version.mjs`), gera o
instalador do Windows, o APK e o pacote de conteúdo, e publica a release com o `player-update.json`.

Cada TV lê esse manifesto (2 minutos depois de abrir e depois a cada hora) e se atualiza:

| Player | Como atualiza |
|---|---|
| Windows | Baixa o instalador, confere o SHA-512 e instala em silêncio. A TV fica uns 15 s sem conteúdo. |
| Android | O conteúdo novo (HTML/JS) entra sem reinstalar. Se a versão nova não abrir em 2 minutos, volta sozinha para a anterior. O APK só é reinstalado quando a parte nativa mudou (`android/`, plugins do Capacitor): no Android 12+ em silêncio depois da primeira vez; antes disso o operador confirma "Instalar" (menu › Atualizar agora, ou "Atualizar agora" no painel). |
| Navegador | Recarrega quando o `version.json` publicado muda (`npm run deploy:hosting`). |

Configuração única no GitHub (Settings › Secrets and variables › Actions): `PLAYER_ENV` com o conteúdo de
`apps/player/.env` e `ANDROID_KEYSTORE_BASE64` com a chave `apps/player/android/app/vertice-debug.keystore` em
base64. A chave não vai para o repositório (`.gitignore`): guarde uma cópia. Sem ela o Android recusa as atualizações.

## Player: menu do operador e controle remoto

A TV não tem cursor nem barra do sistema. Qualquer toque, movimento do mouse ou tecla do controle mostra o botão
**Menu** por 8 segundos (a tecla Menu do controle abre direto; Voltar fecha). No menu: recarregar, reiniciar,
fechar, sair da tela cheia (Windows), atalhos para as configurações do Android ou do Windows (Wi-Fi, tela, som,
permissões, tela inicial) e diagnóstico (internet, Firebase, servidor de mídias, espaço, erros recentes).

No painel, em Telas › (tela) › **Controle remoto**: identificar a TV, ver uma foto da tela, recarregar, reiniciar,
atualizar agora, abrir o menu na TV e ver o diagnóstico. Os comandos ficam em `screens/{id}/live/*` (regras em
`firebase/firestore.rules`) e precisam do player 0.3.0 ou mais novo.

No Windows o player reabre no mesmo monitor, posição e tamanho da última vez, em tela cheia ou em janela como
estava (`%APPDATA%\Vértice Player\janela.json`; lógica em `apps/player/electron/janela.cjs`). Fora da tela cheia a
janela tem barra de título para arrastar. Com mais de um monitor, o menu mostra **Trocar de monitor**. Se o
monitor salvo não estiver ligado, abre centralizado no principal.

## Planos

Contas novas nascem no plano **Start** (3 telas, 2 GB). Plano, limite de telas e cota só mudam pela Vetta, direto no Firestore (`companies/{id}`: `plan`, `screenLimit`, `storageQuotaMB`). As regras impedem o cliente de mudar esses campos.
