const express = require('express');
const router = express.Router();
const Deuda = require('../models/Deuda');
const auth = require('../middleware/auth');
const { applyTenantFilter, buildQueryFilter, hasTenantAccess, getEmpresaPrincipalId } = require('../middleware/tenantFilter');

// ==========================================
// MIDDLEWARE DE SEGURIDAD ESTRICTO PARA ADMIN
// ==========================================
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden ver esta sección.' });
    }
};

// Aplicar protección a todas las rutas de este archivo
router.use(auth);
router.use(isAdmin);
router.use(applyTenantFilter); // FASE 3: Aplicar filtro de empresa automáticamente

// ==========================================
// OBTENER TODAS LAS DEUDAS ACTIVAS
// ==========================================
router.get('/', async (req, res) => {
    try {
        const filtro = buildQueryFilter(req, { isDeleted: false });
        const deudas = await Deuda.find(filtro).sort({ createdAt: -1 });
        res.json(deudas);
    } catch (e) { 
        res.status(500).json({ error: 'Error al cargar las deudas' }); 
    }
});

// ==========================================
// ENDPOINT TEMPORAL DE MIGRACIÓN - ASIGNAR EMPRESA A DEUDAS HISTÓRICAS
// ==========================================
router.get('/migrar-historico', async (req, res) => {
    try {
        // Obtener el empresaId de la empresa principal
        const empresaPrincipalId = await getEmpresaPrincipalId();
        
        if (!empresaPrincipalId) {
            return res.status(400).json({ error: 'No se encontró empresa principal para migración' });
        }
        
        console.log('[Migración Deudas] Iniciando migración histórica...');
        console.log('[Migración Deudas] Empresa principal ID:', empresaPrincipalId);
        
        // Buscar deudas sin empresaId (null o no existe) - SE ELIMINÓ EL STRING VACÍO QUE CAUSABA EL ERROR
        const deudasSinEmpresa = await Deuda.find({
            $or: [
                { empresaId: { $exists: false } },
                { empresaId: null }
            ]
        });
        
        console.log(`[Migración Deudas] Encontradas ${deudasSinEmpresa.length} deudas sin empresaId`);
        
        if (deudasSinEmpresa.length === 0) {
            return res.json({ 
                message: 'No hay deudas para migrar. Todas ya tienen empresaId asignado.',
                migradas: 0
            });
        }
        
        // Actualizar masivamente asignando el empresaId de la empresa principal
        const resultado = await Deuda.updateMany(
            {
                $or: [
                    { empresaId: { $exists: false } },
                    { empresaId: null }
                ]
            },
            { $set: { empresaId: empresaPrincipalId } }
        );
        
        console.log(`[Migración Deudas] Migración completada: ${resultado.modifiedCount} deudas actualizadas`);
        
        res.json({ 
            message: 'Migración completada exitosamente',
            migradas: resultado.modifiedCount,
            empresaPrincipalId: empresaPrincipalId
        });
    } catch (e) { 
        console.error('[Migración Deudas] Error:', e);
        res.status(500).json({ error: 'Error al migrar deudas históricas' }); 
    }
});

// ==========================================
// CREAR NUEVA DEUDA
// ==========================================
router.post('/', async (req, res) => {
    try {
        const { concepto, total } = req.body;
        
        if (!concepto || !total || total <= 0) {
            return res.status(400).json({ error: 'Concepto y total válido son requeridos' });
        }

        const nuevaDeuda = new Deuda({
            concepto: concepto,
            total: parseFloat(total),
            empresaId: req.user.empresaId // FASE 3: Asignar empresa
        });
        
        await nuevaDeuda.save();
        res.status(201).json(nuevaDeuda);
    } catch (e) { 
        res.status(500).json({ error: 'Error al crear la deuda' }); 
    }
});

// ==========================================
// REGISTRAR UN ABONO / PAGO A UNA DEUDA
// ==========================================
router.post('/:id/pagos', async (req, res) => {
    try {
        const deuda = await Deuda.findById(req.params.id);
        if (!deuda) return res.status(404).json({ error: 'Deuda no encontrada' });
        // FASE 3: Verificar acceso por empresa
        if (!hasTenantAccess(req, deuda)) {
            return res.status(403).json({ error: 'No autorizado: La deuda no pertenece a tu empresa.' });
        }

        const montoAbono = parseFloat(req.body.monto);
        if (isNaN(montoAbono) || montoAbono <= 0) {
            return res.status(400).json({ error: 'Monto de abono inválido' });
        }

        // 1. Agregar el pago al historial de la deuda
        deuda.pagos.push({ 
            monto: montoAbono, 
            nota: req.body.nota || '' 
        });
        
        // 2. Sumar al acumulado pagado
        deuda.montoPagado += montoAbono;

        // 3. Verificar si ya se liquidó (con un margen de 50 centavos por posibles decimales)
        if (deuda.montoPagado >= (deuda.total - 0.5)) {
            deuda.estatus = 'Liquidada';
            deuda.montoPagado = deuda.total; // Cuadrar exacto para evitar $1000.000001
        }

        await deuda.save();
        res.json(deuda);
    } catch (e) { 
        res.status(500).json({ error: 'Error al registrar el abono' }); 
    }
});

// ==========================================
// ELIMINAR (OCULTAR) DEUDA
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const deuda = await Deuda.findById(req.params.id);
        if (!deuda) return res.status(404).json({ error: 'Deuda no encontrada' });
        if (!hasTenantAccess(req, deuda)) return res.status(403).json({ error: 'No autorizado' });
        await Deuda.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.status(204).send();
    } catch (e) { 
        res.status(500).json({ error: 'Error al eliminar la deuda' }); 
    }
});

module.exports = router;