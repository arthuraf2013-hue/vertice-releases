# Aplicativos de tela e mural de comentários

Os aplicativos entram nas playlists (e nas zonas da tela) como qualquer mídia. Cada um busca os próprios dados
na TV, guarda a última resposta no aparelho e continua mostrando esse resultado se a internet cair. As fontes
ficam em `packages/shared/src/feeds.js` e o desenho em `packages/shared/src/apps/DataApps.jsx`, usado pelo
player e pela prévia do painel.

## Os 15 aplicativos novos

| # | App | Fonte | Chave | Gratuito | Atualiza |
|---|---|---|---|---|---|
| 1 | Chuva nas próximas horas | Open-Meteo (previsão por hora) | Não para uso não comercial; **sim para uso comercial** | Só não comercial | 30 min |
| 2 | Qualidade do ar e UV | Open-Meteo Air Quality (CAMS) | Idem | Só não comercial | 1 h |
| 3 | Sol e lua | Open-Meteo (nascer/pôr do sol); fase da lua calculada na TV | Idem | Só não comercial | 6 h |
| 4 | Jogos de futebol | TheSportsDB (`eventspastleague`, `eventsnextleague`) | Pública "123"; paga opcional | Sim, mas com poucos jogos | 10 min |
| 5 | Tabela do campeonato | TheSportsDB (`lookuptable`) | Idem | Sim | 30 min |
| 6 | Manchetes em rotação | RSS de até 4 portais | Não | Depende do portal | 15 min |
| 7 | Cotações | AwesomeAPI (`/json/last`) | Não (com chave, sem o cache de 1 min) | Sim | 15 min |
| 8 | Indicadores econômicos | Banco Central, SGS (Selic 432, IPCA 433, CDI 4389, PTAX 1) | Não | Sim, dados abertos (ODbL) | 6 h |
| 9 | Próximos feriados | BrasilAPI (`/api/feriados/v1/{ano}`) + datas da loja | Não | Sim | 24 h |
| 10 | Contagem regressiva | Calculado na TV | — | — | — |
| 11 | Aniversariantes | Lista digitada no painel | — | — | — |
| 12 | Hoje na história | Wikipédia em português (`/api/rest_v1/feed/onthisday`) | Não | Sim, texto CC BY-SA (a tela mostra a fonte) | 6 h |
| 13 | Agenda de eventos | Calendário `.ics` (Google Agenda pública, Outlook, prefeitura) | Não | — | 30 min |
| 14 | Relógio mundial | Calculado na TV (fusos do sistema) | — | — | — |
| 15 | Frase do dia | Lista da loja ou ditados populares (domínio público) | — | — | — |
| + | Mural de comentários | Firestore (comentários aprovados) | — | — | Ao vivo |

Já existiam: relógio, avisos, clima, notícias (um feed), site, YouTube, QR Code, Google Sheets, Estúdio e Price.

### O que depende de chave, pagamento ou autorização

- **Open-Meteo (clima, chuva, ar, sol):** o uso sem chave é só para fins não comerciais. Para vender o Vértice
  com esses apps, contrate um plano e coloque a chave em `VITE_OPEN_METEO_KEY` (nos `.env` do painel e do
  player e nos secrets `PAINEL_ENV` e `PLAYER_ENV`). Com a chave, a TV usa os servidores `customer-` deles.
  Isso vale também para o app de Clima que já existia.
- **TheSportsDB (futebol):** a chave pública "123" funciona, mas devolve poucos jogos por campeonato (no teste,
  um jogo anterior e um próximo). Para a lista completa, a chave paga (a partir de US$ 9 por mês) é colocada
  pelo cliente no próprio app, ou a Vetta assina uma e passa a preencher por padrão.
- **Portais de notícias:** a tela mostra só o título e o nome do portal. A Agência Brasil autoriza reprodução
  com fonte para fins jornalísticos; para uso comercial, pede contato com o licenciamento da EBC. Os demais
  portais seguem os termos de cada um. A escolha do portal fica com o cliente.

### Comportamento na TV

- Sem internet: a TV mostra o último dado que conseguiu; sem nenhum dado ainda, mostra "Carregando…" ou uma
  mensagem curta, e tenta de novo sozinha.
- Uma fonte fora do ar não derruba as outras (manchetes de vários portais, indicadores de várias séries).
- O app que fica muito tempo na tela (zona fixa) se atualiza no ritmo da fonte.
- Na prévia do painel, o app usa a fonte de verdade quando o navegador consegue ler; senão, dados de exemplo
  (com aviso embaixo da prévia).

## Mural de comentários

1. Em **Aplicativos**, crie um **Mural de comentários** (título, pergunta, aprovação, palavras bloqueadas) e
   coloque numa playlist ou numa zona da tela.
2. A TV mostra a pergunta, o QR Code e os comentários aprovados, em rodízio.
3. O público abre `/comentar?e={empresa}&m={mural}` (pelo QR ou pelo link), escreve e envia, sem cadastro.
4. Em **Comentários**, a equipe aprova, oculta ou apaga, e abre ou fecha o mural.

### Decisões

- **Moderação antes de aparecer** (padrão). Com "Aprovar sozinho", o comentário vai direto para a TV, menos
  os que têm palavra bloqueada: esses ficam esperando aprovação.
- **Limite:** 3 envios a cada 10 minutos por aparelho, 200 letras por comentário, 30 no nome.
- **Sem Cloud Functions:** quem comenta entra como usuário anônimo do Firebase. As regras do Firestore conferem
  tudo no servidor: tamanho, mural aberto, licença da loja, o limite (documento `commentLimits/{uid}`, gravado
  no mesmo lote que o comentário) e as palavras bloqueadas (`commentSettings/{mural}.blockPattern`).
- **Anti-robô:** campo invisível no formulário. O Firebase também limita a criação de usuários anônimos por IP.
- **Privacidade:** guarda nome, texto, data e o id anônimo; nada de e-mail, telefone ou IP. A TV mostra só o
  primeiro nome. A política de privacidade ganhou o item do mural.
- **Onde fica:** `companies/{empresa}/commentBoards/{mural}` (público: título, pergunta, aberto),
  `.../comments/{id}`, `companies/{empresa}/commentSettings/{mural}` (só a equipe) e `commentLimits/{uid}`.
  O índice `comments (status, createdAt desc)` está em `firebase/firestore.indexes.json`.

### Para colocar no ar

- `npm run deploy:rules` (regras e o índice novo).
- `npm run deploy:hosting` (a página `/comentar` usa o `apps/panel/.env`; precisa de `VITE_FIREBASE_API_KEY`).
- Autenticação anônima já está ligada no projeto (as TVs usam).
- Uma versão do player (commit `release:`) para as TVs desenharem os apps novos.

## Testes

- `npm test`: inclui `feeds.test.js` (cada fonte com uma resposta gravada, falhas e casos de borda) e
  `comments.test.js`.
- `npm run test:rules`: 5 testes do mural (envio, limite, aprovação automática com palavras bloqueadas,
  mural fechado e licença vencida, moderação e leitura da TV).
