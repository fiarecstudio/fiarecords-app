/**
 * FASE 4: Controlador de Empresas
 * Endpoints para gestión de empresas (solo Super Admin)
 */

const express = require('express');
const router = express.Router();
const Empresa = require('../models/Empresa');
const auth = require('../middleware/auth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');

// ==========================================
// MIDDLEWARE - Proteger todas las rutas
// ==========================================
router.use(auth);
router.use(requireSuperAdmin);

// ==========================================
// GET /api/empresas - Listar todas las empresas
// ==========================================
router.get('/', async (req, res) => {
    try {
        const empresas = await Empresa.find({}).sort({ createdAt: -1 });
        res.json(empresas);
    } catch (err) {
        console.error('Error al obtener empresas:', err);
        res.status(500).json({ error: 'Error al cargar empresas' });
    }
});

// ==========================================
// GET /api/empresas/:id - Obtener empresa específica
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const empresa = await Empresa.findById(req.params.id);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }
        res.json(empresa);
    } catch (err) {
        console.error('Error al obtener empresa:', err);
        res.status(500).json({ error: 'Error al cargar empresa' });
    }
});

// ==========================================
// POST /api/empresas - Crear nueva empresa
// ==========================================
router.post('/', async (req, res) => {
    try {
        let { nombre, rfc, direccion, telefono, email, moduloSeguros } = req.body;
        
        console.log('[POST /api/empresas] req.body original:', req.body);
        
        // Limpiar campos vacíos para evitar conflictos con unique: true
        if (rfc === '' || rfc === null || rfc === undefined) {
            delete req.body.rfc;
            rfc = undefined;
        }
        if (email === '' || email === null || email === undefined) {
            delete req.body.email;
            email = undefined;
        }
        
        console.log('[POST /api/empresas] moduloSeguros recibido:', moduloSeguros);
        console.log('[POST /api/empresas] req.body limpio:', req.body);

        // Validar campos requeridos
        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({ error: 'El nombre de la empresa es requerido' });
        }

        // Verificar que no exista una empresa con el mismo nombre
        const empresaExistente = await Empresa.findOne({ 
            nombre: { $regex: new RegExp(`^${nombre}$`, 'i') } 
        });
        if (empresaExistente) {
            return res.status(400).json({ error: 'Ya existe una empresa con este nombre' });
        }

        // Verificar RFC único si se proporciona
        if (rfc) {
            const rfcExistente = await Empresa.findOne({ rfc: rfc.toUpperCase() });
            if (rfcExistente) {
                return res.status(400).json({ error: 'Ya existe una empresa con este RFC' });
            }
        }

        // Crear nueva empresa
        const nuevaEmpresa = new Empresa({
            nombre: nombre.trim(),
            rfc: rfc ? rfc.toUpperCase().trim() : '',
            direccion: direccion || '',
            telefono: telefono || '',
            email: email || '',
            isActive: true,
            isDefault: false, // Solo la empresa principal migrada debe ser default
            moduloSeguros: moduloSeguros || false
        });
        
        console.log('[POST /api/empresas] Empresa a guardar:', nuevaEmpresa);

        await nuevaEmpresa.save();
        
        console.log('[POST /api/empresas] Empresa guardada con éxito:', nuevaEmpresa);

        res.status(201).json({
            message: 'Empresa creada exitosamente',
            empresa: nuevaEmpresa
        });
    } catch (err) {
        console.error('Error al crear empresa:', err);
        res.status(500).json({ error: 'Error al crear empresa' });
    }
});

// ==========================================
// PUT /api/empresas/:id - Actualizar empresa
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        let { nombre, rfc, direccion, telefono, email, isActive, moduloSeguros } = req.body;
        const empresaId = req.params.id;
        
        console.log('[PUT /api/empresas/:id] req.body original:', req.body);
        
        // Limpiar campos vacíos para evitar conflictos con unique: true
        if (rfc === '' || rfc === null || rfc === undefined) {
            delete req.body.rfc;
            rfc = undefined;
        }
        if (email === '' || email === null || email === undefined) {
            delete req.body.email;
            email = undefined;
        }
        
        console.log('[PUT /api/empresas/:id] moduloSeguros recibido:', moduloSeguros);
        console.log('[PUT /api/empresas/:id] req.body limpio:', req.body);

        // Buscar empresa existente
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Preparar datos a actualizar
        let datosActualizar = {};

        if (nombre !== undefined && nombre.trim() !== '') {
            // Verificar nombre único (excepto la propia empresa)
            const nombreExistente = await Empresa.findOne({
                _id: { $ne: empresaId },
                nombre: { $regex: new RegExp(`^${nombre}$`, 'i') }
            });
            if (nombreExistente) {
                return res.status(400).json({ error: 'Ya existe otra empresa con este nombre' });
            }
            datosActualizar.nombre = nombre.trim();
        }

        if (rfc !== undefined) {
            const rfcLimpio = rfc.toUpperCase().trim();
            // Verificar RFC único (excepto la propia empresa)
            const rfcExistente = await Empresa.findOne({
                _id: { $ne: empresaId },
                rfc: rfcLimpio
            });
            if (rfcExistente) {
                return res.status(400).json({ error: 'Ya existe otra empresa con este RFC' });
            }
            datosActualizar.rfc = rfcLimpio;
        }

        if (direccion !== undefined) datosActualizar.direccion = direccion;
        if (telefono !== undefined) datosActualizar.telefono = telefono;
        if (email !== undefined) datosActualizar.email = email;
        if (isActive !== undefined) datosActualizar.isActive = isActive;
        if (moduloSeguros !== undefined) datosActualizar.moduloSeguros = moduloSeguros;
        
        console.log('[PUT /api/empresas/:id] datosActualizar:', datosActualizar);

        // Actualizar empresa
        const empresaActualizada = await Empresa.findByIdAndUpdate(
            empresaId,
            { $set: datosActualizar },
            { new: true }
        );
        
        console.log('[PUT /api/empresas/:id] Empresa actualizada:', empresaActualizada);

        res.json({
            message: 'Empresa actualizada exitosamente',
            empresa: empresaActualizada
        });
    } catch (err) {
        console.error('[PUT /api/empresas/:id] Error al actualizar empresa:', err);
        console.error('[PUT /api/empresas/:id] Detalle del error:', err.message);
        console.error('[PUT /api/empresas/:id] Stack:', err.stack);
        res.status(500).json({ error: 'Error al actualizar empresa', details: err.message });
    }
});

// ==========================================
// DELETE /api/empresas/:id - Desactivar empresa (soft delete)
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const empresa = await Empresa.findById(req.params.id);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // No permitir desactivar la empresa default (principal)
        if (empresa.isDefault) {
            return res.status(403).json({ 
                error: 'No se puede desactivar la empresa principal (default)' 
            });
        }

        empresa.isActive = false;
        await empresa.save();

        res.json({ message: 'Empresa desactivada exitosamente' });
    } catch (err) {
        console.error('Error al desactivar empresa:', err);
        res.status(500).json({ error: 'Error al desactivar empresa' });
    }
});

module.exports = router;
