# Arquitetura do Vértice

## As peças

```
 Painel (web/Electron) ──escreve──▶ Firestore ◀──ouve── Player (TV)
        │                              ▲                   │
        └──sobe mídia──▶ Storage ──────┼──── baixa mídia ──┘
                                       │
                       GerenciaAI ─────┘ escreve pedidos
```

Um projeto Firebase só para o Vértice. Três tipos de acesso:

| Quem | Como entra | O que pode |
|---|---|---|
| Pessoas do painel | E-mail e senha | Conforme o papel: leitor < editor < admin < proprietário |
| TV | Usuário anônimo + código de pareamento | Ler o próprio manifesto, os pedidos e os comandos do painel; atualizar o próprio sinal de vida; gravar o próprio diagnóstico e a foto da tela (`screens/{id}/live`) |
| GerenciaAI | Usuário anônimo + código de pareamento | Criar e atualizar os próprios pedidos, da própria unidade |

## Pareamento por código

1. A TV (ou o GerenciaAI) entra como usuário anônimo e cria `pairings/{CÓDIGO}` com o próprio uid. O código tem 6 caracteres, sem 0/O/1/I/L, e vale 30 minutos.
2. No painel, um admin digita o código. Uma transação cria a tela (`companies/{id}/screens/{tela}`) ou a integração, cria `devices/{uid}` com a empresa e marca o código como usado.
3. A TV está ouvindo `devices/{uid}`: quando o registro aparece, ela passa a ouvir o manifesto.
4. Desconectar no painel apaga `devices/{uid}`. A TV percebe e volta a mostrar um código novo.

As regras garantem que `devices/{uid}` só nasce junto com a reivindicação de um código daquele mesmo aparelho. Ninguém forja um pareamento.

## O manifesto: por que o player é leve

Em vez de a TV ouvir telas, grades, playlists e mídias (dezenas de leituras e lógica pesada na TV Box), o painel compila tudo que uma tela precisa num documento só: `companies/{id}/manifests/{tela}`.

- O manifesto tem as faixas de horário já com os itens expandidos (URL, duração, validade), a playlist padrão, a lista de arquivos e a configuração do painel de pedidos.
- O painel recompila ao publicar/despublicar grade, salvar playlist, excluir mídia, mudar uma tela e parear tela nova (`apps/panel/src/data/manifests.js`).
- A TV ouve **um** documento, decide localmente o que toca agora (`resolveNow` em `packages/shared/src/manifest.js`) e baixa só os arquivos listados.

## Offline

- **TV:** baixa cada mídia para o armazenamento interno (grava `.part` e só renomeia no fim). Guarda o último manifesto e o pareamento no aparelho. Sem internet, continua tocando a grade. Mídias que saíram do manifesto são apagadas.
- **Painel:** cache do Firestore no navegador; abre com os últimos dados.
- **GerenciaAI:** os envios entram na fila do Firestore e saem quando a internet volta.

## Situação das telas

A TV manda um sinal de vida por minuto (`lastSeen` com a hora do servidor, versão, o que está no ar, progresso do download). O painel calcula:

| Situação | Regra |
|---|---|
| Online | Contato nos últimos 15 min |
| Sincronizando | Online e baixando mídias |
| Atenção | 15 a 60 min sem contato, ou app abaixo da versão mínima |
| Offline | Mais de 60 min sem contato |
| Aguardando | Pareada, mas nunca deu sinal |

## Pedidos do GerenciaAI

- Id do pedido: `{uidDoCaixa}_{idDaVenda}`. Reenviar não duplica.
- Estados: `preparing` → `ready` → `delivered`. Cancelar apaga.
- Cada caixa pertence a uma unidade; as regras impedem enviar pedido para outra unidade.
- Nome do cliente: o módulo envia só "Maria S." por padrão (LGPD: o mínimo necessário). Cada tela escolhe como mostrar.
- Pedidos somem do banco 24 h depois (TTL no campo `expireAt`).

Na TV, três modos (por tela, em Telas › configurar tela):

| Modo | Comportamento |
|---|---|
| Aviso em tela cheia | Interrompe a mídia por alguns segundos com número e nome, e volta |
| Coluna lateral | Mídia à esquerda; prontos e em preparo à direita |
| Painel dedicado | A TV inteira vira o painel de retirada |

## Coleções do Firestore

