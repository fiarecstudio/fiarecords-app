/**
 * Script para limpiar índices antiguos y recrear índices compuestos multi-tenant
 * Ejecutar: node limpiar_indices.js
 */

const mongoose = require('mongoose');
const Usuario = require('./models/Usuario');

async function limpiarIndices() {
    try {
        // Conectar a MongoDB (usar la misma URI del proyecto)
        const MONGO_URI = process.env.MONGO_URI;
        if (!MONGO_URI) {
            console.error('❌ Error: La variable de entorno MONGO_URI no está definida');
            console.log('💡 Asegúrate de tener un archivo .env con MONGO_URI=mongodb+srv://...');
            process.exit(1);
        }
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado a MongoDB');

        // Paso 1: Eliminar todos los índices antiguos
        console.log('\n🗑️  Eliminando índices antiguos...');
        await Usuario.collection.dropIndexes();
        console.log('✅ Índices antiguos eliminados');

        // Paso 2: Sincronizar índices nuevos del esquema
        console.log('\n📋 Sincronizando índices nuevos...');
        await Usuario.syncIndexes({ background: false });
        console.log('✅ Índices nuevos creados');
        console.log('\n📝 Nota: El índice de email ya no es único a nivel de BD.');
        console.log('   La unicidad se valida en el controlador por empresa.');

        // Verificar índices actuales
        console.log('\n📊 Índices actuales en la colección:');
        const indexes = await Usuario.collection.getIndexes();
        console.log(indexes);

        console.log('\n✅ Limpieza completada exitosamente');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

limpiarIndices();
