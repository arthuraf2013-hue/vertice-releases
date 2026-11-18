# Recursos inspirados no mercado (17/11/2026)

Comparação feita com o Smile Cast (só o site público), Yodeck, OptiSigns, ScreenCloud, Xibo, NoviSign e OnSign TV.
Entraram os 16 recursos escolhidos. Tudo funciona sem Cloud Functions: o painel compila no manifesto, as regras do
Firestore conferem o que vem de fora e o servidor de mídias faz o que precisa de segredo.

## Tela e programação

| Recurso | Onde fica | Como funciona |
|---|---|---|
| **Zonas e barra inferior** | Conteúdo › Layouts | Modelos: tela inteira, principal + lateral, duas metades, em L. A zona principal toca a grade da tela; as outras tocam uma playlist fixa, sem som. A barra tem logo, avisos correndo, relógio e data. Vale para grupos ou telas (marcado direto na tela vence o grupo). Em TV em pé, as zonas empilham. `layouts/{id}` → `manifest.layout`. |
| **Alerta urgente** | Operação › Alerta urgente (e faixa vermelha no topo do painel) | Toma as telas escolhidas por cima de tudo (inclusive fechado e video wall), com sirene e voz. Fica até o prazo ou até encerrar. Editor pode mandar. `company.alert` → `manifest.alert`; a TV confere o prazo sozinha. |
| **Horário de funcionamento e volume** | Empresa › Horário (padrão) e Telas › Unidades (próprio) | Fora do expediente a TV escurece (tela preta, relógio discreto ou aviso com a próxima abertura) e para de contar exibição. Expediente pode passar da meia-noite. Volume geral e por faixa de horário. A TV não desliga o aparelho (Android não deixa sem HDMI-CEC). |
| **Ver como na tela** | Telas e Programação | Compila o manifesto no navegador e mostra a tela num dia e hora, com layout, barra, expediente e alerta, a sequência e as faixas do dia. "Incluir rascunhos" mostra a grade antes de publicar. |

## Apps de segmento

| App | Operação | Detalhes |
|---|---|---|
| **Chamada de senhas** | Operação › Chamar senha (feito para celular) | Tipos com letra (A normal, P preferencial…), guichês, chamar próxima, chamar de novo, chamar número. A TV toca o aviso e fala a senha (voz pt-BR do aparelho). Transação: dois atendentes não pegam o mesmo número. Recepção com papel "visualizador" já chama. `queues/{id}`. |
| **Enquete** | Interação › Enquetes | Público vota pela página `/votar` (anônimo, um voto por aparelho e por rodada). O voto e o placar entram no mesmo lote e as regras conferem que o placar subiu 1 na opção votada. Zerar = nova rodada. `polls/{id}`, `polls/{id}/votes/{rodada_uid}`, `pollTallies/{id}`. |
| **Foto no telão** | Interação › Murais | Mesmo mural dos comentários com `kind: 'photos'`. A página `/comentar` reduz a foto no celular (1600 px, JPEG) e envia para o servidor de mídias (`PUT /v1/public/{empresa}/{mural}/{arquivo}`), que confere login anônimo, mural aberto, JPEG de verdade e 3 fotos a cada 10 min. As regras só aceitam foto daquele mural. |
| **Cronômetro de treino** | Operação › Cronômetro | AMRAP, EMOM, Tabata, For time, intervalado e contagem regressiva, com WOD ao lado, bipes e preparação. Inicia/pausa/zera pelo celular ou começa sozinho nos horários de aula. Todas as TVs mostram o mesmo tempo (diferença de relógio medida no sinal de vida). `timers/{id}`. |

## Conteúdo

