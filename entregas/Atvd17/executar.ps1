param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [int]$Port = 55439
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runDirectory = Join-Path $projectRoot ('tmp\atividade-persistencia-' + [guid]::NewGuid().ToString('N'))
$dataDirectory = Join-Path $runDirectory 'data'
$previousTestUrl = $env:TEST_DATABASE_URL
$previousPgPassword = $env:PGPASSWORD
$started = $false
$originalLocation = Get-Location

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Program (codigo $LASTEXITCODE)." }
}

try {
    foreach ($program in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe')) {
        if (!(Test-Path -LiteralPath (Join-Path $PostgresBin $program))) {
            throw "PostgreSQL nao encontrado. Informe -PostgresBin com a pasta bin instalada."
        }
    }
    Set-Location -LiteralPath $projectRoot
    New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
    $env:PGPASSWORD = $null
    Invoke-Checked (Join-Path $PostgresBin 'initdb.exe') @('-D', $dataDirectory, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C')
    Invoke-Checked (Join-Path $PostgresBin 'pg_ctl.exe') @('-D', $dataDirectory, '-l', (Join-Path $runDirectory 'postgres.log'), '-o', "-h 127.0.0.1 -p $Port -F", '-w', 'start')
    $started = $true
    Invoke-Checked (Join-Path $PostgresBin 'createdb.exe') @('-h', '127.0.0.1', '-p', "$Port", '-U', 'postgres', 'estoque_revisao_atividade_test')
    $env:TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$Port/estoque_revisao_atividade_test"

    # O comando dedicado falha se faltar banco ou se a suite nao passar.
    Invoke-Checked 'npm.cmd' @('run', 'test:atividade')
    New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'codigo-fonte') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'apps\backend\src\modules\products\products-persistence.integration.spec.ts') -Destination (Join-Path $PSScriptRoot 'codigo-fonte\products-persistence.integration.spec.ts')
    Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'gerar-relatorio.cjs'))
    Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'capturar-relatorio.cjs'))
    Write-Host 'ATIVIDADE APROVADA - resultado-jest.json atualizado em entregas.' -ForegroundColor Green
} finally {
    if ($started) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDirectory -m fast -w stop
        if ($LASTEXITCODE -ne 0) { Write-Warning "Nao foi possivel encerrar a instancia temporaria: $dataDirectory" }
    }
    $env:TEST_DATABASE_URL = $previousTestUrl
    $env:PGPASSWORD = $previousPgPassword
    Set-Location -LiteralPath $originalLocation.Path
}