```
users/{uid}                         companyId, name, email
invites/{email}                     companyId, role
pairings/{código}                   kind, uid, claimed, expiresAt, companyId, targetId
devices/{uid}                       companyId, kind, targetId, unitId, pairingCode
companies/{id}                      name, plan, screenLimit, storageQuotaMB, storageUsedBytes, screenSeq
  members/{uid}                     role, name, email
  units/{id} · groups/{id}
  screens/{id}                      code (VTX-0001), name, unitId, groupIds, orientation, orderBoard, lastSeen…
  media/{id}                        name, type, url, sizeBytes, durationSec, storagePath
  playlists/{id}                    name, items[{mediaId, durationSec, validFrom, validTo}]
  schedules/{id}                    name, status, priority, groupIds, screenIds, slots[], fallbackPlaylistId
  manifests/{screenId}              (compilado pelo painel)
  integrations/{uid}                name, type, unitId, lastSeen
  orders/{uid_venda}                number, customerName, status, unitId, readyAt, expireAt
```

## Fase 2: Aplicativos, Price, Capturas e Relatórios

### Aplicativos

- Cada aplicativo configurado é uma **mídia do tipo `app`**: `media/{id}` com `type: 'app'` e `app: { kind, config }`. Por isso entra nas playlists, grades e validade como qualquer imagem.
- Tipos (`APP_KINDS` em `packages/shared/src/apps.js`): relógio, avisos (faixa correndo), clima (Open-Meteo, sem chave), notícias (RSS/Atom), site, YouTube e tabela de preços.
- O desenho fica num componente só, `packages/shared/src/apps/AppView.jsx`, usado pelo player e pela prévia do painel. É desenhado num quadro fixo (1920×1080 ou 1080×1920) e escalado, então fica igual em qualquer TV.
- No manifesto, o item de app não tem `url` nem entra em `assets` (nada para baixar). Leva `app` e a duração.
- O player busca clima e notícias e guarda no aparelho (clima por 30 min, notícias por 15 min). Sem internet, mostra o último que conseguiu. As notícias passam pelo `host.fetchText` (Android nativo e Electron, sem CORS); no player web, só funcionam feeds que liberam CORS.

### Price

- `companies/{id}/priceLists/{lista}`: título, subtítulo, rodapé, cores, formato (lista ou cartões) e itens (`name`, `unit`, `price`, `promoPrice`, `highlight`, `hidden`).
- Cada tabela tem uma mídia de app ligada, com id `price_{lista}` (`priceMediaId`). Ela é o que entra nas playlists.
- Ao salvar, o painel recompila os manifestos e os preços já vão **dentro** do manifesto (`app.data`, via `priceListForTv`). A TV não lê `priceLists`.
- Importação de planilha CSV (Excel ou Google Sheets, separador `;` ou `,`). Reconhece as colunas Produto, Unidade, Preço, Oferta e Categoria em qualquer ordem.

### Capturas

- O comando `screenshot` (controle remoto) já existia. Agora a TV também guarda a foto no histórico `screens/{id}/captures/{ms}` e mantém as 12 últimas.
- A página Capturas mostra a última foto de cada tela, pede foto de todas as telas online de uma vez (só admin) e abre o histórico de cada uma.

### Relatórios

- A TV soma no aparelho cada exibição (uma vez e o tempo na tela) e, a cada 5 minutos, grava os **totais do dia** em `playStats/{tela}_{AAAA-MM-DD}`: `{ screenId, date, items: { [mediaId]: { plays, seconds, name } } }`.
- Gravar o total, e não um "+1", deixa o envio repetível: se cair a internet, a TV manda de novo sem duplicar.
- Mídia fixada para ajuste (Fixar na TV) não conta.
- O painel soma por mídia, por tela ou por dia (`aggregatePlays`) e exporta CSV para Excel (`toCsv`).
- Players anteriores a esta versão não mandam exibições.

### Regras novas

| Coleção | Quem lê | Quem grava |
|---|---|---|
| `priceLists/{id}` | membros | editor ou acima |
| `playStats/{tela}_{dia}` | membros | só a própria TV, com id, data e campos conferidos |
| `screens/{id}/captures/{id}` | membros e a própria TV | a própria TV (JPEG até ~900 KB); apaga: a TV ou admin |

## Fase 3: Estúdio, Video wall, Anunciantes, QR Code e Google Sheets

### QR Code e Google Sheets (aplicativos)

- **QR Code** (`qr`): link, Wi-Fi, Pix copia e cola ou texto. O QR é gerado na própria TV (`packages/shared/src/qr.js`, biblioteca `qrcode-generator`), sem internet.
  - Pix: BR Code estático do Banco Central (`pixPayload`), com CRC16-CCITT. Valor opcional aceita "9,90". Antes de usar nas telas, confira lendo a prévia com o app do banco.
- **Google Sheets** (`sheet`): `sheetCsvUrl` transforma o link de compartilhar ou de "Publicar na Web" no endereço do CSV. A TV lê pelo `host.fetchText` (sem CORS), guarda por 5 minutos e mostra até 30 linhas e 6 colunas.

### Estúdio