| Recurso | Detalhes |
|---|---|
| **TV ao vivo** | App com link `.m3u8` (HLS) ou `.mp4`. hls.js é carregado da CDN (jsDelivr) só quando o app toca; tenta de novo sozinho se a transmissão cair. Use só transmissões que você tem direito de exibir. |
| **PDF como slides** | Em Mídias, envie um PDF: cada página vira imagem (1920 px, no navegador, com pdf.js da CDN) e o arquivo vira uma playlist pronta, 10 s por página, até 40 páginas. Toca offline como imagem. |
| **Pasta do Google Drive** | App com o link de uma pasta "qualquer pessoa com o link". A TV lista a pasta a cada 15 min (pela página pública ou pela API do Google com `VITE_GOOGLE_API_KEY`) e passa as imagens em ordem de nome. As imagens vêm do Google na hora: sem internet, só as que já abriram. |
| **Textos com IA no Estúdio** | Botão "Sugerir textos com IA" nas peças de oferta, aviso, evento e boas-vindas: 3 opções curtas a partir do que já foi digitado. A chamada passa pelo servidor de mídias (`POST /v1/ai/{empresa}/texto`, só editor), com a chave `ANTHROPIC_API_KEY` guardada lá e limite diário por empresa (`AI_DAILY_LIMIT`, padrão 60). Sem chave, o botão avisa que a IA está desligada. |

## Gestão e comercial

| Recurso | Detalhes |
|---|---|
| **Mapa de telas** | Operação › Mapa. Um ponto por unidade com a cor da pior situação das telas. Local pelo endereço (busca do OpenStreetMap/Nominatim) ou clicando no mapa; arrastar ajusta. Leaflet e o mapa do OpenStreetMap vêm da internet. Uso leve e com atribuição está dentro da política do OSM; com muitos clientes, troque para um provedor de mapas próprio. |
| **Painel no celular** | O painel web é instalável (manifest, ícones, service worker que guarda só a casca). No celular aparece uma barra de atalhos: Início, Telas, Senhas (ou Mídias), Preços e Alerta. Atalhos do ícone: Chamar senha, Price, Alerta. |
| **Registro de atividades** | Empresa › Atividade (admin). Toda gravação do painel em áreas que importam vira uma linha em `companies/{id}/audit` (quem, o quê, quando, campos). Ninguém altera nem apaga; filtros e CSV. O registro é gravado logo depois da ação e nunca trava o trabalho se falhar. |
| **Mídia indoor (catálogo e propostas)** | Comercial › Mídia indoor. Catálogo público em `/midia?e={empresa}` (`publicCatalogs/{empresa}`): pontos, telas, público estimado (informado por unidade) e pacotes, com botão de WhatsApp. Propostas com inserções, alcance e valor calculados, PDF pelo navegador e "Virar anunciante" (cria o anunciante com as datas do contrato). |

## Para colocar no ar

1. Aplicar os patches (depois de `feat/comentarios-e-apps`).
2. `npm run deploy:rules` (regras novas: layouts, auditoria, senhas, cronômetro, enquete, fotos, catálogo).
3. `npm run deploy:hosting` (páginas `/votar` e `/midia`, painel instalável).
4. Atualizar o servidor de mídias na VPS (`npm run vps …`): rotas novas de foto do público e IA. Para ligar a IA, preencher `ANTHROPIC_API_KEY` em `/etc/vertice/midias.env` e reiniciar `vertice-midias`.
5. Commit `release:` para as TVs receberem zonas, barra, alerta, expediente e os apps novos.

## Testes

- `npm test`: 118 do shared (23 novos: layouts, expediente, alerta, senhas, cronômetro, enquete, Drive, auditoria, catálogo).
- `npm run test:rules`: 29 (7 novos).
- `npm run test:midias` (novo): foto do público aceita/recusada e IA sem chave.
- `npm run e2e`: 24 passos; os 2 novos mandam um alerta urgente e um layout com barra pelo painel e conferem na TV.

## O que não foi testado de verdade

- Transmissão HLS real, pasta real do Google Drive e a IA com chave (sem acesso a esses serviços no ambiente de teste; o leitor da pasta foi testado com HTML de exemplo).
- Voz da chamada de senhas em TV box (depende de o aparelho ter voz pt-BR instalada; sem voz, toca só o aviso).
- PDF grande no navegador do celular (o limite de 40 páginas é para não travar).
