/**
 * ================================================================
 * SCRIPT DE MIGRACIÓN: Actualizar Permisos de Google Drive
 * ================================================================
 * 
 * Propósito:
 * Actualiza TODOS los proyectos existentes en MongoDB para que sus
 * enlaces de Google Drive tengan permisos de "Cualquier persona con
 * el enlace puede ver" (type: 'anyone', role: 'reader').
 * 
 * Seguridad:
 * - Manejo de errores con try/catch: si un enlace falla, el script
 *   continúa sin detenerse
 * - Contador de progreso en tiempo real
 * - Reporte final de éxitos y fallos
 * - Idempotente: puede ejecutarse múltiples veces sin problemas
 * 
 * Ejecución:
 * node migrations/002_actualizar_permisos_drive_antiguos.js
 * 
 * ================================================================
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Proyecto = require('../models/Proyecto');
const { extraerDriveId, cambiarPermisoPublico } = require('../utils/googleDrive');

// ================================================================
// CONFIGURACIÓN
// ================================================================

// Colores para console output
const COLORES = {
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    ROJO: '\x1b[31m',
    VERDE: '\x1b[32m',
    AMARILLO: '\x1b[33m',
    AZUL: '\x1b[34m',
    CYAN: '\x1b[36m'
};

const log = {
    info: (msg) => console.log(`${COLORES.AZUL}ℹ️  ${msg}${COLORES.RESET}`),
    success: (msg) => console.log(`${COLORES.VERDE}✅ ${msg}${COLORES.RESET}`),
    warning: (msg) => console.log(`${COLORES.AMARILLO}⚠️  ${msg}${COLORES.RESET}`),
    error: (msg) => console.log(`${COLORES.ROJO}❌ ${msg}${COLORES.RESET}`),
    progress: (current, total, msg = '') => {
        const porcentaje = ((current / total) * 100).toFixed(1);
        console.log(`${COLORES.CYAN}📊 Progreso: ${current}/${total} (${porcentaje}%)${msg ? ' - ' + msg : ''}${COLORES.RESET}`);
    }
};

// ================================================================
// FUNCIÓN PRINCIPAL DE MIGRACIÓN
// ================================================================

async function migrarPermisosProyectosAntiguos() {
    let conexionActiva = false;
    
    try {
        log.info('='.repeat(70));
        log.info('INICIANDO MIGRACIÓN: Actualizar Permisos de Google Drive');
        log.info('='.repeat(70));
        
        // --- PASO 1: Conectar a MongoDB ---
        log.info('Conectando a MongoDB...');
        
        const mongooseOptions = {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10
        };
        
        await mongoose.connect(process.env.MONGO_URI, mongooseOptions);
        conexionActiva = true;
        log.success('Conectado a MongoDB Atlas');
        
        // --- PASO 2: Obtener todos los proyectos con enlaceEntrega ---
        log.info('Consultando proyectos con enlace de Google Drive...');
        
        const proyectos = await Proyecto.find({
            enlaceEntrega: { $exists: true, $ne: '' }, // Solo con enlace no vacío
            isDeleted: { $ne: true }                     // Excluir eliminados
        }).select('_id nombreProyecto enlaceEntrega');
        
        log.success(`Encontrados ${proyectos.length} proyectos con enlace de Drive`);
        
        if (proyectos.length === 0) {
            log.warning('No hay proyectos para actualizar');
            return { exitosos: 0, fallidos: 0, sinId: 0 };
        }
        
        // --- PASO 3: Procesar cada proyecto ---
        log.info('='.repeat(70));
        log.info(`Iniciando proceso de actualización de permisos...`);
        log.info('='.repeat(70));
        
        const estadisticas = {
            exitosos: 0,
            fallidos: 0,
            sinId: 0,
            detalles: []
        };
        
        // Usar for...of para control explícito del flujo
        for (let i = 0; i < proyectos.length; i++) {
            const proyecto = proyectos[i];
            const numeroProgreso = i + 1;
            
            try {
                // Extraer ID de Drive de la URL
                const driveId = extraerDriveId(proyecto.enlaceEntrega);
                
                if (!driveId) {
                    log.warning(`Proyecto "${proyecto.nombreProyecto}" (${proyecto._id}): No se pudo extraer ID de Drive`);
                    estadisticas.sinId++;
                    estadisticas.detalles.push({
                        id: proyecto._id,
                        nombre: proyecto.nombreProyecto,
                        estado: 'SIN_ID',
                        razon: 'No se pudo extraer ID de la URL'
                    });
                    log.progress(numeroProgreso, proyectos.length);
                    continue;
                }
                
                // Cambiar permisos
                const resultado = await cambiarPermisoPublico(driveId);
                
                if (resultado) {
                    estadisticas.exitosos++;
                    estadisticas.detalles.push({
                        id: proyecto._id,
                        nombre: proyecto.nombreProyecto,
                        estado: 'EXITOSO',
                        driveId: driveId
                    });
                    log.progress(numeroProgreso, proyectos.length, `✅ "${proyecto.nombreProyecto}"`);
                } else {
                    estadisticas.fallidos++;
                    estadisticas.detalles.push({
                        id: proyecto._id,
                        nombre: proyecto.nombreProyecto,
                        estado: 'FALLO',
                        driveId: driveId,
                        razon: 'cambiarPermisoPublico devolvió false'
                    });
                    log.progress(numeroProgreso, proyectos.length, `❌ "${proyecto.nombreProyecto}"`);
                }
                
            } catch (error) {
                // Capturar errores de cada proyecto individual
                estadisticas.fallidos++;
                estadisticas.detalles.push({
                    id: proyecto._id,
                    nombre: proyecto.nombreProyecto,
                    estado: 'ERROR',
                    razon: error.message
                });
                log.error(`Proyecto "${proyecto.nombreProyecto}" (${proyecto._id}): ${error.message}`);
                log.progress(numeroProgreso, proyectos.length, `❌ "${proyecto.nombreProyecto}" - Error`);
                
                // Continuar al siguiente proyecto sin detener el proceso
                continue;
            }
        }
        
        // --- PASO 4: Mostrar resumen final ---
        log.info('='.repeat(70));
        log.info('RESUMEN DE MIGRACIÓN');
        log.info('='.repeat(70));
        log.success(`✅ Exitosos: ${estadisticas.exitosos}/${proyectos.length}`);
        if (estadisticas.fallidos > 0) {
            log.error(`❌ Fallidos: ${estadisticas.fallidos}/${proyectos.length}`);
        }
        if (estadisticas.sinId > 0) {
            log.warning(`⚠️  Sin ID de Drive extraíble: ${estadisticas.sinId}/${proyectos.length}`);
        }
        log.info('='.repeat(70));
        
        // --- PASO 5: Mostrar detalles de fallos si los hay ---
        if (estadisticas.fallidos > 0 || estadisticas.sinId > 0) {
            log.info('Detalles de fallos:');
            estadisticas.detalles
                .filter(d => d.estado !== 'EXITOSO')
                .forEach((detalle, idx) => {
                    console.log(`  ${idx + 1}. ${detalle.nombre} (${detalle.id})`);
                    console.log(`     Estado: ${detalle.estado}`);
                    if (detalle.razon) console.log(`     Razón: ${detalle.razon}`);
                });
        }
        
        return estadisticas;
        
    } catch (error) {
        log.error('='.repeat(70));
        log.error('ERROR FATAL EN LA MIGRACIÓN');
        log.error('='.repeat(70));
        log.error(error.message);
        log.error(error.stack);
        throw error;
        
    } finally {
        // --- LIMPIEZA: Desconectar de MongoDB ---
        if (conexionActiva) {
            try {
                await mongoose.connection.close(false);
                log.success('Desconectado de MongoDB');
            } catch (error) {
                log.error('Error al desconectar de MongoDB: ' + error.message);
            }
        }
    }
}

// ================================================================
// EJECUCIÓN
// ================================================================

// Validar que tenemos variables de entorno necesarias
if (!process.env.MONGO_URI) {
    console.error('❌ ERROR: Variable de entorno MONGO_URI no definida en .env');
    process.exit(1);
}

if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    console.error('❌ ERROR: Variables de autenticación de Google no definidas en .env');
    process.exit(1);
}

// Ejecutar la migración
migrarPermisosProyectosAntiguos()
    .then((estadisticas) => {
        log.info('✅ Migración completada exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        log.error('❌ Migración falló');
        process.exit(1);
    });
