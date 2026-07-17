# servir.ps1 — "El servidor de pruebas"
# Único trabajo: servir la carpeta del proyecto por http para poder abrir la app
# en el navegador. Hace falta porque main.js se carga como módulo ES y los
# navegadores bloquean los imports si el archivo se abre con doble clic (file://).
#
# Uso:  powershell -ExecutionPolicy Bypass -File servir.ps1
# Luego abre:  http://localhost:8099/Codigo/index.html
# Para pararlo: Ctrl+C en esta ventana.

param([int]$Puerto = 8099)

$raiz = $PSScriptRoot
$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add("http://localhost:$Puerto/")

try {
    $oyente.Start()
} catch {
    Write-Host "No se pudo abrir el puerto $Puerto. ¿Ya hay otro servidor usándolo?" -ForegroundColor Red
    Write-Host "Prueba con otro puerto:  .\servir.ps1 -Puerto 8100" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Sirviendo: $raiz" -ForegroundColor Gray
Write-Host "  Abre en el navegador:  http://localhost:$Puerto/Codigo/index.html" -ForegroundColor Cyan
Write-Host "  Ctrl+C para parar." -ForegroundColor Gray
Write-Host ""

$tipos = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.csv'  = 'text/csv; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml'
}

try {
    while ($oyente.IsListening) {
        $ctx = $oyente.GetContext()
        $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))

        # La raíz redirige de verdad a la app: si nos limitáramos a servir aquí el
        # index.html, el navegador buscaría los módulos en /src/... (404) y la
        # página se vería bien pero sin JavaScript.
        if ($ruta -eq '' -or $ruta -eq 'index.html') {
            $ctx.Response.StatusCode = 302
            $ctx.Response.RedirectLocation = '/Codigo/index.html'
            $ctx.Response.Close()
            Write-Host "  302  / -> /Codigo/index.html" -ForegroundColor DarkGray
            continue
        }

        $archivo = Join-Path $raiz $ruta

        # No servir nada fuera de la carpeta del proyecto.
        $dentro = $false
        try {
            $completa = [System.IO.Path]::GetFullPath($archivo)
            $dentro = $completa.StartsWith([System.IO.Path]::GetFullPath($raiz), [StringComparison]::OrdinalIgnoreCase)
        } catch {}

        if ($dentro -and (Test-Path $archivo -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
            $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
            # Sin caché: al recargar siempre se ve el último cambio.
            $ctx.Response.Headers.Add('Cache-Control', 'no-store')
            $bytes = [System.IO.File]::ReadAllBytes($archivo)
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("  200  " + $ruta) -ForegroundColor DarkGray
        } else {
            $ctx.Response.StatusCode = 404
            Write-Host ("  404  " + $ruta) -ForegroundColor DarkYellow
        }
        $ctx.Response.Close()
    }
} finally {
    $oyente.Stop()
    $oyente.Close()
}
