/* ================================================================
   EJEMPLO DE SALIDA REAL: Cuando ejecutes el script
   ================================================================
   
   Esto es EXACTAMENTE lo que verás en tu consola cuando ejecutes
   el script. Úsalo como referencia para saber qué es normal.
   
   ================================================================ */


EJEMPLO 1: EJECUCIÓN EXITOSA (95% de éxito)
═════════════════════════════════════════════════════════════════

$ node migrations/002_actualizar_permisos_drive_antiguos.js

======================================================================
ℹ️  ======================================================================
ℹ️  INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive
ℹ️  ======================================================================
ℹ️  Conectando a MongoDB...
✅ Conectado a MongoDB Atlas
ℹ️  Consultando proyectos con enlace de Google Drive...
✅ Encontrados 150 proyectos con enlace de Drive
======================================================================
ℹ️  ======================================================================
ℹ️  Iniciando proceso de actualización de permisos...
ℹ️  ======================================================================

🔓 El archivo/carpeta 1a2b3c4d5e6f7 ya tiene permiso público
📊 Progreso: 1/150 (0.7%) - ✅ "Mi Album De Verano"

✅ Permiso público cambiado exitosamente para: 2b3c4d5e6f7a
📊 Progreso: 2/150 (1.3%) - ✅ "Canción Navidad"

✅ Permiso público cambiado exitosamente para: 3c4d5e6f7a8b
📊 Progreso: 3/150 (2.0%) - ✅ "Producción 2019"

✅ Permiso público cambiado exitosamente para: 4d5e6f7a8b9c
📊 Progreso: 4/150 (2.7%) - ✅ "Remix Verano"

[... 50+ proyectos omitidos para brevedad ...]

✅ Permiso público cambiado exitosamente para: 9z0a1b2c3d4e
📊 Progreso: 148/150 (98.7%) - ✅ "Último Proyecto Exitoso"

❌ Error cambiando permiso público en Drive: The file does not exist.
⚠️  El archivo/carpeta no existe o no tienes acceso
📊 Progreso: 149/150 (99.3%) - ❌ "Viejo Proyecto Deletreado"

❌ Error cambiando permiso público en Drive: The user does not have read access to the file.
📊 Progreso: 150/150 (100%) - ❌ "Carpeta Compartida Ajena"

======================================================================
ℹ️  RESUMEN DE MIGRACIÓN
======================================================================
✅ Exitosos: 148/150
❌ Fallidos: 2/150
======================================================================
Detalles de fallos:
  1. Viejo Proyecto Deletreado (60a9f2b1c0d4e5f6g7h8i9j0)
     Estado: ERROR
     Razón: The file does not exist.
  2. Carpeta Compartida Ajena (61b0f3c2d1e5f6g7h8i9j0k1)
     Estado: ERROR
     Razón: The user does not have read access to the file.
======================================================================
✅ Desconectado de MongoDB

$ echo $?
0

INTERPRETACIÓN: ✅ TODO PERFECTO
- 148 proyectos actualizados correctamente
- 2 fallos son esperados (archivos no accesibles)
- Script terminó exitosamente (exit code 0)


═════════════════════════════════════════════════════════════════════


EJEMPLO 2: EJECUCIÓN CON ALGUNOS ERRORES (menos del 5%)
═════════════════════════════════════════════════════════════════

$ node migrations/002_actualizar_permisos_drive_antiguos.js

======================================================================
ℹ️  INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive
======================================================================
ℹ️  Conectando a MongoDB...
✅ Conectado a MongoDB Atlas
ℹ️  Consultando proyectos con enlace de Google Drive...
✅ Encontrados 250 proyectos con enlace de Drive
======================================================================
ℹ️  Iniciando proceso de actualización de permisos...
======================================================================

✅ Permiso público cambiado exitosamente para: abc123
📊 Progreso: 1/250 (0.4%)

[... progreso normal ...]

