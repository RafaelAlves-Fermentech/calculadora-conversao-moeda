# Diagnóstico da fonte de cotações do Banco Central.
#
# Uso:  powershell -ExecutionPolicy Bypass -File diagnostico.ps1
#
# Para que serve: se a calculadora voltar a dizer que não conseguiu obter as
# cotações, rode isto antes de qualquer outra coisa. Em alguns segundos ele diz
# se o problema é a internet, se é o Banco Central fora do ar, ou se é a API
# recusando alguma opção da consulta — que foi o que aconteceu em 09/10/2026,
# quando o serviço passou a responder 403 para qualquer consulta com $select.
#
# O teste percorre as opções da consulta uma a uma, então aponta exatamente
# qual delas parou de ser aceita.

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
        'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'

$ate   = (Get-Date).ToString('MM-dd-yyyy')
$desde = (Get-Date).AddDays(-15).ToString('MM-dd-yyyy')
$per   = "@moeda=%27USD%27&@dataInicial=%27$desde%27&@dataFinalCotacao=%27$ate%27&`$format=json"

function Testar([string]$nome, [string]$extra) {
  $url = "$base`?$per$extra"
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
    return [pscustomobject]@{ Teste = $nome; Status = $r.StatusCode; Ok = $true; Corpo = $r.Content }
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $motivo = if ($code) { "HTTP $code" } else { $_.Exception.Message }
    return [pscustomobject]@{ Teste = $nome; Status = $motivo; Ok = $false; Corpo = $null }
  }
}

Write-Host ''
Write-Host 'Diagnostico da fonte de cotacoes - Banco Central (PTAX/Olinda)' -ForegroundColor Cyan
Write-Host ("Periodo consultado: $desde a $ate") -ForegroundColor DarkGray
Write-Host ''

$resultados = @(
  (Testar 'consulta minima (so o periodo)'        ''),
  (Testar 'com $filter (boletim de Fechamento)'   '&$filter=tipoBoletim%20eq%20%27Fechamento%27'),
  (Testar 'com $orderby'                          '&$orderby=dataHoraCotacao%20desc'),
  (Testar 'com $top'                              '&$top=1'),
  (Testar 'com $select  (removido em 09/10/2026)' '&$select=cotacaoVenda%2CdataHoraCotacao'),
  (Testar 'consulta que a calculadora usa'        '&$filter=tipoBoletim%20eq%20%27Fechamento%27&$orderby=dataHoraCotacao%20desc&$top=1')
)

foreach ($r in $resultados) {
  $cor = if ($r.Ok) { 'Green' } else { 'Red' }
  $marca = if ($r.Ok) { 'OK  ' } else { 'FALHA' }
  Write-Host ("  {0}  {1,-46} {2}" -f $marca, $r.Teste, $r.Status) -ForegroundColor $cor
}

Write-Host ''

$minima    = $resultados[0]
$usadaApp  = $resultados[5]
$select    = $resultados[4]

if ($usadaApp.Ok) {
  # Mostra a cotacao de venda obtida, para conferencia.
  try {
    $json = $usadaApp.Corpo | ConvertFrom-Json
    $fech = $json.value | Where-Object { $_.tipoBoletim -eq 'Fechamento' } |
            Sort-Object dataHoraCotacao -Descending | Select-Object -First 1
    if ($fech) {
      Write-Host 'A calculadora esta funcionando normalmente.' -ForegroundColor Green
      Write-Host ("  Dolar - cotacao de VENDA: {0}  (boletim de {1})" -f $fech.cotacaoVenda, $fech.dataHoraCotacao)
    }
  } catch {
    Write-Host 'A consulta respondeu, mas o conteudo veio fora do formato esperado.' -ForegroundColor Yellow
  }
} elseif ($minima.Ok) {
  Write-Host 'ATENCAO: a consulta normal falhou, mas a consulta minima funciona.' -ForegroundColor Yellow
  Write-Host 'A calculadora continua correta: ela cai sozinha no plano B.' -ForegroundColor Yellow
  Write-Host 'Veja acima qual opcao parou de ser aceita e remova-a de src/bcb-service.js.'
} else {
  Write-Host 'O Banco Central nao respondeu a nenhuma consulta.' -ForegroundColor Red
  Write-Host 'Pode ser falta de internet, bloqueio da rede da empresa, ou o servico fora do ar.'
  Write-Host 'A calculadora mostra a ultima cotacao guardada, avisando que e antiga.'
}

if (-not $select.Ok) {
  Write-Host ''
  Write-Host ('Nota: $select continua recusado ({0}). E esperado desde 09/10/2026 -' -f $select.Status) -ForegroundColor DarkGray
  Write-Host '      a calculadora nao usa mais essa opcao.' -ForegroundColor DarkGray
}
Write-Host ''
