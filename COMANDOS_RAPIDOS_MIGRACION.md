/* ================================================================
   QUICK START: Comandos para ejecutar el script
   ================================================================
   
   Copia y pega estos comandos según tu situación
   
   ================================================================ */


// =============================================
// OPCIÓN 1: LOCAL (En tu máquina)
// =============================================

// Paso 1: Navega a la carpeta del proyecto
cd "c:\Users\recep\Documents\FiaRecords_Servidor_NUEVA VERSION 27 MZO\FiaRecords_Servidor_NUEVA VERSION\FiaRecords_Servidor_NUEVA VERSION\FiaRecords_Servidor_Final"

// Paso 2: Asegúrate que .env existe con credenciales
cat .env | grep MONGO_URI
cat .env | grep GMAIL_CLIENT_ID

// Paso 3: Instala/verifica dependencias (si no las has instalado)
npm install

// Paso 4: EJECUTA EL SCRIPT
node migrations/002_actualizar_permisos_drive_antiguos.js

// ¡LISTO! Verás el progreso en vivo en consola


// =============================================
// OPCIÓN 2: SSH al servidor (VPS, etc.)
// =============================================

// Reemplaza:
// - usuario@servidor = tu usuario y servidor
// - /ruta/al/proyecto = ruta del proyecto en el servidor

// Paso 1: Conéctate por SSH
ssh usuario@servidor

// Paso 2: Navega al proyecto
cd /ruta/al/proyecto

// Paso 3: Verifica .env
cat .env | grep MONGO_URI

// Paso 4: Ejecuta el script
node migrations/002_actualizar_permisos_drive_antiguos.js

// Si deseas capturar la salida en un archivo (por si se desconecta):
node migrations/002_actualizar_permisos_drive_antiguos.js | tee migracion_$(date +%Y%m%d_%H%M%S).log


// =============================================
// OPCIÓN 3: RENDER (Dashboard web)
// =============================================

// 1. Accede a: https://dashboard.render.com
// 2. Selecciona tu servicio backend
// 3. Ve a pestaña "Shell"
// 4. Ejecuta:

node migrations/002_actualizar_permisos_drive_antiguos.js


// =============================================
// OPCIÓN 4: HEROKU (si lo tienes en Heroku)
// =============================================

// 1. Instala Heroku CLI
// 2. Autentica:
heroku login

// 3. Ejecuta en el dyno:
heroku run "node migrations/002_actualizar_permisos_drive_antiguos.js" --app tu-app-name

// Para ver los logs:
heroku logs --tail --app tu-app-name


// =============================================
// OPCIÓN 5: DOCKER (si está containerizado)
// =============================================

// Si tu app corre en Docker:
docker exec -it tu-container-name node migrations/002_actualizar_permisos_drive_antiguos.js


// =============================================
// MONITOREO: Ver progreso si se desconecta
// =============================================

// Si estás en SSH y la conexión se corta:

// 1. Ejecuta con nohup (no cierra al desconectar):
nohup node migrations/002_actualizar_permisos_drive_antiguos.js > migracion.log 2>&1 &

// 2. Ver en vivo:
tail -f migracion.log

// 3. Ver al proceso background:
ps aux | grep node


// =============================================
// REINTENTAR si fallos
// =============================================

// El script es seguro de reintentar:
// Solo actualiza los que aún no están actualizados

node migrations/002_actualizar_permisos_drive_antiguos.js

// Espera 5 minutos entre intentos para evitar rate limiting de Google


// =============================================
// DEPURACIÓN: Si hay errores
// =============================================

// Ver si .env se carga correctamente:
node -e "require('dotenv').config(); console.log('MONGO_URI:', process.env.MONGO_URI ? '✓' : '✗'); console.log('GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? '✓' : '✗');"

// Probar conexión a MongoDB:
node -e "require('dotenv').config(); const mongoose = require('mongoose'); mongoose.connect(process.env.MONGO_URI).then(() => { console.log('✓ MongoDB conectado'); process.exit(0); }).catch(e => { console.error('✗ Error:', e.message); process.exit(1); });"

// Ver proyectos que serán actualizados (sin modificar):
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const Proyecto = require('./models/Proyecto');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const proyectos = await Proyecto.find({ enlaceEntrega: { \$ne: '' } }).select('nombreProyecto enlaceEntrega').limit(5);
  console.log('Primeros 5 proyectos:');
  proyectos.forEach(p => console.log('- ' + p.nombreProyecto));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"


// =============================================
// AUTOMATIZACIÓN: Ejecutar cada mes
// =============================================

// En servidor Linux/Mac, agregar a crontab:
crontab -e

// Pega esta línea (ejecuta el 1º de cada mes a las 2 AM):
0 2 1 * * cd /ruta/al/proyecto && node migrations/002_actualizar_permisos_drive_antiguos.js >> /var/log/fiarecords_migration.log 2>&1

// Guardar: Ctrl+X → Y → Enter


// =============================================
// VERIFICACIÓN: Revisar que funcionó
// =============================================

// En tu app web, abre un proyecto que fue actualizado:
// 1. Haz click en el enlace de Google Drive
// 2. Abre la carpeta en Google Drive
// 3. Click en "Compartir" (botón arriba a la derecha)
// 4. Verás: "Cualquier persona con el enlace puede ver" ✓


// =============================================
// REPORTAR PROBLEMAS
// =============================================

// Si algo no funciona, guarda los logs y reporta:

// En SSH con salida a archivo:
node migrations/002_actualizar_permisos_drive_antiguos.js > migracion_error.log 2>&1

// Luego envía el archivo migracion_error.log al soporte


// =============================================
// LIMPIEZA: Después de terminar
// =============================================

// Si generaste archivos de log, puedes limpiar:
rm migracion_*.log

// No elimines los archivos del script permanentemente - podrías necesitarlos de nuevo


================================================================ */
