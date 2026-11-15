#!/usr/bin/env bash
# Vértice: instala ou atualiza o servidor de mídias e o serviço de alertas numa VPS Linux.
#
#   sudo bash deploy/vps/instalar.sh midias.vettasistemas.com.br [id-do-projeto-firebase]
#
# Testado para Ubuntu 22.04/24.04 e Debian 12. Pode rodar de novo quantas vezes quiser:
# atualiza o código, mantém as mídias e as configurações em /etc/vertice.
#
# O que fica na máquina:
#   /opt/vertice/midias        código do servidor de mídias   (serviço vertice-midias)
#   /opt/vertice/alertas       código do serviço de alertas   (serviço vertice-alertas)
#   /var/lib/vertice/midias    as mídias dos clientes (faça backup desta pasta)
#   /etc/vertice/*.env         configuração; conta-de-servico.json do Firebase
#   /etc/caddy/vertice.caddy   HTTPS automático (Let's Encrypt) na frente do servidor de mídias
#
# Arquivos opcionais ao lado do pacote (o scripts/vps.ps1 manda quando existem):
#   segredos/worker.env, segredos/conta-de-servico.json   configuração do serviço de alertas
#   midias-antigas.tgz                                    mídias do servidor antigo (pasta data)
set -euo pipefail

DOMINIO="${1:-}"
PROJETO="${2:-vertice-7ffa0}"
if [[ -z "$DOMINIO" || "$DOMINIO" == *"/"* || "$DOMINIO" == *":"* ]]; then
  echo "Uso: sudo bash instalar.sh midias.seudominio.com.br [id-do-projeto-firebase]" >&2
  echo "(só o domínio, sem https:// e sem barra)" >&2
  exit 1
fi
[[ "$(id -u)" == 0 ]] || { echo "Rode como root (sudo bash $0 $*)." >&2; exit 1; }

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AQUI="$SRC/deploy/vps"
# Pacote enviado pelo scripts/vps.ps1: a chave do Firebase não fica largada nem se der erro.
if [[ "$SRC" == */vertice-vps ]]; then trap 'rm -rf "$SRC/segredos" "${SRC%/*}/vertice-segredos.tgz"' EXIT; fi
passo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

passo "Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg ufw >/dev/null

node_ok() { command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]]; }
if ! node_ok; then
  passo "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE="$(command -v node)"
echo "Node $("$NODE" -v) em $NODE"

if ! command -v caddy >/dev/null; then
  passo "Caddy (HTTPS automático)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

passo "Usuário e pastas"
id vertice >/dev/null 2>&1 || useradd --system --home-dir /var/lib/vertice --shell /usr/sbin/nologin vertice
install -d -o vertice -g vertice -m 750 /var/lib/vertice /var/lib/vertice/midias
install -d -o root -g vertice -m 750 /etc/vertice
install -d -m 755 /opt/vertice /opt/vertice/midias /opt/vertice/alertas

passo "Código"
install -m 644 "$SRC/servers/media/server.js" "$SRC/servers/media/package.json" /opt/vertice/midias/
install -m 644 "$SRC"/servers/worker/{worker.js,rules.js,migrar-midias.mjs,package.json} /opt/vertice/alertas/
(cd /opt/vertice/midias && npm install --omit=dev --no-audit --no-fund --loglevel=error)
(cd /opt/vertice/alertas && npm install --omit=dev --no-audit --no-fund --loglevel=error)

passo "Configuração"
# Servidor de mídias: cria na primeira vez; depois só acerta o endereço público.
if [[ ! -f /etc/vertice/midias.env ]]; then
  cat > /etc/vertice/midias.env <<EOF
FIREBASE_PROJECT_ID=$PROJETO
PUBLIC_URL=https://$DOMINIO
HOST=127.0.0.1
PORT=8787
DATA_DIR=/var/lib/vertice/midias
MAX_UPLOAD_MB=500
# O envio exige o login do painel (token), então * é seguro. Para restringir:
# ALLOWED_ORIGINS=https://vertice.vettasistemas.com.br,app://vertice
ALLOWED_ORIGINS=*
EOF
else
  sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMINIO#" /etc/vertice/midias.env
fi

# Serviço de alertas: o que veio do PC substitui o que estava aqui.
if [[ -f "$SRC/segredos/worker.env" ]]; then
  tr -d '\r' < "$SRC/segredos/worker.env" > /etc/vertice/alertas.env
  echo "Configuração dos alertas recebida do PC."
elif [[ ! -f /etc/vertice/alertas.env ]]; then
  tr -d '\r' < "$SRC/servers/worker/.env.example" > /etc/vertice/alertas.env
  sed -i "s#^FIREBASE_PROJECT_ID=.*#FIREBASE_PROJECT_ID=$PROJETO#" /etc/vertice/alertas.env
