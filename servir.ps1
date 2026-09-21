# Servidor HTTP local simples, sem dependências.
#
# Por que existe: o app usa ES Modules e fetch(), que o Chrome/Safari bloqueiam
# quando a página é aberta por file://. Precisa de http://.
#
# Uso:  powershell -ExecutionPolicy Bypass -File servir.ps1
# Depois abra http://localhost:8080 no navegador. Ctrl+C encerra.

param([int]$Porta = 8080)

$raiz = $PSScriptRoot
$prefixo = "http://localhost:$Porta/"

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
}

$ouvinte = New-Object System.Net.HttpListener
$ouvinte.Prefixes.Add($prefixo)

try {
  $ouvinte.Start()
} catch {
  Write-Host "Nao foi possivel abrir a porta $Porta. Tente outra: -Porta 8081" -ForegroundColor Red
  exit 1
}

Write-Host "Servindo $raiz" -ForegroundColor Green
Write-Host "Abra $prefixo no navegador. Ctrl+C para parar." -ForegroundColor Green

while ($ouvinte.IsListening) {
  try {
    $ctx = $ouvinte.GetContext()
  } catch {
    break
  }

  $caminho = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($caminho -eq '/') { $caminho = '/index.html' }
  $arquivo = Join-Path $raiz ($caminho.TrimStart('/') -replace '/', '\')

  if (Test-Path $arquivo -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($arquivo).ToLower()
    $tipo = $tipos[$ext]
    if (-not $tipo) { $tipo = 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($arquivo)
    $ctx.Response.ContentType = $tipo
    # Sem cache: durante o desenvolvimento queremos sempre o arquivo novo.
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nao encontrado: $caminho")
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }

  $ctx.Response.OutputStream.Close()
}

$ouvinte.Stop()
