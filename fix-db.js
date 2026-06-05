#!/usr/bin/env node
/**
 * fix-db.js
 * 
 * Script rápido para actualizar tipoDashboard y moduloSeguros de una empresa específica
 * 
 * USO:
 *   node fix-db.js
 * 
 * CONEXIÓN: Lee la variable de entorno MONGO_URI del archivo .env
 *           (La misma que usa server.js para conectarse a MongoDB)
 */

// CARGAR VARIABLES DE ENTORNO PRIMERO
require('dotenv').config();

const mongoose = require('mongoose');
const path = require('path');

// Importar el modelo Empresa
const Empresa = require('./models/Empresa');

// Configuración de MongoDB - USA LA MISMA URI QUE server.js
const MONGO_URI = process.env.MONGO_URI;
const EMPRESA_ID = '6a1887223134989151dd2974'; // ID de la empresa de seguros

async function fixDatabase() {
    try {
        console.log('🔧 INICIANDO SCRIPT DE REPARACIÓN DE BASE DE DATOS');
        console.log('═════════════════════════════════════════════════════════');
        console.log('');
        
        // VERIFICAR QUE MONGO_URI ESTÁ DEFINIDO
        if (!MONGO_URI) {
            throw new Error(
                '❌ Variable de entorno MONGO_URI no está definida.\n' +
                '   Por favor, asegúrate de que tu archivo .env contiene:\n' +
                '   MONGO_URI=mongodb+srv://... o MONGO_URI=mongodb://...\n' +
                '   Luego ejecuta de nuevo: node fix-db.js'
            );
        }
        
        console.log(`📍 Conectando a MongoDB usando MONGO_URI del .env`);
        console.log(`📍 Empresa ID: ${EMPRESA_ID}`);
        console.log('');
        
        // Conectar a MongoDB
        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Conexión exitosa a MongoDB');
        console.log('');
        
        // Verificar que el ID es válido
        if (!mongoose.Types.ObjectId.isValid(EMPRESA_ID)) {
            throw new Error(`❌ ID de empresa inválido: ${EMPRESA_ID}`);
        }
        
        // Buscar la empresa ANTES de actualizar
        console.log('🔍 Buscando empresa en la base de datos...');
        const empresaAntes = await Empresa.findById(EMPRESA_ID);
        
        if (!empresaAntes) {
            throw new Error(`❌ Empresa no encontrada con ID: ${EMPRESA_ID}`);
        }
        
        console.log('✅ Empresa encontrada');
        console.log('');
        console.log('📋 ESTADO ANTES DE LA ACTUALIZACIÓN:');
        console.log('─────────────────────────────────────');
        console.log(`   Nombre: ${empresaAntes.nombre}`);
        console.log(`   tipoDashboard: ${empresaAntes.tipoDashboard || 'undefined'}`);
        console.log(`   moduloSeguros: ${empresaAntes.moduloSeguros}`);
        console.log('');
        
        // Actualizar la empresa
        console.log('🔄 Actualizando empresa...');
        const empresaActualizada = await Empresa.findByIdAndUpdate(
            EMPRESA_ID,
            {
                tipoDashboard: 'seguros',
                moduloSeguros: true
            },
            { 
                new: true, // Devolver el documento actualizado
                runValidators: true // Ejecutar validaciones del schema
            }
        );
        
        console.log('✅ Empresa actualizada exitosamente');
        console.log('');
        console.log('📋 ESTADO DESPUÉS DE LA ACTUALIZACIÓN:');
        console.log('─────────────────────────────────────');
        console.log(`   Nombre: ${empresaActualizada.nombre}`);
        console.log(`   tipoDashboard: ${empresaActualizada.tipoDashboard}`);
        console.log(`   moduloSeguros: ${empresaActualizada.moduloSeguros}`);
        console.log('');
        
        // Verificación: Leer de nuevo para confirmar
        console.log('✅ VERIFICACIÓN: Leyendo desde la base de datos...');
        const empresaVerificacion = await Empresa.findById(EMPRESA_ID);
        
        if (empresaVerificacion.tipoDashboard === 'seguros' && empresaVerificacion.moduloSeguros === true) {
            console.log('✅ ¡ÉXITO! Los datos están correctamente actualizados en la BD');
            console.log('');
            console.log('📊 RESULTADO FINAL:');
            console.log('─────────────────────────────────────');
            console.log(`   ✅ tipoDashboard: "${empresaVerificacion.tipoDashboard}"`);
            console.log(`   ✅ moduloSeguros: ${empresaVerificacion.moduloSeguros}`);
            console.log('');
            console.log('🚀 PRÓXIMOS PASOS:');
            console.log('─────────────────────────────────────');
            console.log('   1. Reinicia el servidor Node.js: npm start');
            console.log('   2. Recarga el navegador: Ctrl+Shift+R');
            console.log('   3. Abre DevTools (F12) y revisa la Console');
            console.log('   4. Busca logs [Config] para ver que tipoDashboard: "seguros" está siendo enviado');
            console.log('');
        } else {
            throw new Error('❌ FALLO EN VERIFICACIÓN: Los datos no fueron actualizados correctamente');
        }
        
    } catch (err) {
        console.error('❌ ERROR:', err.message);
        console.error('');
        console.error('🔍 DETALLES DEL ERROR:');
        console.error(err);
        process.exit(1);
    } finally {
        // Desconectar de MongoDB
        console.log('🔌 Desconectando de MongoDB...');
        await mongoose.disconnect();
        console.log('✅ Desconexión completada');
        console.log('');
        console.log('═════════════════════════════════════════════════════════');
        console.log('');
        process.exit(0);
    }
}

// Ejecutar el script
if (require.main === module) {
    fixDatabase();
}

module.exports = { fixDatabase };