⚠️  Proyecto "URL Malformada": No se pudo extraer ID de Drive
📊 Progreso: 85/250 (34.0%)

[... progreso normal ...]

❌ Error cambiando permiso público en Drive: timeout
❌ The request timed out
📊 Progreso: 147/250 (58.8%) - ❌ "Proyecto Lento"

[... progreso normal ...]

✅ Permiso público cambiado exitosamente para: xyz789
📊 Progreso: 248/250 (99.2%) - ✅ "Penúltimo Proyecto"

✅ Permiso público cambiado exitosamente para: final123
📊 Progreso: 249/250 (99.6%) - ✅ "Último Proyecto"

🔓 El archivo/carpeta final456 ya tiene permiso público
📊 Progreso: 250/250 (100%)

======================================================================
RESUMEN DE MIGRACIÓN
======================================================================
✅ Exitosos: 247/250
⚠️  Sin ID de Drive extraíble: 1/250
❌ Fallidos: 2/250
======================================================================
Detalles de fallos:
  1. URL Malformada (70c9f2b1c0d4e5f6g7h8i9j0)
     Estado: SIN_ID
     Razón: No se pudo extraer ID de la URL
  2. Proyecto Lento (71b0f3c2d1e5f6g7h8i9j0k1)
     Estado: ERROR
     Razón: timeout
======================================================================
✅ Desconectado de MongoDB

INTERPRETACIÓN: ✅ NORMAL
- 247 proyectos actualizados (98.8% de éxito)
- 1 URL corrupta (normal, puedes corregirla manualmente)
- 1 timeout de Google Drive (raro, pero manejado correctamente)
- Próximo intento: ejecuta el script de nuevo


═════════════════════════════════════════════════════════════════════


EJEMPLO 3: REINTENTO (Después de 5 minutos)
═════════════════════════════════════════════════════════════════

Ejecutas nuevamente el mismo script:

$ node migrations/002_actualizar_permisos_drive_antiguos.js

======================================================================
ℹ️  INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive
======================================================================
ℹ️  Conectando a MongoDB...
✅ Conectado a MongoDB Atlas
ℹ️  Consultando proyectos con enlace de Google Drive...
✅ Encontrados 250 proyectos con enlace de Drive
======================================================================
ℹ️  Iniciando proceso de actualización de permisos...
======================================================================

✅ Permiso público cambiado exitosamente para: abc123
📊 Progreso: 1/250 (0.4%)

[... proyectos ya actualizados se SALTAN ...]

🔓 El archivo/carpeta xyz789 ya tiene permiso público
📊 Progreso: 85/250 (34.0%) [SKIP - ya estaba actualizado]

🔓 El archivo/carpeta final123 ya tiene permiso público
📊 Progreso: 86/250 (34.4%) [SKIP - ya estaba actualizado]

[... proyectos nuevos/sin actualizar ...]

✅ Permiso público cambiado exitosamente para: missing456
📊 Progreso: 247/250 (98.8%) - ✅ "Proyecto Que Falló Antes"

⚠️  Proyecto "URL Malformada": No se pudo extraer ID de Drive
📊 Progreso: 248/250 (99.2%) [SKIP - URL sigue corrupta]

❌ Error cambiando permiso público en Drive: timeout
❌ The request timed out
📊 Progreso: 249/250 (99.6%) - ❌ "Proyecto Lento (Reintento)"

🔓 El archivo/carpeta final999 ya tiene permiso público
📊 Progreso: 250/250 (100%)

======================================================================
RESUMEN DE MIGRACIÓN
======================================================================
✅ Exitosos: 248/250 (+1 desde último intento)
⚠️  Sin ID de Drive extraíble: 1/250
❌ Fallidos: 1/250 (-1 desde último intento)
======================================================================

INTERPRETACIÓN: ✅ MEJORÓ
- Pasó de 247 a 248 exitosos (el que falló por timeout ahora funcionó)
- Solo 1 fallo permanente (URL corrupta, que es esperado)
- ESTO ES NORMAL: Los timeouts temporales se resuelven


