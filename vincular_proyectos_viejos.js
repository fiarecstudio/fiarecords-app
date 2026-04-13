/**
 * SCRIPT TEMPORAL: Vincular proyectos antiguos a FIA RECORDS
 * 
 * Problema: Proyectos creados antes de la Fase 4 no tienen empresaId
 * Solución: Asignar el ID de la empresa principal (FIA RECORDS) a todos los proyectos
 *           donde empresaId no exista o sea null
 * 
 * EJECUCIÓN: node vincular_proyectos_viejos.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function vincularProyectosViejos() {
    try {
        console.log('🔌 Conectando a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB Atlas\n');

        const db = mongoose.connection.db;
        const proyectosColl = db.collection('proyectos');
        const empresasColl = db.collection('empresas');

        // 1. Buscar la empresa principal (FIA RECORDS o la marcada como default)
        console.log('🔍 Buscando empresa principal (FIA RECORDS)...');
        let empresaPrincipal = await empresasColl.findOne({ isDefault: true });
        
        if (!empresaPrincipal) {
            // Fallback: buscar por nombre que contenga "FIA"
            empresaPrincipal = await empresasColl.findOne({ 
                nombre: { $regex: /FIA/i } 
            });
        }
        
        if (!empresaPrincipal) {
            // Último fallback: la primera empresa creada
            empresaPrincipal = await empresasColl.findOne().sort({ createdAt: 1 });
        }

        if (!empresaPrincipal) {
            console.error('❌ No se encontró ninguna empresa en la base de datos');
            process.exit(1);
        }

        const empresaPrincipalId = empresaPrincipal._id.toString();
        console.log(`✅ Empresa principal encontrada: ${empresaPrincipal.nombre} (ID: ${empresaPrincipalId})\n`);

        // 2. Contar proyectos sin empresaId
        console.log('📊 Analizando proyectos...');
        const proyectosSinEmpresa = await proyectosColl.countDocuments({
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null },
                { empresaId: '' }
            ]
        });

        console.log(`   Proyectos sin empresaId: ${proyectosSinEmpresa}`);

        const proyectosConEmpresa = await proyectosColl.countDocuments({
            empresaId: { $exists: true, $ne: null, $ne: '' }
        });

        console.log(`   Proyectos con empresaId: ${proyectosConEmpresa}`);
        console.log(`   Total proyectos: ${proyectosSinEmpresa + proyectosConEmpresa}\n`);

        if (proyectosSinEmpresa === 0) {
            console.log('✅ No hay proyectos pendientes por vincular. Todo está correcto.');
            process.exit(0);
        }

        // 3. Confirmación (solo en modo interactivo)
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const confirmar = await new Promise((resolve) => {
            rl.question(
                `⚠️  Se van a vincular ${proyectosSinEmpresa} proyectos a "${empresaPrincipal.nombre}".\n` +
                `   ¿Continuar? (escribe "SIVINCULAR" para confirmar): `,
                (answer) => resolve(answer.trim())
            );
        });

        rl.close();

        if (confirmar !== 'SIVINCULAR') {
            console.log('\n❌ Operación cancelada por el usuario.');
            process.exit(0);
        }

        // 4. Actualizar proyectos
        console.log('\n📝 Vinculando proyectos...');
        
        const resultado = await proyectosColl.updateMany(
            {
                $or: [
                    { empresaId: { $exists: false } },
                    { empresaId: null },
                    { empresaId: '' }
                ]
            },
            {
                $set: {
                    empresaId: new mongoose.Types.ObjectId(empresaPrincipalId),
                    _vinculadoEn: new Date(),
                    _vinculadoPor: 'script_vincular_proyectos_viejos'
                }
            }
        );

        console.log('\n✅ VINCULACIÓN COMPLETADA');
        console.log(`   Proyectos modificados: ${resultado.modifiedCount}`);
        console.log(`   Proyectos coincidentes: ${resultado.matchedCount}`);
        
        // 5. Verificación final
        const pendientes = await proyectosColl.countDocuments({
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null },
                { empresaId: '' }
            ]
        });
        
        console.log(`   Proyectos pendientes restantes: ${pendientes}\n`);

        if (pendientes === 0) {
            console.log('🎉 ¡Todos los proyectos ahora están vinculados a una empresa!');
        } else {
            console.log(`⚠️  Quedaron ${pendientes} proyectos sin vincular. Revisa manualmente.`);
        }

        process.exit(0);

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
vincularProyectosViejos();
