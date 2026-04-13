/**
 * FASE 3: MULTI-TENANT - MIDDLEWARE DE FILTRO POR EMPRESA
 * 
 * Este middleware proporciona funciones para aislar datos por empresa.
 * Los Super Admin ven todos los datos, los usuarios estándar solo ven su empresa.
 */

const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');

/**
 * Función de utilidad para limpiar y normalizar el empresaId
 * - Si es "all", "undefined", "null", vacío o null → devuelve null (para fallback)
 * - Si es un ObjectId válido → lo devuelve como string
 * - En caso de error, devuelve null para que el fallback tome control
 * 
 * @param {string|null|undefined} empresaId - El ID a limpiar
 * @returns {string|null} - ID limpio o null si necesita fallback
 */
function limpiarEmpresaId(empresaId) {
    // Valores que indican "sin empresa específica"
    const valoresInvalidos = ['all', 'undefined', 'null', '', null, undefined];
    
    if (!empresaId || valoresInvalidos.includes(empresaId)) {
        return null;
    }
    
    // Validar que sea un ObjectId válido de MongoDB
    if (!mongoose.Types.ObjectId.isValid(empresaId)) {
        console.warn(`[limpiarEmpresaId] ID inválido recibido: ${empresaId}`);
        return null;
    }
    
    return empresaId;
}

/**
 * Obtiene el ID de la empresa principal (FIA RECORDS) para usar como fallback
 * @returns {Promise<string|null>} - ID de la empresa principal o null si no existe
 */
async function getEmpresaPrincipalId() {
    try {
        const empresaPrincipal = await Empresa.findOne({ isDefault: true });
        if (empresaPrincipal) {
            return empresaPrincipal._id.toString();
        }
        // Fallback: buscar la primera empresa como último recurso
        const primeraEmpresa = await Empresa.findOne().sort({ createdAt: 1 });
        return primeraEmpresa ? primeraEmpresa._id.toString() : null;
    } catch (err) {
        console.error('[getEmpresaPrincipalId] Error al obtener empresa principal:', err);
        return null;
    }
}

/**
 * Middleware para aplicar filtro de empresa automáticamente
 * Uso: router.use(applyTenantFilter) antes de las rutas GET
 * FASE 5: Ahora es async para soportar filtrado inteligente de empresa principal
 */
const applyTenantFilter = async (req, res, next) => {
    // FASE 5: Si el usuario es Super Admin y envía X-Empresa-Id, filtrar por esa empresa
    if (req.user && req.user.isSuperAdmin) {
        const selectedEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
        
        // REGLA DE ORO: Si es "all", "undefined", vacío o null, no filtramos por empresaId (Super Admin ve todo)
        if (selectedEmpresaId && 
            selectedEmpresaId !== 'all' && 
            selectedEmpresaId !== 'undefined' && 
            selectedEmpresaId !== 'null' &&
            selectedEmpresaId !== '') {
            try {
                // Validar que sea un ObjectId válido antes de convertir
                if (mongoose.Types.ObjectId.isValid(selectedEmpresaId)) {
                    // FASE 5: VERIFICAR SI ES LA EMPRESA PRINCIPAL
                    const empresaPrincipalId = await getEmpresaPrincipalId();
                    const esEmpresaPrincipal = selectedEmpresaId === empresaPrincipalId;
                    
                    // DEBUG FASE 5
                    console.log(`[TenantFilter DEBUG] selectedEmpresaId: ${selectedEmpresaId}`);
                    console.log(`[TenantFilter DEBUG] empresaPrincipalId: ${empresaPrincipalId}`);
                    console.log(`[TenantFilter DEBUG] esEmpresaPrincipal: ${esEmpresaPrincipal}`);
                    
                    if (esEmpresaPrincipal) {
                        // Si es la empresa principal, incluir proyectos SIN empresaId (compatibilidad hacia atrás)
                        req.tenantFilter = {
                            $or: [
                                { empresaId: new mongoose.Types.ObjectId(selectedEmpresaId) },
                                { empresaId: { $exists: false } },
                                { empresaId: null }
                            ]
                        };
                        console.log(`[TenantFilter] Super Admin filtrando por EMPRESA PRINCIPAL: ${selectedEmpresaId} (incluye proyectos sin empresaId)`);
                    } else {
                        // Otra empresa: filtro normal
                        req.tenantFilter = { 
                            empresaId: new mongoose.Types.ObjectId(selectedEmpresaId) 
                        };
                        console.log(`[TenantFilter] Super Admin filtrando por empresa: ${selectedEmpresaId}`);
                    }
                } else {
                    console.warn(`[TenantFilter] ID de empresa inválido: ${selectedEmpresaId}. Mostrando todas.`);
                    req.tenantFilter = {}; 
                }
            } catch (err) {
                console.error(`[TenantFilter] Error al convertir ID: ${selectedEmpresaId}`, err);
                req.tenantFilter = {}; 
            }
        } else {
            // Super Admin sin filtro válido = ve todas las empresas
            console.log(`[TenantFilter] Super Admin sin filtro específico (valor: ${selectedEmpresaId}). Mostrando todas.`);
            req.tenantFilter = {}; 
        }
        return next();
    }

    // FASE 5: Para usuarios normales, también verificar si pertenecen a la empresa principal
    if (req.user && req.user.empresaId) {
        const empresaPrincipalId = await getEmpresaPrincipalId();
        const esEmpresaPrincipal = req.user.empresaId === empresaPrincipalId;
        
        if (esEmpresaPrincipal) {
            // Usuario de empresa principal: ver proyectos de su empresa + sin empresaId
            req.tenantFilter = {
                $or: [
                    { empresaId: new mongoose.Types.ObjectId(req.user.empresaId) },
                    { empresaId: { $exists: false } },
                    { empresaId: null }
                ]
            };
            console.log(`[TenantFilter] Usuario de EMPRESA PRINCIPAL - incluye proyectos sin empresaId`);
        } else {
            // Usuario de otra empresa: solo su empresa
            req.tenantFilter = { 
                empresaId: new mongoose.Types.ObjectId(req.user.empresaId) 
            };
        }
        return next();
    }

    // Si no hay empresaId en el token, denegar acceso
    return res.status(403).json({ 
        error: 'Acceso denegado: No se pudo determinar la empresa del usuario.' 
    });
};