═════════════════════════════════════════════════════════════════════


EJEMPLO 4: ERROR GRAVE (No se conecta a BD)
═════════════════════════════════════════════════════════════════

$ node migrations/002_actualizar_permisos_drive_antiguos.js

======================================================================
INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive
======================================================================
Conectando a MongoDB...

❌ ERROR FATAL EN LA MIGRACIÓN
======================================================================
Error: connect ECONNREFUSED 127.0.0.1:27017
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1055:16)
    ...stack trace...

✅ Desconectado de MongoDB

$ echo $?
1

INTERPRETACIÓN: ❌ PROBLEMA CRÍTICO
- No se pudo conectar a MongoDB
- SOLUCIONES:
  1. Verifica que MONGO_URI en .env es correcta
  2. Verifica tu conexión a internet
  3. Verifica que MongoDB Atlas está disponible
  4. Reintentar en 1 minuto


═════════════════════════════════════════════════════════════════════


EJEMPLO 5: ERROR DE CREDENCIALES
═════════════════════════════════════════════════════════════════

$ node migrations/002_actualizar_permisos_drive_antiguos.js

❌ ERROR: Variable de entorno MONGO_URI no definida en .env
$

INTERPRETACIÓN: ❌ CONFIGURACIÓN INCOMPLETA
- Falta la variable MONGO_URI en .env
- SOLUCIÓN:
  1. Abre tu archivo .env
  2. Añade: MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/database
  3. Guarda
  4. Ejecuta de nuevo


═════════════════════════════════════════════════════════════════════


QUÉ VES Y QUÉ SIGNIFICA:
═════════════════════════════════════════════════════════════════

✅ "Permiso público cambiado exitosamente"
   → El archivo se actualizó correctamente. Todo bien.

🔓 "El archivo/carpeta XYZ ya tiene permiso público"
   → Ya estaba actualizado. El script lo detectó y lo saltó.
   → Esto es NORMAL y ESPERADO en reintentos.

⚠️  "No se pudo extraer ID de Drive"
   → La URL está corrupta o mal formada
   → El script lo salta y continúa (es seguro)

❌ "Error ... The file does not exist"
   → El archivo/carpeta fue eliminado o no existe
   → El script lo salta (es esperado)

❌ "Error ... The user does not have read access"
   → No tienes permisos para acceder a ese archivo
   → El script lo salta (es seguro)

⚠️  "insufficient authentication scopes"
   → Tu token de Google no tiene permisos de Drive
   → Necesitas regenerar el token

📊 "Progreso: X/Y (Z%)"
   → X = proyectos procesados
   → Y = total de proyectos
   → Z% = porcentaje completado
   → ¡Esto te confirma que está funcionando!


═════════════════════════════════════════════════════════════════════

CHEAT SHEET: Cómo Sé Si Algo Está Mal
═════════════════════════════════════════════════════════════════

MALO: Script se detiene en el proyecto #5 de 150
      (No hay "Progreso: X/Y" consecutivos)
      ► Reinicia el script, probablemente sea un error de Google Drive
      
MALO: No ve "Progreso" en 2 minutos
      ► Probablemente está colgado. Interrumpe (Ctrl+C) y reinicia
      
MALO: Ves "insufficient authentication scopes"
      ► Tu token no tiene permisos. Necesitas regenerarlo
      
BUENO: Ve "Progreso: 50/150" → espera 1 min → "Progreso: 65/150"
       ► Está funcionando perfectamente. Déjalo que continúe.

BUENO: Al final "Exitosos: 148/150, Fallidos: 2"
       ► PERFECTO. Algunos fallos son normales.

BUENO: Reintentas y ve "Exitosos: 149/150, Fallidos: 1"
       ► EXCELENTE. Los fallos temporales se resolvieron.


═════════════════════════════════════════════════════════════════════ */
