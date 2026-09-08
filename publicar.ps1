# Publica no GitHub as alterações feitas no projeto.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File publicar.ps1 "descrição da mudança"
#
# Se a descrição for omitida, o script pede uma.
#
# ATENÇÃO — isto NÃO precisa ser executado diariamente.
# A cotação do Banco Central é buscada ao vivo pelo navegador de quem abre a
# página; ela não fica guardada em arquivo nenhum do projeto. Rode este script
# apenas quando o CÓDIGO mudar (um ajuste na interface, uma moeda nova, uma
# correção). Publicar sem alteração de código não muda nada para o usuário.

param([string]$Mensagem)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Há algo para publicar?
$pendente = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pendente)) {
  Write-Host "Nenhuma alteração para publicar. O repositório já está em dia." -ForegroundColor Green
  exit 0
}

Write-Host "Alterações encontradas:" -ForegroundColor Cyan
git status --short
Write-Host ""

if ([string]::IsNullOrWhiteSpace($Mensagem)) {
  $Mensagem = Read-Host "Descreva a mudança em poucas palavras"
  if ([string]::IsNullOrWhiteSpace($Mensagem)) {
    Write-Host "Publicação cancelada: é preciso descrever a mudança." -ForegroundColor Yellow
    exit 1
  }
}

git add -A
git commit -m $Mensagem
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao criar o commit." -ForegroundColor Red; exit 1 }

git push
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "O commit foi criado, mas o envio ao GitHub falhou." -ForegroundColor Red
  Write-Host "Verifique a conexão e rode novamente:  git push" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Publicado com sucesso." -ForegroundColor Green
Write-Host "https://github.com/RafaelAlves-Fermentech/calculadora-conversao-moeda"
