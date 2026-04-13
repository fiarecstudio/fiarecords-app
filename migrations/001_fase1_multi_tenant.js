/**
 * FASE 1: MIGRACIÓN MULTI-TENANT
 * 
 * Este script realiza:
 * 1. Crea la empresa principal (default)
 * 2. Añade la columna empresaId a todos los modelos existentes
 * 3. Asigna la empresa principal a todos los registros existentes
 * 4. Marca el primer admin como Super Admin
 * 
 * EJECUCIÓN: node migrations/001_fase1_multi_tenant.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Importar todos los modelos
const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const Artista = require('../models/Artista');
const Proyecto = require('../models/Proyecto');
const Servicio = require('../models/Servicio');
const Deuda = require('../models/Deuda');
const Configuracion = require('../models/Configuracion');

async function runMigration() {
    try {
        console.log('🔌 Conectando a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conectado a MongoDB Atlas\n');

        // ============================================================
        // PASO 1: Verificar/Crear Empresa Principal
        // ============================================================
        console.log('🏢 PASO 1: Verificando empresa principal...');
        
        let empresaPrincipal = await Empresa.findOne({ isDefault: true });
        
        if (!empresaPrincipal) {
            console.log('   → Creando empresa principal...');
            empresaPrincipal = new Empresa({
                nombre: 'FiaRecords Principal',
                rfc: '',
                direccion: '',
                telefono: '',
                email: '',
                isActive: true,
                isDefault: true
            });
            await empresaPrincipal.save();
            console.log(`   ✅ Empresa principal creada con ID: ${empresaPrincipal._id}`);
        } else {
            console.log(`   ✅ Empresa principal ya existe con ID: ${empresaPrincipal._id}`);
        }

        const empresaIdPrincipal = empresaPrincipal._id;

        // ============================================================
        // PASO 2: Actualizar Usuarios
        // ============================================================
        console.log('\n👤 PASO 2: Actualizando usuarios...');
        
        // Añadir empresaId a usuarios que no lo tienen
        const usuariosSinEmpresa = await Usuario.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (usuariosSinEmpresa > 0) {
            const resultadoUsuarios = await Usuario.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoUsuarios.modifiedCount} usuarios actualizados con empresaId`);
        } else {
            console.log('   ℹ️ Todos los usuarios ya tienen empresaId asignado');
        }

        // Marcar el primer admin como Super Admin (solo si ninguno lo es)
        const superAdminExistente = await Usuario.findOne({ isSuperAdmin: true });
        if (!superAdminExistente) {
            const primerAdmin = await Usuario.findOne({ role: 'admin' }).sort({ createdAt: 1 });
            if (primerAdmin) {
                primerAdmin.isSuperAdmin = true;
                await primerAdmin.save();
                console.log(`   ✅ Usuario '${primerAdmin.username}' marcado como Super Admin`);
            } else {
                console.log('   ⚠️ No se encontró ningún usuario con rol admin para marcar como Super Admin');
            }
        } else {
            console.log(`   ℹ️ Ya existe un Super Admin: ${superAdminExistente.username}`);
        }

        // ============================================================
        // PASO 3: Actualizar Artistas
        // ============================================================
        console.log('\n🎤 PASO 3: Actualizando artistas...');
        
        const artistasSinEmpresa = await Artista.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (artistasSinEmpresa > 0) {
            const resultadoArtistas = await Artista.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoArtistas.modifiedCount} artistas actualizados con empresaId`);
        } else {
            console.log('   ℹ️ Todos los artistas ya tienen empresaId asignado');
        }

        // ============================================================
        // PASO 4: Actualizar Proyectos
        // ============================================================
        console.log('\n📁 PASO 4: Actualizando proyectos...');
        
        const proyectosSinEmpresa = await Proyecto.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (proyectosSinEmpresa > 0) {
            const resultadoProyectos = await Proyecto.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoProyectos.modifiedCount} proyectos actualizados con empresaId`);
        } else {
            console.log('   ℹ️ Todos los proyectos ya tienen empresaId asignado');
        }

        // ============================================================
        // PASO 5: Actualizar Servicios
        // ============================================================
        console.log('\n🔧 PASO 5: Actualizando servicios...');
        
        const serviciosSinEmpresa = await Servicio.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (serviciosSinEmpresa > 0) {
            const resultadoServicios = await Servicio.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoServicios.modifiedCount} servicios actualizados con empresaId`);
        } else {
            console.log('   ℹ️ Todos los servicios ya tienen empresaId asignado');
        }

        // ============================================================
        // PASO 6: Actualizar Deudas
        // ============================================================
        console.log('\n💰 PASO 6: Actualizando deudas...');
        
        const deudasSinEmpresa = await Deuda.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (deudasSinEmpresa > 0) {
            const resultadoDeudas = await Deuda.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoDeudas.modifiedCount} deudas actualizadas con empresaId`);
        } else {
            console.log('   ℹ️ Todas las deudas ya tienen empresaId asignado');
        }

        // ============================================================
        // PASO 7: Actualizar Configuraciones
        // ============================================================
        console.log('\n⚙️ PASO 7: Actualizando configuraciones...');
        
        const configsSinEmpresa = await Configuracion.countDocuments({ 
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        if (configsSinEmpresa > 0) {
            const resultadoConfigs = await Configuracion.updateMany(
                { 
                    $or: [
                        { empresaId: { $exists: false } },
                        { empresaId: null }
                    ]
                },
                { $set: { empresaId: empresaIdPrincipal } }
            );
            console.log(`   ✅ ${resultadoConfigs.modifiedCount} configuraciones actualizadas con empresaId`);
        } else {
            console.log('   ℹ️ Todas las configuraciones ya tienen empresaId asignado');
        }

        // ============================================================
        // RESUMEN FINAL
        // ============================================================
        console.log('\n' + '='.repeat(60));
        console.log('✅ MIGRACIÓN FASE 1 COMPLETADA EXITOSAMENTE');
        console.log('='.repeat(60));
        console.log(`Empresa Principal ID: ${empresaIdPrincipal}`);
        console.log('\nTodos los registros existentes han sido asignados a la empresa principal.');
        console.log('La aplicación puede continuar funcionando normalmente.');
        console.log('\nPróximo paso: FASE 2 - Control de Accesos y Contexto de Sesión');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ ERROR EN LA MIGRACIÓN:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    runMigration();
}

module.exports = { runMigration };
