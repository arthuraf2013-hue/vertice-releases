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

## Fase 2 (já prevista na estrutura)

Capturas de tela (PRO), Aplicativos (hora e clima, barra inferior, QR Code, Google Sheets), Price, Relatórios. O manifesto e o player já separam "o que tocar" de "como mostrar", então os aplicativos entram como novos tipos de item no manifesto.