- Uma peça é uma mídia `type: 'app'` com `app.kind: 'studio'` e `config: { template, theme, colors, imageMediaId, fields }`.
- Modelos em `packages/shared/src/studio.js`: oferta, aviso, cardápio do dia, boas-vindas e evento. Cada um define os próprios campos.
- A peça é desenhada ao vivo na TV (`AppView`): mudar um preço não exige refazer arte.
- Foto da biblioteca: o manifesto põe `app.image` e a foto entra em `assets` (`extraAssets` no item), então a TV baixa e mostra offline.

### Anunciantes

- `advertisers/{id}`: nome, CNPJ ou CPF, contato, telefone, e-mail, contrato (de/até) e observações.
- A mídia tem `advertiserId`, definido em Mídias › Ajustar ou na página do anunciante. O manifesto leva o anunciante em cada item, e a TV grava `adv` junto com a exibição em `playStats`.
- Relatórios agrupam por anunciante (`aggregatePlays(docs, 'advertiser', { advertiserOf })`). Registros antigos sem `adv` usam o anunciante atual da mídia.
- "Relatório para o cliente": página de comprovação de exibição, para imprimir ou salvar em PDF (por mídia, por tela e por dia).

### Video wall

- `videowalls/{id}`: `{ name, rows, cols, cells: [screenId|null], playlistId, bezel, active }`, com grade de até 4×4.
- `buildManifest` (com `walls`) põe `wall: { rows, cols, row, col, bezel }` no manifesto da TV e troca a programação dela pela playlist do wall.
- O player (`WallPlayback`) desenha o conteúdo do tamanho do wall inteiro, contando as molduras (`wallCrop`), e desloca para mostrar só o pedaço desta TV.
- **Sincronia pelo relógio:**
  - Todas as TVs calculam o mesmo item e o mesmo segundo (`wallPosition`: agora mod duração total da playlist). Vídeo começa no segundo certo.
  - A diferença entre o relógio da TV e o do servidor é medida no sinal de vida (só nas TVs de wall) e corrigida.
  - Não precisa de TV "mestre" nem de rede entre as TVs.
- O som sai só da TV do canto de cima à esquerda.
- Aplicativos e peças esticam o quadro para a proporção do wall.
- Vídeo sem duração conhecida conta 30 s. Defina o tempo na playlist do wall.

### Regras novas (Fase 3)

| Coleção | Quem lê | Quem grava |
|---|---|---|
| `advertisers/{id}` | membros | editor ou acima |
| `videowalls/{id}` | membros | editor ou acima |

## Atualização automática do player (com redundância)

- **Publicação** (`.github/workflows/player-release.yml`, disparada por commit `release:`):
  - Windows, APK e conteúdo Android saem em jobs separados. A release publica o que deu certo: uma falha no APK não segura o Windows nem o conteúdo das TVs Android.
  - A chave do APK (`ANDROID_KEYSTORE_BASE64`) é opcional. Sem ela, ou com ela quebrada, a versão sai sem APK novo, com um aviso. O build limpa sujeira do texto colado (BOM, espaço não separável, linhas do `certutil`) e mostra a impressão da chave (a certa: `6fe4b187e02fcfe4`).
  - Sem arquivo novo de um sistema, o manifesto mantém o da versão anterior (`scripts/player-manifest.mjs`).
  - Se a parte nativa mudou e o APK não saiu, as TVs Android não aplicam o conteúdo novo (`minNativeCode`). Esperam a próxima versão com APK.
- **Três caminhos para o manifesto e os arquivos pequenos:**
  - GitHub Releases (`releases/latest/download/player-update.json`).
  - Ramo `updates` pelo raw.githubusercontent.com.
  - Ramo `updates` pelo jsDelivr.
  - O ramo `updates` é refeito a cada versão (manifesto, conteúdo e APK). O instalador do Windows fica só na release.
- **No player:**
  - Lê o manifesto nos três endereços ao mesmo tempo e fica com a versão mais nova (`newestManifest`). Um espelho atrasado não faz voltar de versão.
  - Baixa do principal e, se falhar, dos espelhos (`downloadUrls`).
  - Erro: tenta de novo em 5, 10, 20, 40 e 60 minutos (`retryDelayMs`), e na hora em que a internet volta.
  - Confere de hora em hora e logo depois de ligar. "Atualizar agora" no painel força a checagem.
- **Aplicação:**
  - Windows: instalador silencioso (`/S`).
  - Android: conteúdo novo em silêncio, sem reinstalar. O APK novo (só quando a parte nativa muda) instala sozinho onde o Android deixa; senão espera o "Instalar" do operador.
- **Painel › Downloads › Atualização das telas:** versão publicada (lida do ramo `updates`, que libera CORS), versão de cada TV e o botão "Atualizar agora" para as desatualizadas.
