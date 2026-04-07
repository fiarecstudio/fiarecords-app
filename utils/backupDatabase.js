/**
 * Módulo de Backup Automático para MongoDB
 * Ejecuta respaldo diario a las 3:00 AM y limpia archivos de más de 7 días
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Importar todos los modelos de Mongoose
const Artista = require('../models/Artista');
const Configuracion = require('../models/Configuracion');
const Deuda = require('../models/Deuda');
const Proyecto = require('../models/Proyecto');
const Servicio = require('../models/Servicio');
const Usuario = require('../models/Usuario');

// Definir colecciones a respaldar
const colecciones = [
    { modelo: Artista, nombre: 'artistas' },
    { modelo: Configuracion, nombre: 'configuraciones' },
    { modelo: Deuda, nombre: 'deudas' },
    { modelo: Proyecto, nombre: 'proyectos' },
    { modelo: Servicio, nombre: 'servicios' },
    { modelo: Usuario, nombre: 'usuarios' }
];

const BACKUP_DIR = path.join(__dirname, '..', 'backup');

// Asegurar que la carpeta backup existe
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`📁 Carpeta backup creada en: ${BACKUP_DIR}`);
    }
}

// Generar timestamp para nombre de archivo
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${minute}`;
}

// A) Función para respaldar todas las colecciones
async function respaldarColecciones() {
    console.log('\n🔄 Iniciando respaldo de base de datos...');
    ensureBackupDir();
    
    const timestamp = getTimestamp();
    const resultados = [];
    
    for (const { modelo, nombre } of colecciones) {
        try {
            const datos = await modelo.find({}).lean();
            const filename = `${nombre}_${timestamp}.json`;
            const filepath = path.join(BACKUP_DIR, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(datos, null, 2));
            
            console.log(`✅ ${nombre}: ${datos.length} registros → ${filename}`);
            resultados.push({ coleccion: nombre, registros: datos.length, archivo: filename });
        } catch (error) {
            console.error(`❌ Error respaldando ${nombre}:`, error.message);
            resultados.push({ coleccion: nombre, error: error.message });
        }
    }
    
    console.log(`✅ Respaldo completado a las ${new Date().toLocaleString()}`);
    return resultados;
}

// B) Función para limpiar archivos antiguos (más de 7 días)
function limpiarBackupsAntiguos() {
    console.log('\n🧹 Verificando archivos antiguos para limpieza...');
    
    if (!fs.existsSync(BACKUP_DIR)) {
        console.log('📁 Carpeta backup no existe, omitiendo limpieza.');
        return [];
    }
    
    const ahora = Date.now();
    const sieteDiasEnMs = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos
    const archivos = fs.readdirSync(BACKUP_DIR);
    const eliminados = [];
    
    for (const archivo of archivos) {
        // Solo procesar archivos .json
        if (!archivo.endsWith('.json')) continue;
        
        const filepath = path.join(BACKUP_DIR, archivo);
        const stats = fs.statSync(filepath);
        const antiguedadMs = ahora - stats.mtime.getTime();
        
        if (antiguedadMs > sieteDiasEnMs) {
            fs.unlinkSync(filepath);
            const diasAntiguo = Math.floor(antiguedadMs / (24 * 60 * 60 * 1000));
            console.log(`🗑️ Eliminado: ${archivo} (${diasAntiguo} días de antigüedad)`);
            eliminados.push({ archivo, diasAntiguo });
        }
    }
    
    if (eliminados.length === 0) {
        console.log('✅ No hay archivos antiguos para eliminar.');
    } else {
        console.log(`✅ Limpieza completada: ${eliminados.length} archivos eliminados.`);
    }
    
    return eliminados;
}

// Función principal que combina respaldo y limpieza
async function ejecutarBackupYLimpieza() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('📦 PROCESO DE BACKUP AUTOMÁTICO INICIADO');
        console.log('='.repeat(60));
        
        await respaldarColecciones();
        limpiarBackupsAntiguos();
        
        console.log('='.repeat(60));
        console.log('✅ PROCESO DE BACKUP COMPLETADO EXITOSAMENTE');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('❌ Error en proceso de backup:', error.message);
    }
}

// Función para iniciar el cron job (se ejecuta todos los días a las 3:00 AM)
function iniciarCronJob() {
    console.log('⏰ Cron Job de Backup configurado para ejecutarse diariamente a las 3:00 AM');
    
    // Formato cron: minuto hora * * *
    // 0 3 * * * = todos los días a las 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        console.log('\n⏰ Ejecutando backup programado (3:00 AM)...');
        await ejecutarBackupYLimpieza();
    }, {
        scheduled: true,
        timezone: 'America/Mexico_City' // Ajusta según tu zona horaria
    });
}

// Función para ejecutar backup manual (útil para testing)
async function backupManual() {
    await ejecutarBackupYLimpieza();
}

module.exports = {
    iniciarCronJob,
    backupManual,
    respaldarColecciones,
    limpiarBackupsAntiguos
};
