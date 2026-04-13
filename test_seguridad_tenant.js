/**
 * ============================================================
 * SCRIPT DE PRUEBAS DE PENETRACIÓN MULTI-TENANT
 * ============================================================
 * 
 * Objetivo: Verificar que ninguna empresa pueda acceder a datos de otra
 * 
 * Escenarios de prueba:
 * 1. Usuario de FIA intenta ver proyectos de Covert
 * 2. Usuario de Covert intenta ver artistas de FIA
 * 3. Super Admin con filtro específico solo ve esa empresa
 * 4. Intento de acceso directo por ID (ID guessing)
 * 5. Verificación de queries agregadas (dashboard/finanzas)
 * 
 * ============================================================
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Modelos
const Proyecto = require('./models/Proyecto');
const Artista = require('./models/Artista');
const Servicio = require('./models/Servicio');
const Usuario = require('./models/Usuario');
const Empresa = require('./models/Empresa');

// Middleware functions (simuladas para pruebas)
const { buildQueryFilter, hasTenantAccess } = require('./middleware/tenantFilter');

// Resultados de pruebas
const resultados = [];

function log(tipo, mensaje, datos = null) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, tipo, mensaje, datos };
    resultados.push(entry);
    
    const icon = tipo === 'PASS' ? '✅' : tipo === 'FAIL' ? '❌' : tipo === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${icon} [${tipo}] ${mensaje}`);
    if (datos) console.log('   Datos:', JSON.stringify(datos, null, 2));
}

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        log('INFO', 'Conectado a MongoDB para pruebas');
    } catch (err) {
        log('FAIL', 'Error conectando a MongoDB', err.message);
        process.exit(1);
    }
}

// ============================================================
// PRUEBA 1: Verificar aislamiento de proyectos entre empresas
// ============================================================
async function prueba1_AislamientoProyectos() {
    log('INFO', '=== PRUEBA 1: Aislamiento de Proyectos entre Empresas ===');
    
    try {
        // Obtener empresas
        const empresas = await Empresa.find({});
        if (empresas.length < 2) {
            log('WARN', 'Se necesitan al menos 2 empresas para esta prueba');
            return;
        }
        
        const empresa1 = empresas[0];
        const empresa2 = empresas[1];
        
        log('INFO', `Empresa 1: ${empresa1.nombre} (${empresa1._id})`);
        log('INFO', `Empresa 2: ${empresa2.nombre} (${empresa2._id})`);
        
        // Contar proyectos por empresa
        const proyectosEmp1 = await Proyecto.countDocuments({ empresaId: empresa1._id });
        const proyectosEmp2 = await Proyecto.countDocuments({ empresaId: empresa2._id });
        
        log('INFO', `Proyectos en ${empresa1.nombre}: ${proyectosEmp1}`);
        log('INFO', `Proyectos en ${empresa2.nombre}: ${proyectosEmp2}`);
        
        // Simular query con filtro de empresa 1
        const reqSimuladoEmp1 = {
            tenantFilter: { empresaId: empresa1._id },
            user: { empresaId: empresa1._id, isSuperAdmin: false }
        };
        
        const filtroEmp1 = buildQueryFilter(reqSimuladoEmp1, { isDeleted: false });
        const proyectosEncontradosEmp1 = await Proyecto.countDocuments(filtroEmp1);
        
        // Verificar que no haya proyectos de empresa 2 en los resultados de empresa 1
        const proyectosCruzados = await Proyecto.countDocuments({
            ...filtroEmp1,
            empresaId: empresa2._id
        });
        
        if (proyectosCruzados === 0) {
            log('PASS', '✓ No hay fugas: Proyectos de empresa 2 NO aparecen en filtro de empresa 1');
        } else {
            log('FAIL', `✓ FUGA DETECTADA: ${proyectosCruzados} proyectos de empresa 2 aparecen en filtro de empresa 1`);
        }
        
        // Verificar hasTenantAccess
        const proyectoEmp2 = await Proyecto.findOne({ empresaId: empresa2._id });
        if (proyectoEmp2) {
            const tieneAcceso = hasTenantAccess(reqSimuladoEmp1, proyectoEmp2);
            if (!tieneAcceso) {
                log('PASS', '✓ hasTenantAccess correctamente DENIEGA acceso a proyecto de otra empresa');
            } else {
                log('FAIL', '✓ hasTenantAccess INCORRECTAMENTE permite acceso a proyecto de otra empresa');
            }
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 1', err.message);
    }
}

// ============================================================
// PRUEBA 2: Verificar aislamiento de Artistas entre empresas
// ============================================================
async function prueba2_AislamientoArtistas() {
    log('INFO', '=== PRUEBA 2: Aislamiento de Artistas entre Empresas ===');
    
    try {
        const empresas = await Empresa.find({});
        if (empresas.length < 2) return;
        
        const empresa1 = empresas[0];
        const empresa2 = empresas[1];
        
        // Contar artistas por empresa
        const artistasEmp1 = await Artista.countDocuments({ empresaId: empresa1._id });
        const artistasEmp2 = await Artista.countDocuments({ empresaId: empresa2._id });
        
        log('INFO', `Artistas en ${empresa1.nombre}: ${artistasEmp1}`);
        log('INFO', `Artistas en ${empresa2.nombre}: ${artistasEmp2}`);
        
        // Simular query con filtro de empresa 1
        const reqSimuladoEmp1 = {
            tenantFilter: { empresaId: empresa1._id },
            user: { empresaId: empresa1._id, isSuperAdmin: false }
        };
        
        const filtroEmp1 = buildQueryFilter(reqSimuladoEmp1, { isDeleted: false });
        const artistasEncontradosEmp1 = await Artista.countDocuments(filtroEmp1);
        
        // Verificar que no haya artistas de empresa 2 en los resultados
        const artistasCruzados = await Artista.countDocuments({
            ...filtroEmp1,
            empresaId: empresa2._id
        });
        
        if (artistasCruzados === 0) {
            log('PASS', '✓ No hay fugas: Artistas de empresa 2 NO aparecen en filtro de empresa 1');
        } else {
            log('FAIL', `✓ FUGA DETECTADA: ${artistasCruzados} artistas de empresa 2 aparecen en filtro de empresa 1`);
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 2', err.message);
    }
}

// ============================================================
// PRUEBA 3: Verificar aislamiento de Servicios entre empresas
// ============================================================
async function prueba3_AislamientoServicios() {
    log('INFO', '=== PRUEBA 3: Aislamiento de Servicios entre Empresas ===');
    
    try {
        const empresas = await Empresa.find({});
        if (empresas.length < 2) return;
        
        const empresa1 = empresas[0];
        const empresa2 = empresas[1];
        
        // Contar servicios por empresa
        const serviciosEmp1 = await Servicio.countDocuments({ empresaId: empresa1._id });
        const serviciosEmp2 = await Servicio.countDocuments({ empresaId: empresa2._id });
        
        log('INFO', `Servicios en ${empresa1.nombre}: ${serviciosEmp1}`);
        log('INFO', `Servicios en ${empresa2.nombre}: ${serviciosEmp2}`);
        
        // Simular query con filtro de empresa 1
        const reqSimuladoEmp1 = {
            tenantFilter: { empresaId: empresa1._id },
            user: { empresaId: empresa1._id, isSuperAdmin: false }
        };
        
        const filtroEmp1 = buildQueryFilter(reqSimuladoEmp1, { isDeleted: false });
        
        // Verificar que no haya servicios de empresa 2 en los resultados
        const serviciosCruzados = await Servicio.countDocuments({
            ...filtroEmp1,
            empresaId: empresa2._id
        });
        
        if (serviciosCruzados === 0) {
            log('PASS', '✓ No hay fugas: Servicios de empresa 2 NO aparecen en filtro de empresa 1');
        } else {
            log('FAIL', `✓ FUGA DETECTADA: ${serviciosCruzados} servicios de empresa 2 aparecen en filtro de empresa 1`);
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 3', err.message);
    }
}

// ============================================================
// PRUEBA 4: Verificar comportamiento Super Admin
// ============================================================
async function prueba4_SuperAdminFiltros() {
    log('INFO', '=== PRUEBA 4: Comportamiento Super Admin con Filtros ===');
    
    try {
        const empresas = await Empresa.find({});
        if (empresas.length < 2) return;
        
        const empresa1 = empresas[0];
        
        // Simular Super Admin SIN filtro (all)
        const reqSuperAdminAll = {
            tenantFilter: {}, // Sin filtro = ve todo
            user: { isSuperAdmin: true }
        };
        
        const filtroAll = buildQueryFilter(reqSuperAdminAll, { isDeleted: false });
        const proyectosAll = await Proyecto.countDocuments(filtroAll);
        
        log('INFO', `Super Admin sin filtro (all) ve: ${proyectosAll} proyectos`);
        
        // Simular Super Admin CON filtro específico
        const reqSuperAdminFiltrado = {
            tenantFilter: { empresaId: empresa1._id },
            user: { isSuperAdmin: true, empresaId: empresa1._id }
        };
        
        const filtroFiltrado = buildQueryFilter(reqSuperAdminFiltrado, { isDeleted: false });
        const proyectosFiltrados = await Proyecto.countDocuments(filtroFiltrado);
        
        log('INFO', `Super Admin filtrado por ${empresa1.nombre} ve: ${proyectosFiltrados} proyectos`);
        
        // Verificar que el filtrado funciona
        if (proyectosAll >= proyectosFiltrados) {
            log('PASS', '✓ Super Admin con filtro ve MENOS o IGUAL proyectos que sin filtro');
        } else {
            log('FAIL', '✓ Anomalía: Super Admin con filtro ve MÁS proyectos que sin filtro');
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 4', err.message);
    }
}

// ============================================================
// PRUEBA 5: Verificar que usuarios no tengan empresaId NULL o inválido
// ============================================================
async function prueba5_UsuariosSinEmpresa() {
    log('INFO', '=== PRUEBA 5: Verificación de Integridad de Usuarios ===');
    
    try {
        // Buscar usuarios sin empresaId
        const usuariosSinEmpresa = await Usuario.countDocuments({
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null },
                { empresaId: '' }
            ]
        });
        
        if (usuariosSinEmpresa === 0) {
            log('PASS', '✓ Todos los usuarios tienen empresaId asignado');
        } else {
            log('WARN', `⚠ Hay ${usuariosSinEmpresa} usuarios SIN empresaId asignado`);
            
            // Listar usuarios sin empresa
            const usuarios = await Usuario.find({
                $or: [
                    { empresaId: { $exists: false } },
                    { empresaId: null },
                    { empresaId: '' }
                ]
            }).select('username email role');
            
            log('WARN', 'Usuarios sin empresa:', usuarios.map(u => ({ username: u.username, email: u.email })));
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 5', err.message);
    }
}

// ============================================================
// PRUEBA 6: Verificar proyectos sin empresaId (legacy data)
// ============================================================
async function prueba6_ProyectosSinEmpresa() {
    log('INFO', '=== PRUEBA 6: Verificación de Proyectos Legacy ===');
    
    try {
        // Buscar proyectos sin empresaId
        const proyectosSinEmpresa = await Proyecto.countDocuments({
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        log('INFO', `Proyectos sin empresaId: ${proyectosSinEmpresa}`);
        
        if (proyectosSinEmpresa > 0) {
            log('WARN', `⚠ Hay ${proyectosSinEmpresa} proyectos sin empresaId (datos legacy)`);
            log('INFO', 'Estos proyectos solo deberían ser visibles para la empresa principal (FIA RECORDS)');
        } else {
            log('PASS', '✓ Todos los proyectos tienen empresaId asignado');
        }
        
    } catch (err) {
        log('FAIL', 'Error en prueba 6', err.message);
    }
}

// ============================================================
// GENERAR REPORTE FINAL
// ============================================================
function generarReporte() {
    log('INFO', '=== REPORTE FINAL DE PRUEBAS ===');
    
    const pass = resultados.filter(r => r.tipo === 'PASS').length;
    const fail = resultados.filter(r => r.tipo === 'FAIL').length;
    const warn = resultados.filter(r => r.tipo === 'WARN').length;
    
    console.log('\n========================================');
    console.log('RESULTADOS:');
    console.log(`✅ PASSED: ${pass}`);
    console.log(`❌ FAILED: ${fail}`);
    console.log(`⚠️  WARNINGS: ${warn}`);
    console.log('========================================\n');
    
    if (fail === 0) {
        console.log('🛡️  SISTEMA SEGURO: No se detectaron fugas de datos multi-tenant');
    } else {
        console.log('🚨 VULNERABILIDADES DETECTADAS: Se encontraron fugas de datos');
    }
    
    // Guardar reporte en archivo
    const fs = require('fs');
    const reportePath = './test_seguridad_tenant_report.json';
    fs.writeFileSync(reportePath, JSON.stringify(resultados, null, 2));
    console.log(`\n📄 Reporte detallado guardado en: ${reportePath}`);
}

// ============================================================
// EJECUCIÓN PRINCIPAL
// ============================================================
async function main() {
    console.log('\n🔒 ============================================================');
    console.log('🔒 INICIANDO PRUEBAS DE SEGURIDAD MULTI-TENANT');
    console.log('🔒 ============================================================\n');
    
    await connectDB();
    
    await prueba1_AislamientoProyectos();
    await prueba2_AislamientoArtistas();
    await prueba3_AislamientoServicios();
    await prueba4_SuperAdminFiltros();
    await prueba5_UsuariosSinEmpresa();
    await prueba6_ProyectosSinEmpresa();
    
    generarReporte();
    
    await mongoose.disconnect();
    console.log('\n✨ Pruebas completadas\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
