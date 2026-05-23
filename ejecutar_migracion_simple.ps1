# ================================================================
# SCRIPT SIMPLE: Ejecutar Migracion de Permisos Drive
# ================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MIGRACION: Google Drive Permisos" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
Write-Host "[1/3] Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js no encontrado" -ForegroundColor Red
    exit 1
}

# Verificar .env
Write-Host "[2/3] Verificando archivo .env..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] No se encontro .env" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Archivo .env existe" -ForegroundColor Green

# Verificar script de migracion
Write-Host "[3/3] Verificando script de migracion..." -ForegroundColor Yellow
if (-not (Test-Path "migrations/002_actualizar_permisos_drive_antiguos.js")) {
    Write-Host "[ERROR] No se encontro el script" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Script de migracion encontrado" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  INICIANDO MIGRACION..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Ejecutar el script
node migrations/002_actualizar_permisos_drive_antiguos.js

$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  [EXITO] Migracion completada" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  [ERROR] Migracion con errores" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

exit $exitCode
