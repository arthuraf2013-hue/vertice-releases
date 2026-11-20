# Financeiro da Vetta (console)

O console da Vetta (menu **Financeiro**, só para quem está em `platformAdmins`) tem oito abas:

| Aba | O que mostra |
| --- | --- |
| Central de controle | MRR, ARR, MRR líquido novo do mês, quick ratio, churn de clientes e de receita, NRR, GRR, contas pagantes, ARPA, LTV, faturado, recebido, previsão de 30 dias, vencido, prazo médio de recebimento, o que precisa de ação, evolução do MRR em 12 meses, movimento do mês, recebido por mês e meios de pagamento |
| Recebimentos | Todo pagamento (Asaas, Loja ou registrado à mão), com filtro por período e meio, e exportação em CSV |
| Faturas | A receber, vencidas, a vencer, pagas, canceladas e com falha no Asaas. Ações: abrir e copiar o link, gerar a cobrança, dar baixa, cancelar e criar uma fatura nova |
| Cobrança | Contas vencidas, suspensas, perto do cancelamento, com cancelamento agendado, canceladas e com falha no Asaas. Ações: lembrar pelo WhatsApp, tentar a cobrança de novo, adiar o cancelamento em 15 dias, agendar ou desfazer o cancelamento e reativar |
| Clientes | MRR, valor em aberto, último pagamento, próximo vencimento e situação de cada empresa |
| Licenças | Telas contratadas, em uso (pareadas), online agora e livres em cada cliente |
| MRR e movimentações | MRR dia a dia com o recebido no dia, cada mudança de MRR (novo, reativação, expansão, contração e cancelamento) e as telas pareadas e removidas |
| Loja | Itens à venda e pedidos (o que já existia) |

Todas as tabelas ordenam pelas colunas e exportam CSV com ponto e vírgula (abre direto no Excel).

## De onde vêm os números

- `companies`: plano, mensalidade, situação, "pago até", CPF/CNPJ, cancelamento agendado.
- `companies/*/invoices`: faturas. A da mensalidade é gerada pelo servidor; as avulsas, pelo console.
- `companies/*/payments`: recebimentos. Entram quando o Asaas confirma uma fatura, quando um pedido da Loja é pago ou quando alguém registra o pagamento à mão.
- `mrrEvents` e `licenseEvents`: o histórico. O servidor compara o Firestore com o último estado que viu e grava cada mudança.

As contas ficam em `packages/shared/src/finance.js` e são testadas em `finance.test.js`. O MRR de um dia passado é o MRR de hoje menos os eventos que vieram depois daquele dia.

**MRR** é a soma das mensalidades das empresas **ativas** que têm vencimento e mensalidade maior que zero. Não entram cortesia (sem vencimento), teste grátis, suspensão manual nem conta cancelada. Uma conta bloqueada por atraso ainda conta no MRR até ser cancelada.

## O servidor (`servers/worker/finance.js`)

Ele roda junto com o serviço de alertas e cobrança, e faz duas coisas.

**A cada hora:**

1. Gera a fatura da mensalidade X dias antes do vencimento (10 por padrão) e cria a cobrança no Asaas com `billingType: UNDEFINED`, para o cliente escolher Pix, boleto ou cartão. O id da fatura é a data do vencimento, então nunca sai fatura dobrada.
2. Tenta de novo as cobranças que falharam, até 6 vezes. O motivo mais comum é cliente sem CPF/CNPJ.
3. Cancela as faturas que outro pagamento já cobriu, como uma renovação pela Loja ou uma baixa à mão.
4. Cancela as contas que pediram cancelamento (na data agendada) e as que passaram N dias sem pagar (90 por padrão). Avisa o dono por e-mail e apaga as faturas em aberto, também no Asaas.

**O tempo todo:** registra cada mudança de MRR e cada tela pareada ou removida. Na primeira vez, a base que já paga entra como "novo cliente" na data do cadastro da empresa, e essas linhas ficam marcadas com `backfill`.

**Pagamento confirmado:** o webhook do Asaas, com `externalReference` no formato `empresa/inv/fatura`, marca a fatura como paga, cria o recebimento e renova a empresa pelos meses da fatura. Webhooks repetidos não pagam duas vezes.

**Rotas do console** (só para quem está em `platformAdmins`, no mesmo serviço da Loja, porta 8788):

```
POST /v1/financeiro/{empresa}/faturas/{fatura}/cobrar     gera a cobrança no Asaas
POST /v1/financeiro/{empresa}/faturas/{fatura}/cancelar   cancela (e apaga no Asaas)
POST /v1/financeiro/{empresa}/faturas/{fatura}/baixa      recebido por fora; avisa o Asaas (receiveInCash)
GET  /v1/financeiro/saude
```

O Caddy encaminha `/v1/financeiro/*` para a porta 8788. O `instalar.sh` já copia o `finance.js`.

## Configurações

Ficam em **Configurações** no console (`platform/settings`):

- `autoInvoice`: gera as faturas da mensalidade sozinho (padrão: ligado).
- `invoiceDaysBefore`: quantos dias antes do vencimento a fatura é gerada (padrão: 10).
- `cancelAfterDays`: depois de quantos dias sem pagamento a conta é cancelada; 0 desliga (padrão: 90).

Na ficha de cada cliente:

- **CPF ou CNPJ**: obrigatório para cobrar pelo Asaas. O campo `cnpj` que o próprio cliente preenche também vale.
- **Razão social**: nome usado na cobrança.
- **Gerar a fatura da mensalidade sozinho**: desligue para quem paga de outro jeito.

## Testes

```
npm test              # cálculos (shared) e contas do servidor (finance.test.js)
npm run test:rules    # regras: faturas, históricos e consultas de grupo
npm run test:midias   # ponta a ponta com emulador e Asaas simulado: ... && financeiro.test.mjs
```

## Ainda não testado

- O Asaas sandbox e o de produção reais. Os testes usam um Asaas simulado.
- O e-mail de cancelamento num servidor SMTP real.
- Volume. As abas leem todas as faturas e recebimentos de uma vez, o que serve para algumas centenas de clientes.
