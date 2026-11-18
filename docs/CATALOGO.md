# Catálogo ampliado, Loja e páginas comerciais

Tudo o que o SmileCast mostra no catálogo e no menu, e que o Vértice não tinha, agora existe. Este documento lista o que entrou, como ligar e o que ainda não foi testado com o serviço de verdade.

## Aplicativos novos (Aplicativos)

| App | O que faz | Fonte |
|---|---|---|
| Loterias CAIXA | Último concurso de até 6 modalidades, acumulou ou ganhadores, prêmio do próximo | API pública da CAIXA (libera CORS) |
| Horóscopo do dia | Os 12 signos em rodízio: amor, trabalho, dica, cor e número | Texto próprio, muda todo dia (entretenimento) |
| Quiz do dia | Pergunta, alternativas, contagem e a resposta acendendo | Banco próprio com 42 perguntas conferidas + perguntas do cliente + "Criar 10 com IA" |
| Cinema | Trailer oficial do YouTube com nome, gênero, classificação e sessões | Lista do cliente |
| Cotações agro | Boi, soja, milho, café, açúcar, suíno, frango e outros (16) | Widget público do Cepea/Esalq-USP |
| Aniversariante do dia | Homenagem com nome, foto e mensagem em 5 modelos | Foto da biblioteca de Mídias |
| Agenda de aulas | Grade da semana, destaca "agora" e "a seguir" | Texto do cliente ("seg a sex 07:00-08:00 Spinning \| Ana \| Sala 2") |
| Fitness | Frase de motivação em 5 fundos desenhados ou foto própria | 20 frases próprias ou do cliente |
| Sala de reunião | Livre/ocupada, reunião atual e próximas | Agenda .ics (Outlook, Google) |
| Pesquisa de satisfação | Até 8 perguntas (NPS 0–10, estrelas, opções, texto) pelo QR | Página pública /pesquisa; relatório em Interação › Pesquisas |
| Power BI | Relatório "Publicar na Web" com rodízio de páginas | Link público do Power BI |
| Código HTML | Widget externo na tela inteira ou numa área | iframe isolado (sem acesso ao app) |
| Rádio online | Rádio pelo link direto, com logo; também como som ambiente | Link do stream |

## Tipos que ganharam opções

- **Relógio:** ponteiros, digital ou os dois; 5 formatos de data.
- **YouTube:** um vídeo, uma playlist ou o canal ao vivo.
- **Google Sheets:** tabela, barras, ranking com medalhas ou indicadores com meta (coluna C).
- **Cronômetro de treino:** WOD diferente para cada dia da semana.
- **Chamada de senhas:** chamar pelo nome (a TV mostra e fala).
- **Jogos e tabela:** Séries C e D e 22 campeonatos estaduais (ids conferidos no TheSportsDB).
- **Manchetes:** portais e editorias conferidos (g1, UOL, ge, Agência Brasil, Canaltech, Vatican News, Folha, CNN Brasil, Canal Rural).

## Atalhos no catálogo

Cartões prontos que abrem um app já configurado: g1, UOL, ge, Agência Brasil, Canaltech, Vatican News, CNN Brasil, Folha, Brasileirão, Campeonatos estaduais, Jogos e resultados, Playlist do YouTube, Canal ao vivo e **Canais IPTV** (importa uma lista M3U: cada canal vira um app "TV ao vivo").

## Som ambiente

Em Telas › (tela) › Som ambiente, escolha uma rádio criada em Aplicativos e o volume. Ela toca de fundo, zera quando entra vídeo com som, YouTube ou cinema sem mudo, e fica muda fora do expediente e durante alerta urgente.

## Páginas novas no painel

- **Biblioteca** (Conteúdo): 32 campanhas prontas por mês (Janeiro Branco, Abril Verde, Maio Amarelo, Setembro Amarelo, Outubro Rosa, Novembro Azul, Black Friday, Natal, SIPAT, EPI, refeitório…) e 3 kits que criam aplicativos e a playlist de uma vez: Comunicação interna, Loja e varejo, Academia.
- **CRM** (Comercial): funil de anunciantes com valor mensal, próximo retorno, WhatsApp e taxa de fechamento.
- **Calculadora** (Comercial): exibições do anúncio (usa o ciclo real de uma playlist) e consumo de energia das telas.
- **Loja** (Gestão): renovação mensal/semestral/anual, espaço extra e serviços, com promoção por prazo. Pagamento pelo Asaas.
- **Indique e ganhe** (Gestão): código e link da empresa; na primeira mensalidade paga do indicado, quem indicou ganha 12 meses.
- **Academia** (Ajuda): 10 guias passo a passo e um assistente com IA que responde dúvidas de uso.
- **Console da Vetta:** editor dos itens e preços da Loja e a coluna "indicado por".

## Como colocar no ar

1. `npm run deploy:rules` (regras de pesquisas, CRM, pedidos da loja e indicação).
2. `npm run deploy:hosting` (painel e site com a página /pesquisa).
3. Atualize a VPS com o instalador (`npm run vps …`): ele copia `store.js` e troca o Caddy para mandar `/v1/loja` e `/v1/asaas` ao serviço de alertas.
4. Loja: crie a conta no Asaas, gere a chave de API e coloque em `segredos/worker.env`:
   ```
   ASAAS_ENV=sandbox            # production quando for vender de verdade
   ASAAS_API_KEY=$aact_hmlg_...
   ASAAS_WEBHOOK_TOKEN=<32 a 255 letras>
   ```
   No Asaas › Integrações › Webhooks: URL `https://SEU-DOMINIO/v1/asaas/webhook`, eventos de cobrança, mesmo token.
5. No console da Vetta, revise os itens e preços da Loja (os padrões são exemplos: R$ 99,90, R$ 539,40, R$ 1.078,80…).
6. IA (quiz e assistente): a mesma `ANTHROPIC_API_KEY` do servidor de mídias.

## Testes

- `npm test`: 147 testes da base (29 novos do catálogo, pesquisa, loja, indicação, chamada por nome e som ambiente) + 6 da loja no serviço.
- `npm run test:rules`: 32 testes de regras (3 novos: pesquisa, CRM e pedidos, indicação).
- `npm run test:midias`: servidor de mídias e a **Loja ponta a ponta** com um Asaas de mentira (compra, webhook, promoção, espaço, prêmio de indicação uma vez só, token errado recusado).
- `npm run e2e`: os 29 passos continuam passando.

## O que não foi testado com o serviço de verdade

- **Asaas real** (sandbox ou produção): só contra um Asaas simulado. Faça uma compra no sandbox antes de vender.
- **Cepea no player web:** o Cepea recusa leitura de outro site; funciona no player Android e Windows.
- **Power BI, rádio, IPTV e canal ao vivo do YouTube** numa TV box real: dependem do link e do aparelho.
- **IA do quiz e do assistente** com a chave: testado só no modo demonstração.
- **Direitos:** rádio (ECAD), IPTV (contrato do fornecedor), trailers e portais de notícia (termos de cada um) são responsabilidade do cliente; os avisos estão no painel.
- **Instagram Stories** não entrou: exige app aprovado pela Meta (o próprio SmileCast está com ele em manutenção). **Conferências** do SmileCast foi tratado como "Sala de reunião".
