# ================================================================
# SCRIPT DE EJECUCIÓN: Windows PowerShell para la Migración
# ================================================================
# 
# Este script automatiza todo el proceso de ejecución en Windows
# 
# OPCIÓN 1 - Ejecutar directamente:
# $ .\ejecutar_migracion.ps1
#
# OPCIÓN 2 - Ejecutar permitiendo scripts (si obtienes error):
# $ Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
# $ .\ejecutar_migracion.ps1
#
# ================================================================

# Colores para output
$colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
    Progress = "Magenta"
}

function Write-Color($message, $color) {
    Write-Host $message -ForegroundColor $color
}

# ================================================================
# PASO 1: VERIFICACIONES PREVIAS
# ================================================================

Write-Color "================================================" $colors.Info
Write-Color "  SCRIPT DE MIGRACIÓN - GOOGLE DRIVE PERMISOS" $colors.Info
Write-Color "================================================`n" $colors.Info

Write-Color "📋 Paso 1: Verificando requisitos previos..." $colors.Info

# Verificar Node.js
try {
    $nodeVersion = node --version
    Write-Color "✓ Node.js instalado: $nodeVersion" $colors.Success
} catch {
    Write-Color "✗ Node.js no encontrado. Instálalo desde https://nodejs.org/" $colors.Error
    exit 1
}

# Verificar que estamos en la carpeta correcta
if (-not (Test-Path "package.json")) {
    Write-Color "✗ package.json no encontrado" $colors.Error
    Write-Color "  Asegúrate de estar en la carpeta raíz del proyecto" $colors.Error
    exit 1
}
Write-Color "✓ Ubicación correcta (package.json encontrado)" $colors.Success

# Verificar .env
if (-not (Test-Path ".env")) {
    Write-Color "✗ Archivo .env no encontrado" $colors.Error
    Write-Color "  Copia tu .env a esta carpeta con las credenciales" $colors.Error
    exit 1
}
Write-Color "✓ Archivo .env presente" $colors.Success

# Verificar variables de entorno
Write-Color "`n📋 Paso 2: Validando variables de entorno..." $colors.Info

$envContent = Get-Content ".env" -Raw
$hasMongoUri = $envContent -match "MONGO_URI"
$hasGmailId = $envContent -match "GMAIL_CLIENT_ID"
$hasGmailSecret = $envContent -match "GMAIL_CLIENT_SECRET"
$hasGmailToken = $envContent -match "GMAIL_REFRESH_TOKEN"

if ($hasMongoUri) { Write-Color "  ✓ MONGO_URI definida" $colors.Success } 
else { Write-Color "  ✗ MONGO_URI no definida" $colors.Error; exit 1 }

if ($hasGmailId) { Write-Color "  ✓ GMAIL_CLIENT_ID definida" $colors.Success } 
else { Write-Color "  ✗ GMAIL_CLIENT_ID no definida" $colors.Error; exit 1 }

if ($hasGmailSecret) { Write-Color "  ✓ GMAIL_CLIENT_SECRET definida" $colors.Success } 
else { Write-Color "  ✗ GMAIL_CLIENT_SECRET no definida" $colors.Error; exit 1 }

if ($hasGmailToken) { Write-Color "  ✓ GMAIL_REFRESH_TOKEN definida" $colors.Success } 
else { Write-Color "  ✗ GMAIL_REFRESH_TOKEN no definida" $colors.Error; exit 1 }

# Verificar que existe el script de migración
Write-Color "`n📋 Paso 3: Verificando script de migración..." $colors.Info
if (-not (Test-Path "migrations/002_actualizar_permisos_drive_antiguos.js")) {
    Write-Color "✗ Script de migración no encontrado" $colors.Error
    Write-Color "  Ruta esperada: migrations/002_actualizar_permisos_drive_antiguos.js" $colors.Error
    exit 1
}
Write-Color "✓ Script de migración encontrado" $colors.Success

# ================================================================
# PASO 2: INSTALAR DEPENDENCIAS SI ES NECESARIO
# ================================================================

Write-Color "`n📋 Paso 4: Verificando dependencias de npm..." $colors.Info
if (-not (Test-Path "node_modules")) {
    Write-Color "⚠️  node_modules no encontrado. Instalando dependencias..." $colors.Warning
    Write-Color "  (Esto puede tomar 1-2 minutos)" $colors.Info
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Color "✗ Error instalando dependencias" $colors.Error
        exit 1
    }
} else {
    Write-Color "✓ node_modules ya existe" $colors.Success
}

# ================================================================
# PASO 3: CONFIRMACIÓN DEL USUARIO
# ================================================================

Write-Color "`n================================================" $colors.Warning
Write-Color "  ⚠️  CONFIRMACIÓN DE MIGRACIÓN" $colors.Warning
Write-Color "================================================`n" $colors.Warning

Write-Color "Este script va a:" $colors.Info
Write-Color "  1. Conectarse a MongoDB" $colors.Info
Write-Color "  2. Consultar TODOS los proyectos con enlace de Drive" $colors.Info
Write-Color "  3. Cambiar permisos a 'Cualquier persona con enlace puede ver'" $colors.Info
Write-Color "  4. Mostrar progreso en tiempo real" $colors.Info
Write-Color "  5. Mostrar resumen de éxitos/fallos" $colors.Info

Write-Color "`n✓ El proceso es SEGURO y puede ejecutarse múltiples veces" $colors.Success
Write-Color "✓ Si un proyecto falla, el script continúa sin detenerse" $colors.Success

$response = Read-Host "`n¿Deseas continuar? (s/n)"
if ($response -ne "s" -and $response -ne "S") {
    Write-Color "Migración cancelada." $colors.Warning
    exit 0
}

# ================================================================
# PASO 4: EJECUTAR LA MIGRACIÓN
# ================================================================

Write-Color "`n================================================" $colors.Progress
Write-Color "  🚀 INICIANDO MIGRACIÓN..." $colors.Progress
Write-Color "================================================`n" $colors.Progress

$startTime = Get-Date

# Ejecutar el script y capturar salida
& node migrations/002_actualizar_permisos_drive_antiguos.js

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    $duration = (Get-Date) - $startTime
    Write-Color "`n================================================" $colors.Success
    Write-Color "  [OK] MIGRACION COMPLETADA" $colors.Success
    Write-Color "================================================" $colors.Success
    Write-Color "Tiempo total: $($duration.TotalSeconds) segundos`n" $colors.Info
} else {
    Write-Color "`n================================================" $colors.Error
    Write-Color "  [ERROR] La migracion termino con errores" $colors.Error
    Write-Color "================================================`n" $colors.Error
}
