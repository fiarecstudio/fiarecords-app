/**
 * SCRIPT DE MIGRACIÓN: Convertir pagos embebidos a colección independiente
 * 
 * Este script migra los pagos que están embebidos en el array 'pagos' del modelo Poliza
 * a una nueva colección independiente 'Pago'.
 * 
 * INSTRUCCIONES:
 * 1. Asegúrate de que el modelo Pago.js ya existe en la carpeta models/
 * 2. Ejecuta este script con: node scripts/migrarPagos.js
 * 3. Verifica los logs para confirmar que la migración fue exitosa
 * 4. Después de verificar, puedes limpiar el array 'pagos' de Poliza manualmente
 * 
 * NOTA: Este script NO elimina el array 'pagos' de Poliza por seguridad.
 * Debes hacerlo manualmente después de verificar que la migración fue exitosa.
 */

const mongoose = require('mongoose');
const Poliza = require('../models/Poliza');
const Pago = require('../models/Pago');

// Configuración de conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fiarecords';

async function migrarPagos() {
    try {
        console.log('==========================================');
        console.log('INICIANDO MIGRACIÓN DE PAGOS');
        console.log('==========================================\n');

        // Conectar a MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB\n');

        // Paso 1: Obtener todas las pólizas que tienen pagos
        console.log('📊 Buscando pólizas con pagos...');
        const polizasConPagos = await Poliza.find({ 
            pagos: { $exists: true, $ne: [], $not: { $size: 0 } } 
        });

        console.log(`📋 Encontradas ${polizasConPagos.length} pólizas con pagos\n`);

        if (polizasConPagos.length === 0) {
            console.log('⚠️  No hay pólizas con pagos para migrar. Saliendo...');
            process.exit(0);
        }

        // Paso 2: Migrar cada pago a la nueva colección
        let totalPagosMigrados = 0;
        let totalPagosFallidos = 0;
        let polizasProcesadas = 0;

        for (const poliza of polizasConPagos) {
            console.log(`\n🔄 Procesando póliza: ${poliza.numeroPoliza} (ID: ${poliza._id})`);
            console.log(`   Empresa ID: ${poliza.empresaId}`);
            console.log(`   Pagos a migrar: ${poliza.pagos.length}`);

            let pagosMigradosEnPoliza = 0;

            for (const pago of poliza.pagos) {
                try {
                    // Crear nuevo documento Pago
                    const nuevoPago = new Pago({
                        empresaId: poliza.empresaId,
                        polizaId: poliza._id,
                        monto: pago.monto,
                        fechaPago: pago.fechaPago || new Date(),
                        metodoPago: pago.metodoPago || 'efectivo',
                        nota: pago.nota || '',
                        estado: pago.estado || 'pagado',
                        reciboUrl: pago.reciboUrl || null
                    });

                    await nuevoPago.save();
                    totalPagosMigrados++;
                    pagosMigradosEnPoliza++;
                    console.log(`   ✅ Pago migrado: $${pago.monto} (${pago.estado})`);
                } catch (error) {
                    totalPagosFallidos++;
                    console.error(`   ❌ Error al migrar pago:`, error.message);
                }
            }

            console.log(`   📊 Resumen póliza: ${pagosMigradosEnPoliza}/${poliza.pagos.length} pagos migrados`);
            polizasProcesadas++;
        }

        // Paso 3: Reporte final
        console.log('\n==========================================');
        console.log('REPORTE FINAL DE MIGRACIÓN');
        console.log('==========================================');
        console.log(`📋 Pólizas procesadas: ${polizasProcesadas}`);
        console.log(`✅ Pagos migrados exitosamente: ${totalPagosMigrados}`);
        console.log(`❌ Pagos fallidos: ${totalPagosFallidos}`);
        console.log('==========================================\n');

        // Paso 4: Verificación opcional
        console.log('🔍 Verificando migración...');
        const totalPagosEnColeccion = await Pago.countDocuments();
        console.log(`📊 Total de pagos en colección Pago: ${totalPagosEnColeccion}`);

        if (totalPagosMigrados === totalPagosEnColeccion) {
            console.log('✅ Verificación exitosa: Todos los pagos migrados están en la colección\n');
        } else {
            console.log('⚠️  Advertencia: El conteo no coincide. Revisa manualmente.\n');
        }

        console.log('==========================================');
        console.log('MIGRACIÓN COMPLETADA');
        console.log('==========================================\n');
        console.log('⚠️  IMPORTANTE: El array "pagos" en Poliza NO fue eliminado por seguridad.');
        console.log('📝 Para limpiar el array "pagos" de Poliza, ejecuta el script de limpieza después de verificar.');
        console.log('📝 Script de limpieza: node scripts/limpiarPagosEmbebidos.js\n');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error fatal durante la migración:', error);
        process.exit(1);
    }
}

// Ejecutar migración
migrarPagos();
