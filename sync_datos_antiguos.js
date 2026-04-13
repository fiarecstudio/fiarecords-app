/**
 * FASE 4: Script de corrección de datos huérfanos
 * Usa colecciones nativas de MongoDB para evadir validación de Mongoose
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    console.log('🔧 SINCRONIZACIÓN DE DATOS ANTIGUOS - FASE 4');
    console.log('==============================================\n');

    // 1. Conectar a MongoDB
    console.log('📡 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');

    try {
        // 2. Buscar empresa principal (FIA RECORDS o la más antigua)
        console.log('🔍 Buscando empresa principal...');
        const db = mongoose.connection.db;
        const empresasColl = db.collection('empresas');
        
        let empresaPrincipal = await empresasColl.findOne({ 
            nombre: { $regex: 'FIA RECORDS', $options: 'i' } 
        }, { sort: { createdAt: 1 } });

        if (!empresaPrincipal) {
            // Si no encuentra por nombre, buscar la más antigua
            empresaPrincipal = await empresasColl.findOne({}, { sort: { createdAt: 1 } });
        }

        if (!empresaPrincipal) {
            console.error('❌ ERROR: No se encontró ninguna empresa en la base de datos');
            process.exit(1);
        }

        // Convertir ID a ObjectId válido
        const empresaId = new mongoose.Types.ObjectId(empresaPrincipal._id.toString());
        console.log(`✅ Empresa principal encontrada:`);
        console.log(`   Nombre: ${empresaPrincipal.nombre}`);
        console.log(`   ID: ${empresaId}\n`);

        // 3. Condición de búsqueda para documentos huérfanos (usando valores crudos)
        const condicionHuerfano = {
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null },
                { empresaId: '' },
                { empresaId: 1 },           // Número entero 1
                { empresaId: '1' },         // String "1"
                { empresaId: 'null' },      // String "null"
                { empresaId: 'undefined' }  // String "undefined"
            ]
        };

        // 4. Procesar cada colección usando colecciones nativas
        const resultados = [];

        // Artistas
        console.log('🎤 Procesando Artistas...');
        const artistasColl = db.collection('artistas');
        const artistasCount = await artistasColl.countDocuments(condicionHuerfano);
        const artistasUpdate = await artistasColl.updateMany(
            condicionHuerfano,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${artistasCount} | Actualizados: ${artistasUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Artistas', encontrados: artistasCount, actualizados: artistasUpdate.modifiedCount });

        // Servicios
        console.log('📦 Procesando Servicios...');
        const serviciosColl = db.collection('servicios');
        const serviciosCount = await serviciosColl.countDocuments(condicionHuerfano);
        const serviciosUpdate = await serviciosColl.updateMany(
            condicionHuerfano,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${serviciosCount} | Actualizados: ${serviciosUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Servicios', encontrados: serviciosCount, actualizados: serviciosUpdate.modifiedCount });

        // Proyectos
        console.log('📁 Procesando Proyectos...');
        const proyectosColl = db.collection('proyectos');
        const proyectosCount = await proyectosColl.countDocuments(condicionHuerfano);
        const proyectosUpdate = await proyectosColl.updateMany(
            condicionHuerfano,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${proyectosCount} | Actualizados: ${proyectosUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Proyectos', encontrados: proyectosCount, actualizados: proyectosUpdate.modifiedCount });

        // Usuarios (excluyendo Super Admin)
        console.log('👤 Procesando Usuarios...');
        const usuariosColl = db.collection('usuarios');
        const condicionHuerfanoUsuarios = {
            $and: [
                { role: { $ne: 'superadmin' } },
                {
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null },
                        { empresaId: '' },
                        { empresaId: 1 },
                        { empresaId: '1' },
                        { empresaId: 'null' },
                        { empresaId: 'undefined' }
                    ]
                }
            ]
        };
        const usuariosCount = await usuariosColl.countDocuments(condicionHuerfanoUsuarios);
        const usuariosUpdate = await usuariosColl.updateMany(
            condicionHuerfanoUsuarios,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${usuariosCount} | Actualizados: ${usuariosUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Usuarios', encontrados: usuariosCount, actualizados: usuariosUpdate.modifiedCount });

        // Deudas
        console.log('💰 Procesando Deudas...');
        const deudasColl = db.collection('deudas');
        const deudasCount = await deudasColl.countDocuments(condicionHuerfano);
        const deudasUpdate = await deudasColl.updateMany(
            condicionHuerfano,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${deudasCount} | Actualizados: ${deudasUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Deudas', encontrados: deudasCount, actualizados: deudasUpdate.modifiedCount });

        // Configuración
        console.log('⚙️  Procesando Configuración...');
        const configColl = db.collection('configuracions');
        const configCount = await configColl.countDocuments(condicionHuerfano);
        const configUpdate = await configColl.updateMany(
            condicionHuerfano,
            { $set: { empresaId: empresaId } }
        );
        console.log(`   Encontrados: ${configCount} | Actualizados: ${configUpdate.modifiedCount}`);
        resultados.push({ coleccion: 'Configuracion', encontrados: configCount, actualizados: configUpdate.modifiedCount });

        // 5. Resumen final
        console.log('\n==============================================');
        console.log('📊 RESUMEN DE CORRECCIÓN');
        console.log('==============================================');
        let totalActualizados = 0;
        resultados.forEach(r => {
            const status = r.actualizados > 0 ? '✅' : '➖';
            console.log(`${status} ${r.coleccion.padEnd(15)} | Encontrados: ${r.encontrados.toString().padStart(3)} | Actualizados: ${r.actualizados.toString().padStart(3)}`);
            totalActualizados += r.actualizados;
        });
        console.log('==============================================');
        console.log(`🎯 TOTAL DE REGISTROS CORREGIDOS: ${totalActualizados}`);
        console.log(`🏢 Empresa asignada: ${empresaPrincipal.nombre} (${empresaId})`);
        console.log('\n✨ Sincronización completada exitosamente');

    } catch (error) {
        console.error('\n❌ ERROR durante la sincronización:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado de MongoDB');
    }
}

// Ejecutar
main();
