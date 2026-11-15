# Vértice comercial: clientes, planos, cobrança e alertas

## Como um cliente entra

- **Pela Vetta (venda do consultor):** no painel, menu **Clientes › Novo cliente**. Cria a empresa com plano,
  mensalidade e começo (teste ou já contratado) e convida o dono pelo e-mail. O dono abre o painel, toca em
  **Criar conta** com esse e-mail e cai direto na empresa. Se ele já tinha conta, usa **Procurar convite**.
- **Pelo site (cadastro aberto):** o botão *Testar grátis* do site abre o painel em *Criar conta*. A empresa
  nasce no **Start** (3 telas, 2 GB), em **teste grátis** pelo número de dias da configuração (padrão 14).
  A Vetta pode fechar o cadastro em **Clientes › Configurações**; fechado, só entra quem tiver convite.

## Licença

Campos em `companies/{id}` (só a Vetta muda; as regras recusam o cliente):

| Campo | O que é |
|---|---|
| `status` | `trial`, `active`, `suspended` ou `canceled` (sem campo = ativo, contas antigas) |
| `trialEndsAt` | fim do teste grátis |
| `paidUntil` | pago até (vazio = sem vencimento, cortesia) |
| `graceDays` | tolerância depois do vencimento (padrão 5) |
| `plan`, `screenLimit`, `storageQuotaMB` | plano e limites |
| `monthlyPrice`, `notes`, `ownerEmail`, `phone`, `city` | dados comerciais do console |

**Bloqueada** = suspensa, cancelada, teste vencido ou mais de `graceDays` depois do `paidUntil`. Nesse caso:
- a TV mostra **Exibição pausada** (as regras recusam o manifesto; a TV confere ao abrir e a cada 15 min);
- o painel mostra o aviso no topo e não publica mudanças; ao reativar, publica tudo de novo sozinho;
- o servidor de mídias recusa envios (402);
- nada é apagado.

A conta é a mesma em três lugares: `packages/shared/src/license.js`, função `licenseOk` em
`firebase/firestore.rules` e `servers/media/server.js` / `servers/worker/worker.js`.

**Registrar pagamento** (console, no cliente): grava em `payments` e avança o `paidUntil` um mês (ou os meses
informados) a partir do vencimento atual. O cliente vê o histórico em **Empresa › Plano**.

## Limites do plano, conferidos no servidor

- **Telas:** `screenCount` na empresa sobe e desce junto com a criação/exclusão da tela, e as regras não deixam
  passar de `screenLimit`. O serviço de alertas recalcula o contador a cada hora; no console há **Recontar telas**.
- **Mídias:** o servidor de mídias soma os arquivos da pasta da empresa e recusa o envio que passar da cota.

## Alertas

Em **Empresa › Alertas** o administrador do cliente cadastra e-mails e WhatsApp, o tempo sem resposta
(5 min a 2 h), um horário de silêncio e se quer saber quando a TV voltar. **Enviar teste** manda um aviso na hora.
O histórico aparece na mesma tela.

Quem envia é o **serviço de alertas** (`servers/worker`), que também manda:
- aviso de fim do teste (3 dias antes e no fim), de vencimento (5 dias antes), de atraso e de telas pausadas,
  para o e-mail do dono (cada aviso uma vez por ciclo);
- um resumo diário às 8h para a Vetta (`VETTA_EMAIL`): bloqueados, vencidos, vencendo, testes acabando e
  novos cadastros.

## Colocar no ar (uma vez)

1. **Você como Vetta:** no console do Firebase › Firestore, crie o documento `platformAdmins/{seu uid}`
   (o uid está em Authentication). Qualquer campo serve, por exemplo `name: "Arthur"`. Abra o painel: aparece
   **Clientes** no menu.
2. **Clientes antigos:** abra cada um no console, confira plano, mensalidade e **Pago até**, e salve. Sem
   `status`, a conta continua ativa e sem vencimento até você definir.
3. **Regras:** `npm run deploy:rules`.
4. **Site e painel:** `npm run deploy:hosting`. O site fica na raiz, o painel em `/app/` e o player web em
   `/tv/`. Links antigos do painel (`/#/...`) são levados para `/app/#/...`.
5. **Serviço de alertas**, no mesmo computador do servidor de mídias:
   ```bash
   cd servers/worker
   cp .env.example .env        # preencha SMTP e, se quiser, WhatsApp e VETTA_EMAIL
   # baixe a chave da conta de serviço (Firebase › Configurações › Contas de serviço) como conta-de-servico.json
   npm install && npm start
   ```
   Deixe rodando como serviço (no Windows, `nssm install VerticeAlertas "C:\\Program Files\\nodejs\\node.exe" worker.js`
   na pasta `servers/worker`; no Linux, um `systemd`). `npm run once` roda tudo uma vez, para testar.
6. **WhatsApp (opcional):** Z-API, Evolution API ou um webhook próprio (`WHATSAPP_PROVIDER` no `.env`).
7. **Termos e privacidade:** `apps/site/termos.html` e `privacidade.html` são minutas. Preencha razão social,
   CNPJ e e-mail e passe por um advogado antes de divulgar.

## Player à prova de loja

- Android: inicia com a TV (BootReceiver), pode ser a tela inicial (Home › Sempre), tela sempre acesa, e se a
  página ou o app cair ele se reabre em 3 s (`MainActivity.installRecovery`).
- Windows: abre com o Windows, recarrega se a página travar ou cair, impede a suspensão.
- Todos: toca o que já baixou sem internet, recarrega uma vez entre 4h00 e 4h20 e quando a memória passa de 85%
  (`services/watchdog.js`), e para de tocar quando a licença é bloqueada.
