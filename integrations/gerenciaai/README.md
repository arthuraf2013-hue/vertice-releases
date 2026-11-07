# Integração GerenciaAI → Vértice

Quando um pedido fica pronto no GerenciaAI, as TVs da loja mostram o número e o nome do cliente.

## Como funciona

```
GerenciaAI (caixa)  ──código de conexão──▶  painel Vértice (Empresa › Integrações)
        │
        └─ orderPreparing / orderReady / orderDelivered ──▶ Firestore do Vértice ──▶ TVs da mesma unidade
```

- **Conexão por código, igual às TVs.** O GerenciaAI mostra um código de 6 letras e um admin digita esse código no painel Vértice. O painel decide de qual empresa e de qual unidade é aquele caixa. O GerenciaAI nunca recebe senha nem chave do Vértice.
- **Projeto Firebase separado.** O módulo abre um app Firebase com o nome `vertice`, isolado do Firebase de licenciamento e da sincronização multi-PDV do GerenciaAI. Um não enxerga o outro.
- **Não trava a venda.** As chamadas não precisam de `await`. Sem internet, o Firestore guarda os pedidos e envia quando a conexão volta.
- **Seguro por regra, não por confiança.** O caixa só consegue escrever pedidos da própria unidade, com os campos esperados. Se for desconectado no painel, perde o acesso na hora.

## 1. Copiar os arquivos

Para `src/integrations/vertice/` do GerenciaAI:

| Arquivo | O que é |
|---|---|
| `verticeSync.js` | O módulo (pareamento, envio, fila, estado) |
| `verticeClient.js` | Instância única já configurada para o projeto `vertice-7ffa0` |
| `VerticeSettings.jsx` | Tela de configurações (ajuste os estilos aos componentes do GerenciaAI) |

O módulo usa o pacote `firebase` (v10 ou mais novo) que o GerenciaAI já tem. Ele roda no **renderer** (interface), porque é o IndexedDB do renderer que guarda a identidade do caixa entre reinícios.

> **CSP:** se o `index.html` do GerenciaAI tiver Content-Security-Policy, o `connect-src` precisa liberar `https://firestore.googleapis.com`, `https://identitytoolkit.googleapis.com` e `https://securetoken.googleapis.com`. Normalmente já estão liberados, porque o licenciamento usa os mesmos endereços.

## 2. Iniciar

Importe `verticeClient.js` uma vez, no começo do app (por exemplo, no `main.jsx` do renderer):

```js
import { vertice } from '@/integrations/vertice/verticeClient';
// Depois de carregar as configurações do PDV:
vertice.setTerminal(config.nomeDoCaixa); // ex.: "Caixa 1", "Balcão", "Cozinha"
```

## 3. Tela de configuração

Em **Configurações › Integrações › Vértice**:

```jsx
import { vertice } from '@/integrations/vertice/verticeClient';
import { VerticeSettings } from '@/integrations/vertice/VerticeSettings';

<VerticeSettings vx={vertice} />
```

1. No GerenciaAI, clique em **Gerar código de conexão**.
2. No painel Vértice, abra **Empresa › Integrações › Conectar caixa**, digite o código e escolha a unidade.
3. A tela do GerenciaAI muda sozinha para "Conectado".
4. Clique em **Enviar pedido de teste**. O pedido "TESTE" aparece nas TVs da unidade por 1 minuto.

Para os pedidos aparecerem, a TV precisa estar na mesma unidade do caixa e ter o painel de pedidos ligado em **Telas › configurar tela › Painel de pedidos**.

## 4. Avisar os pedidos

`sale` precisa de `id` (único no GerenciaAI) e `number` (o que aparece na TV, até 12 caracteres). `customerName` e `createdAt` são opcionais.

```js
import { vertice } from '@/integrations/vertice/verticeClient';

vertice.orderPreparing({ id: venda.id, number: venda.numeroPedido, customerName: venda.cliente?.nome, createdAt: venda.criadaEm });
vertice.orderReady({ id: venda.id, number: venda.numeroPedido, customerName: venda.cliente?.nome });
vertice.orderDelivered({ id: venda.id, number: venda.numeroPedido });
vertice.orderCancelled({ id: venda.id });
```

| Chamada | Na TV |
|---|---|
| `orderPreparing` | Entra em "Em preparo" (se a tela mostrar essa lista) |
| `orderReady` | Aviso e/ou destaque em "Prontos". Cria o pedido se ele ainda não existir |
| `orderDelivered` | Sai da TV |
| `orderCancelled` | Apaga o pedido |

Chamar duas vezes não duplica nada: o id do pedido no Vértice é `{caixa}_{idDaVenda}`.

### Onde ligar no GerenciaAI

- **Módulo Delivery:** nas transições de status da fila: em preparo → `orderPreparing`, pronto → `orderReady`, saiu ou entregue → `orderDelivered`, cancelado → `orderCancelled`.
- **Balcão com senha/pedido:** ao finalizar a venda que vai para preparo, chame `orderPreparing`. No botão "Pedido pronto", chame `orderReady`.
- **Só avisa quando fica pronto:** chame `orderReady` direto.

### Número do pedido

Use o número que o cliente recebe (senha, comanda ou número do pedido). Se o GerenciaAI não tiver um, uma sequência diária curta funciona bem na TV (1, 2, 3…, recomeçando todo dia). Pode ser `COUNT(*) + 1` das vendas de hoje, com `timeService.hojeLocalISO()`. Evite usar o id interno da venda.

## Multi-PDV

Cada máquina que chama `orderReady` precisa estar conectada (cada uma gera o próprio código). Em geral basta conectar o caixa ou a cozinha onde o pedido é marcado como pronto. Todos os caixas da mesma unidade alimentam as mesmas TVs.

## Estado (para suporte)

`vertice.onState(fn)` e `vertice.getState()` devolvem:

| Campo | Significado |
|---|---|
| `status` | `starting`, `unpaired`, `pairing`, `paired` ou `error` |
| `companyName`, `unitId`, `terminal` | A que empresa e unidade o caixa está ligado, e com que nome |
| `pending` | Pedidos aguardando internet |
| `lastSentAt` | Último pedido confirmado pelo servidor |
| `lastError` | Último erro de envio. "Recusou" quase sempre quer dizer que o caixa foi desconectado no painel |

`vertice.debugOrder(idDaVenda)` lê o pedido como está no servidor.

## Privacidade (LGPD)

Por padrão vai só o primeiro nome e a inicial ("Maria S."). Para enviar o nome completo, passe `sendFullName: true` em `createVerticeSync`. Mesmo assim, cada TV escolhe como mostrar: nome e inicial, só o nome, nome completo ou só o número. Os pedidos são apagados do Vértice 24 h depois.

## Desconectar

`vertice.unpair()` troca a identidade do caixa. Remova também o caixa em **Empresa › Integrações** no painel. Remover pelo painel já basta: o caixa percebe e volta para "Gerar código".
