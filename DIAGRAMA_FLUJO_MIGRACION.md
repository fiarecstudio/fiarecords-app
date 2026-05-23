/* ================================================================
   DIAGRAMA DE FLUJO: Script de Migración de Permisos Drive
   ================================================================ */

FLUJO DEL SCRIPT:
═════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────┐
│ INICIO: node migrations/002_...js                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ✓ Validar variables de entorno (.env)                      │
│   - MONGO_URI                                              │
│   - GMAIL_CLIENT_ID, SECRET, REFRESH_TOKEN                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Conectar a MongoDB Atlas                                 │
│   await mongoose.connect(MONGO_URI)                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Consultar TODOS los proyectos con enlaceEntrega         │
│   Proyecto.find({ enlaceEntrega: { $ne: '' } })           │
│   Result: Array de 150 proyectos (ejemplo)                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 🔄 BUCLE: for...of a través de cada proyecto               │
│ ═══════════════════════════════════════════════════════════│
│                                                             │
│  PROYECTO #1: "Mi Album De Verano"                        │
│  ├─ enlaceEntrega: "https://drive.google.com/drive/..."   │
│  │                                                         │
│  ├─ TRY {                                                  │
│  │   ├─ extraerDriveId(url) → "1a2b3c4d5e6f7..."        │
│  │   │                                                     │
│  │   ├─ cambiarPermisoPublico(driveId)                    │
│  │   │   └─ drive.permissions.create({                   │
│  │   │       type: 'anyone',                             │
│  │   │       role: 'reader'                              │
│  │   │     })                                             │
│  │   │                                                     │
│  │   └─ ✅ EXITOSO → estadisticas.exitosos++             │
│  │                                                         │
│  └─ CATCH (error) {                                       │
│     └─ ❌ FALLO → estadisticas.fallidos++                 │
│        Continuar al siguiente (NO se detiene)             │
│     }                                                      │
│                                                             │
│  📊 Progreso: 1/150 (0.7%) ✅ "Mi Album De Verano"        │
│  📊 Progreso: 2/150 (1.3%) ✅ "Canción Navidad"           │
│  📊 Progreso: 3/150 (2.0%) ❌ "Producción 2019"           │
│  ...                                                       │
│  📊 Progreso: 150/150 (100%) ✅ "Último Proyecto"         │
│                                                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 📊 MOSTRAR RESUMEN FINAL:                                   │
│ ═════════════════════════════════════════════════════════   │
│ ✅ Exitosos: 148/150 (98.7%)                               │
│ ❌ Fallidos: 2/150 (1.3%)                                  │
│ ⚠️  Sin ID extraíble: 0/150                                 │
│                                                             │
│ Detalles de fallos:                                        │
│  1. "Viejo Proyecto Eliminado" - Archivo no existe         │
│  2. "Carpeta Compartida" - No tienes permiso para cambiar │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 🔌 Desconectar de MongoDB                                  │
│   await mongoose.connection.close()                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ ✅ FIN: Script completado exitosamente                     │
└─────────────────────────────────────────────────────────────┘


MANEJO DE ERRORES:
═════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────┐
│ Proyecto 50: "Producción 2019"          │
└──────────────────────────────────────────┘
         │
         ├─ extraerDriveId() ✓ Devuelve "xyz123"
         │
         └─ cambiarPermisoPublico("xyz123")
            │
            └─ TRY {
                 drive.permissions.create()
                 │
                 ├─ ❌ ERROR: "File not found"
                 └─ CATCH (error)
                    │
                    ├─ Log: "❌ Error: File not found"
                    ├─ Registro en detalles
                    ├─ estadisticas.fallidos++
                    │
                    └─ CONTINUE → Siguiente proyecto (¡NO se detiene!)


IDEMPOTENCIA (Ejecutar 2 veces = SEGURO):
═════════════════════════════════════════════════════════════════

EJECUCIÓN #1:
│
└─ Proyecto A: Sin permisos público
   └─ Cambiar permiso → ✅ ÉXITO

EJECUCIÓN #2 (mismo proyecto):
│
└─ Proyecto A: Ya tiene permiso público
   └─ El script verifica primero (verifica permisos existentes)
      └─ Detecta que ya está hecho → ✅ SKIP (no se modifica)


CASOS DE ERROR Y RECUPERACIÓN:
═════════════════════════════════════════════════════════════════

CASO 1: URL CORRUPTA
  enlaceEntrega: "https://drive.google.com/abc123"  (sin estructura Drive)
  │
  └─ extraerDriveId() → null
     └─ Log: "⚠️  No se pudo extraer ID"
        └─ estadisticas.sinId++
           └─ CONTINUE

CASO 2: ARCHIVO NO EXISTE
  enlaceEntrega: "https://drive.google.com/file/d/DELETED123/view"
  │
  └─ extraerDriveId() → "DELETED123"
     └─ cambiarPermisoPublico("DELETED123")
        └─ Error: "File not found"
           └─ CATCH
              └─ Log: "❌ Error"
                 └─ estadisticas.fallidos++
                    └─ CONTINUE

CASO 3: TIMEOUT DE RED (raro pero posible)
  │
  └─ cambiarPermisoPublico() timeout
     └─ CATCH (error)
        └─ estadisticas.fallidos++
           └─ CONTINUE

Solución: Ejecutar nuevamente el script
  (Idempotencia garantiza que los exitosos no se vuelven a tocar)


EJEMPLO DE SALIDA COMPLETA:
═════════════════════════════════════════════════════════════════

$ node migrations/002_actualizar_permisos_drive_antiguos.js

======================================================================
INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive
======================================================================
ℹ️  Conectando a MongoDB...
✅ Conectado a MongoDB Atlas
ℹ️  Consultando proyectos con enlace de Google Drive...
✅ Encontrados 150 proyectos con enlace de Drive
======================================================================
ℹ️  Iniciando proceso de actualización de permisos...
======================================================================
📊 Progreso: 1/150 (0.7%) - ✅ "Mi Album De Verano"
📊 Progreso: 2/150 (1.3%) - ✅ "Canción Navidad"
📊 Progreso: 3/150 (2.0%) - ✅ "Producción 2019"
...
📊 Progreso: 148/150 (98.7%) - ✅ "Último Éxito"
📊 Progreso: 149/150 (99.3%) - ❌ "Viejo Deletreado"
📊 Progreso: 150/150 (100%) - ❌ "Carpeta Compartida"
======================================================================
RESUMEN DE MIGRACIÓN
======================================================================
✅ Exitosos: 148/150
❌ Fallidos: 2/150
======================================================================
Detalles de fallos:
  1. Viejo Deletreado (60a9f2b1c0d4e5f6g7h8i9j0)
     Estado: ERROR
     Razón: The file does not exist.
  2. Carpeta Compartida (61b0f3c2d1e5f6g7h8i9j0k1)
     Estado: ERROR
     Razón: The user has not granted access to the file.
======================================================================
✅ Conectado a MongoDB
✅ Migración completada exitosamente

================================================================ */