/**
 * Combina el filtro de empresa con filtros adicionales de la consulta
 * @param {Object} req - Request object
 * @param {Object} additionalFilters - Filtros adicionales (ej: { isDeleted: false })
 * @returns {Object} Filtro combinado
 */
const buildQueryFilter = (req, additionalFilters = {}) => {
    // FASE 4: Combinar tenantFilter (que puede tener filtro de empresa) + filtros adicionales
    // Esto funciona tanto para Super Admin (con empresa seleccionada) como para usuarios normales
    const baseFilter = req.tenantFilter || {};
    return {
        ...baseFilter,
        ...additionalFilters
    };
};

/**
 * Middleware para verificar acceso a un documento específico
 * Usar en rutas GET by ID, PUT, DELETE
 */
const checkTenantAccess = async (req, res, next) => {
    // Super Admin tiene acceso a todo
    if (req.user && req.user.isSuperAdmin) {
        return next();
    }

    // Para usuarios estándar, verificaremos en cada ruta específica
    // Este middleware marca que debe hacerse la verificación
    req.checkTenantOwnership = true;
    next();
};

/**
 * Función auxiliar para verificar si un documento pertenece a la empresa del usuario
 * @param {Object} req - Request object
 * @param {Object} document - Documento de MongoDB a verificar
 * @returns {Boolean} true si tiene acceso, false si no
 */
const hasTenantAccess = (req, document) => {
    // FASE 4: Si Super Admin tiene empresa seleccionada (tenantFilter), verificar que el documento pertenezca a esa empresa
    if (req.user && req.user.isSuperAdmin) {
        // Si hay un filtro de empresa específico en tenantFilter, aplicarlo
        if (req.tenantFilter && req.tenantFilter.empresaId) {
            if (!document || !document.empresaId) return false;
            return document.empresaId.toString() === req.tenantFilter.empresaId.toString();
        }
        // Sin filtro específico = acceso a todo
        return true;
    }

    // Sin documento, no hay acceso
    if (!document) {
        return false;
    }

    // Usuario normal: verificar coincidencia de empresaId
    const userEmpresaId = req.user && req.user.empresaId 
        ? req.user.empresaId.toString() 
        : null;
    
    const docEmpresaId = document.empresaId 
        ? document.empresaId.toString() 
        : null;

    return userEmpresaId && docEmpresaId && userEmpresaId === docEmpresaId;
};

module.exports = {
    applyTenantFilter,
    buildQueryFilter,
    checkTenantAccess,
    hasTenantAccess,
    limpiarEmpresaId,
    getEmpresaPrincipalId
};
