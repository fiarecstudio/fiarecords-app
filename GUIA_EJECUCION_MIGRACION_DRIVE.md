/* ================================================================
   GUÍA DE EJECUCIÓN: Actualizar Permisos de Google Drive
   ================================================================
   
   Este documento te explica cómo ejecutar el script de migración de
   forma segura para actualizar todos tus proyectos viejos.
   
   ================================================================ */

// ================================================================
// PASO 1: VERIFICACIÓN PREVIA
// ================================================================

✅ Antes de ejecutar, verifica que:

1. Tienes Node.js instalado en tu servidor
   $ node --version
   
2. Las variables de entorno están configuradas en tu .env:
   - MONGO_URI (URL de conexión a MongoDB)
   - GMAIL_CLIENT_ID (credencial Google OAuth)
   - GMAIL_CLIENT_SECRET (credencial Google OAuth)
   - GMAIL_REFRESH_TOKEN (token de refresh de Google Drive)
   
3. Estás en la carpeta raíz del servidor (donde está package.json):
   $ pwd
   $ ls -la package.json


// ================================================================
// PASO 2: OPCIÓN A - EJECUTAR EN TU MÁQUINA LOCAL (SEGURO)
// ================================================================

Si quieres hacer un ENSAYO SIN TOCAR el servidor de producción:

1. Clona o copia el proyecto a tu máquina local
2. Instala dependencias:
   $ npm install
   
3. Copia tu archivo .env a la carpeta local (con credenciales reales)
   $ cp /ruta/a/.env .env
   
4. Ejecuta el script:
   $ node migrations/002_actualizar_permisos_drive_antiguos.js
   
Resultado: El script se conectará a tu BD real y actualizará los permisos
sin afectar nada más. Puedes ver en consola exactamente qué hace.


// ================================================================
// PASO 3: OPCIÓN B - EJECUTAR EN SERVIDOR (RECOMENDADO)
// ================================================================

Si tu servidor está en Render, Railway, VPS, etc.:

### 3.1 - Opción B1: VÍA SSH (si tienes acceso SSH):

1. Conéctate a tu servidor:
   $ ssh usuario@tu-servidor.com
   
2. Navega a la carpeta del proyecto:
   $ cd /ruta/al/proyecto
   
3. Verifica el .env:
   $ cat .env | grep MONGO_URI
   
4. Ejecuta el script:
   $ node migrations/002_actualizar_permisos_drive_antiguos.js
   
5. Observa la salida en consola (verás el contador de progreso en tiempo real)

### 3.2 - Opción B2: VÍA RENDER (si está alojado en Render):

1. Ve a tu dashboard de Render: https://dashboard.render.com

2. Selecciona tu servicio backend

3. Ve a "Shell" (consola del servidor)

4. Ejecuta:
   $ node migrations/002_actualizar_permisos_drive_antiguos.js

5. El script mostrará progreso en tiempo real


// ================================================================
// PASO 4: QUÉS ESPERAR DURANTE LA EJECUCIÓN
// ================================================================

El script hará lo siguiente:

✅ Se conectará a MongoDB
✅ Consultará TODOS los proyectos con enlaceEntrega
✅ Para cada proyecto:
   - Extraerá el ID de Google Drive de la URL
   - Cambiará los permisos a "Cualquier persona con enlace puede ver"
   - Mostrará el progreso: "Progreso: X/Y (%%Z)"

⏱️ Velocidad esperada:
   - 100 proyectos ≈ 2-5 minutos (depende de Google Drive API)
   - 1000 proyectos ≈ 20-50 minutos

⚠️ Si una URL está rota o el archivo no existe:
   - El script SALTA automáticamente al siguiente
   - NO SE DETIENE el proceso completo
   - El contador te mostrará cuántos fallaron


// ================================================================
// PASO 5: INTERPRETAR LA SALIDA
// ================================================================

Después de terminar, verás un RESUMEN:

┌─────────────────────────────────────────────────────────────┐
│ ✅ Exitosos: 150/152 (98.7%)                                │
│ ❌ Fallidos: 2/152                                          │
│ ⚠️  Sin ID extraíble: 0/152                                 │
└─────────────────────────────────────────────────────────────┘

