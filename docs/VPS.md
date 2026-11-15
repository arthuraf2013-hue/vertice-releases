# Servidor do Vértice na VPS (sem depender do PC)

O Firebase cuida do login, das telas, das grades e dos manifestos. As **mídias** (imagens e vídeos) ficam no
servidor próprio (`servers/media`), e os **alertas** (TV fora do ar, avisos de cobrança) no `servers/worker`.
Os dois precisam ficar ligados o tempo todo, com endereço público e HTTPS. Por isso eles rodam numa VPS, e não
no PC de ninguém.

As atualizações do painel e do player não passam por esse servidor: elas vêm do GitHub Releases.

## O que contratar

- **VPS Linux** com **Ubuntu 24.04** (ou 22.04, ou Debian 12), em qualquer provedor.
- **1 vCPU e 1 GB de RAM** dão conta de começar. O que pesa é o **disco**: some a cota de mídias dos planos
  vendidos (Start 2 GB, Pro 10 GB, Rede 50 GB) e deixe folga.
- **Backup ou snapshot automático** do provedor, se houver. As mídias dos clientes ficam em
  `/var/lib/vertice/midias`.
- **Portas 80 e 443 liberadas**, se o provedor tiver firewall no painel dele.

## 1. Apontar o domínio

No DNS de `vettasistemas.com.br`, crie um registro **A**: nome `midias`, valor = **IP da VPS**. Espere ele
propagar; para conferir, rode `nslookup midias.vettasistemas.com.br` e veja se aparece o IP.

## 2. Instalar (do seu PC, um comando)

Na pasta do Vértice, no PowerShell:

```powershell
npm run vps -- -Servidor root@IP_DA_VPS -Dominio midias.vettasistemas.com.br
```

O comando pede a senha da VPS duas vezes (uma para enviar, outra para instalar) e faz o seguinte:

- Envia o código do servidor de mídias e do serviço de alertas.
- Envia a configuração dos alertas, se existir: `servers/worker/.env` e a chave da conta de serviço.
- Envia as mídias antigas, se existir `servers/media/data`. Para outra pasta, use `-Midias C:\caminho\data`.
- Na VPS, instala Node.js 22 e Caddy (HTTPS automático com Let's Encrypt), cria os serviços `vertice-midias`
  e `vertice-alertas` (sobem sozinhos quando a VPS reinicia) e liga o firewall (SSH, 80 e 443).
- Confere `https://midias.vettasistemas.com.br/health` e, se responder, troca `VITE_MEDIA_SERVER_URL` em
  `apps/panel/.env`.

Se o usuário da VPS não for `root` (ex.: `ubuntu@IP`), ele usa `sudo`. Para SSH em outra porta, use `-Porta 2222`.

Para **atualizar** o servidor depois de mudar `servers/media` ou `servers/worker`, rode o mesmo comando. As
mídias e a configuração da VPS ficam.

## 3. Painel apontando para a VPS

```powershell
npm run deploy:hosting                                    # painel web
Get-Content apps\panel\.env -Raw | gh secret set PAINEL_ENV  # instalador do painel (ou cole no GitHub)
```

Depois lance uma versão (commit `release:`). Quem usa o painel Windows com `vertice.config.json` preenchido
precisa trocar o `mediaServerUrl` nesse arquivo.

## 4. Links das mídias antigas

Cada mídia fica gravada no Firestore com o link completo, por exemplo `http://192.168.0.10:8787/m/...`.
Se já havia mídias no servidor antigo, troque os links pelo endereço novo. Isso precisa da chave da conta de
serviço, que já fica na VPS se os alertas estiverem configurados:

```bash
ssh root@IP_DA_VPS
cd /opt/vertice/alertas
set -a; . /etc/vertice/alertas.env; set +a
node migrar-midias.mjs https://midias.vettasistemas.com.br             # mostra o que mudaria
node migrar-midias.mjs https://midias.vettasistemas.com.br --aplicar   # grava
```

O script troca só o começo dos links do servidor de mídias, nas mídias e nos manifestos. As TVs recebem os
links novos na hora e **não baixam de novo** o que já têm, porque o cache é pela mídia, não pelo link.

## Alertas sem configuração

Sem `servers/worker/.env` e a chave da conta de serviço no PC, a instalação deixa o serviço de alertas
desligado. Para ligar:

1. No PC, copie `servers/worker/.env.example` para `servers/worker/.env` e preencha SMTP e `VETTA_EMAIL`.
2. No Firebase › Configurações do projeto › Contas de serviço, gere a chave e salve como
   `servers/worker/conta-de-servico.json`. Ela dá acesso total ao banco: não mande por e-mail nem coloque no git.
3. Rode o comando da etapa 2 de novo.

## No dia a dia (na VPS)

| O quê | Comando |
|---|---|
| Ver se está rodando | `systemctl status vertice-midias vertice-alertas caddy` |
| Últimas mensagens | `journalctl -u vertice-midias -n 50` (ou `vertice-alertas`, `caddy`) |
| Reiniciar | `systemctl restart vertice-midias` |
| Espaço em disco | `df -h /var/lib/vertice/midias` e `du -sh /var/lib/vertice/midias/*` |
| Configuração | `/etc/vertice/midias.env` e `/etc/vertice/alertas.env` (depois, `systemctl restart ...`) |