fi
if [[ -f "$SRC/segredos/conta-de-servico.json" ]]; then
  install -o root -g vertice -m 640 "$SRC/segredos/conta-de-servico.json" /etc/vertice/conta-de-servico.json
  echo "Chave da conta de serviço recebida do PC."
fi
# Caminho da chave sempre absoluto (no PC era relativo à pasta do worker).
if grep -q '^GOOGLE_APPLICATION_CREDENTIALS=' /etc/vertice/alertas.env; then
  sed -i 's#^GOOGLE_APPLICATION_CREDENTIALS=.*#GOOGLE_APPLICATION_CREDENTIALS=/etc/vertice/conta-de-servico.json#' /etc/vertice/alertas.env
else
  echo 'GOOGLE_APPLICATION_CREDENTIALS=/etc/vertice/conta-de-servico.json' >> /etc/vertice/alertas.env
fi
chown root:vertice /etc/vertice/*.env
chmod 640 /etc/vertice/*.env

if [[ -f "$SRC/midias-antigas.tgz" ]]; then
  passo "Mídias do servidor antigo"
  tar -xzf "$SRC/midias-antigas.tgz" -C /var/lib/vertice/midias --no-same-owner
  find /var/lib/vertice/midias -name '*.part' -delete
  chown -R vertice:vertice /var/lib/vertice/midias
  echo "$(find /var/lib/vertice/midias -type f | wc -l) arquivos em /var/lib/vertice/midias"
fi

passo "Serviços"
sed "s#@NODE@#$NODE#" "$AQUI/vertice-midias.service" > /etc/systemd/system/vertice-midias.service
sed "s#@NODE@#$NODE#" "$AQUI/vertice-alertas.service" > /etc/systemd/system/vertice-alertas.service
systemctl daemon-reload
systemctl enable vertice-midias >/dev/null 2>&1
systemctl restart vertice-midias
ALERTAS=0
if [[ -f /etc/vertice/conta-de-servico.json ]]; then
  systemctl enable vertice-alertas >/dev/null 2>&1
  systemctl restart vertice-alertas
  ALERTAS=1
else
  systemctl disable --now vertice-alertas >/dev/null 2>&1 || true
fi

passo "HTTPS"
sed "s#@DOMINIO@#$DOMINIO#" "$AQUI/vertice.caddy" > /etc/caddy/vertice.caddy
# Caddyfile padrão do pacote (só a página de boas-vindas): troca pelo do Vértice.
# Se já houver outros sites configurados, só acrescenta o import.
if [[ ! -f /etc/caddy/Caddyfile ]] || grep -q '/usr/share/caddy' /etc/caddy/Caddyfile; then
  echo 'import /etc/caddy/vertice.caddy' > /etc/caddy/Caddyfile
elif ! grep -q 'import /etc/caddy/vertice.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/vertice.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

passo "Firewall"
# Mantém o SSH aberto na porta em que ele está ouvindo antes de ligar o firewall.
SSH_PORTAS="22 $(sshd -T 2>/dev/null | awk '$1=="port" {print $2}') $(ss -Htlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}')"
for p in $(echo "$SSH_PORTAS" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u); do
  ufw allow "$p/tcp" >/dev/null
done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

passo "Conferindo"
ok_local=0
for _ in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then ok_local=1; break; fi
  sleep 1
done
if [[ $ok_local == 1 ]]; then
  echo "Servidor de mídias: rodando"
else
  echo "Servidor de mídias NÃO respondeu. Veja: journalctl -u vertice-midias -n 50" >&2
  exit 1
fi
ok_https=0
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMINIO/health" >/dev/null 2>&1; then ok_https=1; break; fi
  sleep 3
done
if [[ $ok_https == 1 ]]; then
  echo "HTTPS: https://$DOMINIO funcionando"
else
  echo "HTTPS ainda não respondeu em https://$DOMINIO." >&2
  echo "Confira se o DNS de $DOMINIO aponta para o IP desta máquina e se as portas 80 e 443" >&2
  echo "estão liberadas no painel do provedor. O Caddy tenta de novo sozinho; veja: journalctl -u caddy -n 50" >&2
fi
if [[ $ALERTAS == 1 ]]; then
  sleep 2
  if systemctl is-active --quiet vertice-alertas; then echo "Serviço de alertas: rodando"
  else echo "Serviço de alertas parou. Veja: journalctl -u vertice-alertas -n 50" >&2; fi
else
  echo "Serviço de alertas: desligado (falta /etc/vertice/conta-de-servico.json; veja docs/VPS.md)"
fi

# Pacote enviado pelo scripts/vps.ps1 (tem a chave do Firebase): não fica largado.
if [[ "$SRC" == */vertice-vps ]]; then rm -rf "$SRC" "$SRC.tgz" "${SRC%/*}/vertice-segredos.tgz" "${SRC%/*}/vertice-midias.tgz"; fi
echo
echo "Pronto."