✅ EXITOSOS = Permisos cambiados correctamente
❌ FALLIDOS = El archivo/carpeta no existe o hay error de acceso
⚠️  SIN ID = La URL está corrupta y no se pudo extraer el ID

Los FALLIDOS pueden ser:
- Enlaces antiguos que ya no existen
- Carpetas compartidas que no puedes modificar
- Errores de red temporales (puedes reintentar)


// ================================================================
// PASO 6: REINTENTAR SI HAY FALLOS (SEGURO)
// ================================================================

El script es IDEMPOTENTE (puedes ejecutarlo múltiples veces):

1. Si fallaron algunos, espera 5 minutos
2. Ejecuta de nuevo:
   $ node migrations/002_actualizar_permisos_drive_antiguos.js
   
3. Los que ya se actualizaron correctamente se detectarán
   y se saltarán (el script verifica permisos existentes)

Esto es seguro: no causa duplicados ni errores.


// ================================================================
// PASO 7: VERIFICACIÓN MANUAL (OPCIONAL)
// ================================================================

Para comprobar que funcionó:

1. Abre un proyecto en tu app
2. Haz clic en el enlace de Google Drive
3. Abre la carpeta en Drive
4. Haz clic en "Compartir"
5. Verás que el acceso es "Cualquier persona con el enlace"


// ================================================================
// PASO 8: TROUBLESHOOTING
// ================================================================

❌ Error: "MONGO_URI not defined"
   → Asegúrate de que tu .env esté en la raíz del proyecto
   → Verifica que require('dotenv').config() carga las variables
   
❌ Error: "insufficient authentication scopes"
   → El refresh_token de Google no tiene permisos de Drive
   → Necesitas generar un nuevo token incluyendo el scope de Drive
   → Lee: https://developers.google.com/drive/api/guides/about-auth
   
❌ Error: "File not found" para algunos proyectos
   → El enlace es a una carpeta que ya no existe o fue eliminada
   → Esto es normal. El script lo salta automáticamente.
   → Puedes actualizar manualmente esos enlaces en tu DB
   
❌ Script se detiene abruptamente
   → Posible timeout de la conexión
   → Reinicia con: node migrations/002_actualizar_permisos_drive_antiguos.js
   
❌ Lento (tarda mucho)
   → Google Drive API tiene límites de rate limiting
   → Esto es normal. Déjalo ejecutándose sin interrumpir
   → Si realmente es lento (>2 min por proyecto), contacta soporte


// ================================================================
// PASO 9: AUTOMATIZACIÓN (OPCIONAL)
// ================================================================

Si quieres ejecutar esto automáticamente cada cierto tiempo:

### Opción A: Cron job en Linux/Mac:

1. Edita el crontab:
   $ crontab -e
   
2. Añade una línea para ejecutar el script cada mes:
   0 2 1 * * cd /ruta/al/proyecto && node migrations/002_actualizar_permisos_drive_antiguos.js >> /var/log/fiarecords_migration.log 2>&1
   
   Esto ejecuta el 1º de cada mes a las 2 AM

### Opción B: GitHub Actions (si está en GitHub):

1. Crea `.github/workflows/migrate-drive-permisos.yml`:

   name: Actualizar Permisos Drive
   on:
     schedule:
       - cron: '0 2 1 * *'  # Cada mes el 1º a las 2 AM
   
   jobs:
     migrate:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm install
         - run: node migrations/002_actualizar_permisos_drive_antiguos.js
           env:
             MONGO_URI: ${{ secrets.MONGO_URI }}
             GMAIL_CLIENT_ID: ${{ secrets.GMAIL_CLIENT_ID }}
             GMAIL_CLIENT_SECRET: ${{ secrets.GMAIL_CLIENT_SECRET }}
             GMAIL_REFRESH_TOKEN: ${{ secrets.GMAIL_REFRESH_TOKEN }}


// ================================================================
// RESUMEN FINAL
// ================================================================

✅ El script es:
   - Seguro (manejo de errores robusto)
   - Idempotente (sin duplicados)
   - Reutilizable (puede ejecutarse múltiples veces)
   - Sin efectos secundarios negativos

✅ Puedes:
   - Detener el script sin problemas (no afecta BD)
   - Reintentar tantas veces quieras
   - Ejecutar en local o en el servidor
   - Automatizar la ejecución

¿Dudas? Revisa los logs o contacta soporte.

================================================================ */
