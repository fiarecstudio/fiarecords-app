/**
 * Script para probar el backup manualmente
 * Ejecutar: node test-backup.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { backupManual } = require('./utils/backupDatabase');

async function testBackup() {
    try {
        console.log('🔌 Conectando a MongoDB...\n');
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB Atlas\n');
        
        console.log('🧪 Iniciando prueba de backup...\n');
        await backupManual();
        
        console.log('\n✅ Prueba completada. Revisa la carpeta /backup/');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión cerrada.');
        process.exit(0);
    }
}

testBackup();
