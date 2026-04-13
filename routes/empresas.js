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
        const { nombre, rfc, direccion, telefono, email } = req.body;

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
            isDefault: false // Solo la empresa principal migrada debe ser default
        });

        await nuevaEmpresa.save();

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
        const { nombre, rfc, direccion, telefono, email, isActive } = req.body;
        const empresaId = req.params.id;

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

        // Actualizar empresa
        const empresaActualizada = await Empresa.findByIdAndUpdate(
            empresaId,
            { $set: datosActualizar },
            { new: true }
        );

        res.json({
            message: 'Empresa actualizada exitosamente',
            empresa: empresaActualizada
        });
    } catch (err) {
        console.error('Error al actualizar empresa:', err);
        res.status(500).json({ error: 'Error al actualizar empresa' });
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
