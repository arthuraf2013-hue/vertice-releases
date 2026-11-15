# Vértice: instala ou atualiza o servidor de mídias e o serviço de alertas na VPS, a partir deste PC.
#
#   npm run vps -- -Servidor root@203.0.113.10 -Dominio midias.vettasistemas.com.br
#
# Envia o código (servers/media, servers/worker), a configuração dos alertas (servers/worker/.env
# e a chave da conta de serviço, se existirem) e as mídias do servidor antigo (servers/media/data,
# ou a pasta passada em -Midias). Depois roda deploy/vps/instalar.sh na VPS.
# Pode rodar de novo para atualizar: as mídias e a configuração da VPS são mantidas.
param(
  [Parameter(Mandatory = $true)][string]$Servidor,
  [Parameter(Mandatory = $true)][string]$Dominio,
  [string]$Projeto = 'vertice-7ffa0',
  [string]$Midias = '',
  [int]$Porta = 22
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$Dominio = ($Dominio -replace '^https?://', '').TrimEnd('/')

foreach ($cmd in 'ssh', 'scp', 'tar') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Falta o comando '$cmd'. No Windows: Configurações > Sistema > Recursos opcionais > adicionar 'Cliente OpenSSH'."
  }
}

$tmp = Join-Path $env:TEMP 'vertice-vps'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null
$enviar = @()

Write-Host '== Empacotando o código'
$pacote = Join-Path $tmp 'vertice-vps.tgz'
tar -czf $pacote -C $raiz --exclude=node_modules --exclude=data --exclude=.env --exclude=conta-de-servico.json deploy/vps servers/media servers/worker
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar o código.' }
$enviar += $pacote

$envAlertas = Join-Path $raiz 'servers\worker\.env'
if (Test-Path $envAlertas) {
  Write-Host '== Configuração dos alertas (servers\worker\.env)'
  $seg = Join-Path $tmp 'segredos'
  New-Item -ItemType Directory -Path $seg | Out-Null
  Copy-Item $envAlertas (Join-Path $seg 'worker.env')
  $linha = Get-Content $envAlertas | Where-Object { $_ -match '^\s*GOOGLE_APPLICATION_CREDENTIALS\s*=' } | Select-Object -First 1
  $chave = if ($linha) { ($linha -split '=', 2)[1].Trim().Trim('"') } else { './conta-de-servico.json' }
  if (-not [System.IO.Path]::IsPathRooted($chave)) { $chave = Join-Path (Join-Path $raiz 'servers\worker') $chave }
  if (Test-Path $chave) {
    Copy-Item $chave (Join-Path $seg 'conta-de-servico.json')
  } else {
    Write-Host "   Aviso: não achei a chave da conta de serviço ($chave). Os alertas ficam desligados na VPS." -ForegroundColor Yellow
  }
  $pacoteSeg = Join-Path $tmp 'vertice-segredos.tgz'
  tar -czf $pacoteSeg -C $seg .
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar a configuração dos alertas.' }
  $enviar += $pacoteSeg
} else {
  Write-Host '== Sem servers\worker\.env: os alertas ficam desligados na VPS (veja docs/VPS.md).' -ForegroundColor Yellow
}

if (-not $Midias) {
  $padrao = Join-Path $raiz 'servers\media\data'
  if (Test-Path $padrao) { $Midias = $padrao }
}
if ($Midias) {
  if (-not (Test-Path $Midias)) { throw "Pasta de mídias não encontrada: $Midias" }
  Write-Host "== Mídias do servidor antigo ($Midias)"
  $pacoteMid = Join-Path $tmp 'vertice-midias.tgz'
  tar -czf $pacoteMid -C $Midias .
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar as mídias.' }
  $enviar += $pacoteMid
}

Write-Host "== Enviando para $Servidor (pode pedir a senha da VPS)"
scp -P $Porta @enviar "${Servidor}:"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar os arquivos. Confira o endereço, o usuário e a senha da VPS.' }

Write-Host '== Instalando na VPS (pode pedir a senha de novo)'
$remoto = "set -e; cd ~; rm -rf vertice-vps; mkdir vertice-vps; tar -xzf vertice-vps.tgz -C vertice-vps; " +
  "if [ -f vertice-segredos.tgz ]; then mkdir -p vertice-vps/segredos; tar -xzf vertice-segredos.tgz -C vertice-vps/segredos; fi; " +
  "if [ -f vertice-midias.tgz ]; then mv vertice-midias.tgz vertice-vps/midias-antigas.tgz; fi; " +
  "sed -i 's/\r`$//' vertice-vps/deploy/vps/*; " +
  "S=; [ `$(id -u) -eq 0 ] || S=sudo; `$S bash vertice-vps/deploy/vps/instalar.sh $Dominio $Projeto"
ssh -t -p $Porta $Servidor $remoto
if ($LASTEXITCODE -ne 0) { throw 'A instalação na VPS falhou. A mensagem acima diz o motivo.' }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Host '== Conferindo daqui'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$url = "https://$Dominio"
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 "$url/health"
  if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
} catch {
  Write-Host "$url ainda não responde deste PC ($($_.Exception.Message))." -ForegroundColor Yellow
  Write-Host 'Confira o DNS do domínio e rode este comando de novo. O painel não foi alterado.' -ForegroundColor Yellow
  exit 1
}
Write-Host "Servidor de mídias no ar: $url" -ForegroundColor Green

# O painel publicado passa a enviar as mídias para a VPS.
$envPainel = Join-Path $raiz 'apps\panel\.env'
if (Test-Path $envPainel) {
  $linhas = @(Get-Content $envPainel)
  if ($linhas -match '^VITE_MEDIA_SERVER_URL=') {
    $linhas = $linhas -replace '^VITE_MEDIA_SERVER_URL=.*', "VITE_MEDIA_SERVER_URL=$url"
  } else {
    $linhas += "VITE_MEDIA_SERVER_URL=$url"
  }
  [System.IO.File]::WriteAllLines($envPainel, $linhas)
  Write-Host "apps\panel\.env agora aponta para $url"
}

Write-Host ''
Write-Host 'Falta:'
Write-Host '  1. Publicar o painel web com o endereço novo:     npm run deploy:hosting'
Write-Host '  2. Atualizar o secret PAINEL_ENV no GitHub com o conteúdo de apps\panel\.env'
Write-Host '     (com o GitHub CLI: Get-Content apps\panel\.env -Raw | gh secret set PAINEL_ENV) e lançar uma versão.'
Write-Host '  3. Se já havia mídias no servidor antigo, trocar os links gravados (veja docs/VPS.md).'
