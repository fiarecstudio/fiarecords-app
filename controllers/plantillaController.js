const mongoose = require('mongoose');
const PlantillaCorreo = require('../models/PlantillaCorreo');
const { sanitizarCuerpoCorreo } = require('../services/plantillaCorreoService');

function obtenerFiltroEmpresa(req) {
    return req.tenantFilter || (req.user?.empresaId ? { empresaId: req.user.empresaId } : null);
}

function normalizarPlantilla(body = {}) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const asunto = typeof body.asunto === 'string' ? body.asunto.trim() : '';
    const cuerpo = typeof body.cuerpo === 'string' ? body.cuerpo.trim() : '';
    const tipo = body.tipo || 'general';
    if (!nombre || nombre.length > 120) throw new Error('El nombre es obligatorio y no puede exceder 120 caracteres.');
    if (!asunto || asunto.length > 200 || /[\r\n]/.test(asunto)) {
        throw new Error('El asunto es obligatorio, debe tener máximo 200 caracteres y no incluir saltos de línea.');
    }
    if (!cuerpo || cuerpo.length > 20000) throw new Error('El cuerpo es obligatorio y no puede exceder 20000 caracteres.');
    if (!['pago', 'recordatorio', 'general'].includes(tipo)) throw new Error('El tipo de plantilla no es válido.');
    return { nombre, asunto, cuerpo: sanitizarCuerpoCorreo(cuerpo), tipo };
}

async function listarPlantillas(req, res) {
    try {
        const filtroEmpresa = obtenerFiltroEmpresa(req);
        if (!filtroEmpresa) return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa.' });
        const tipo = String(req.query.tipo || '');
        if (tipo && !['pago', 'recordatorio', 'general'].includes(tipo)) {
            return res.status(400).json({ success: false, error: 'El tipo de plantilla no es válido.' });
        }
        const filtro = { ...filtroEmpresa, ...(tipo ? { tipo: { $in: [tipo, 'general'] } } : {}) };
        const data = await PlantillaCorreo.find(filtro).sort({ fechaCreacion: -1 }).lean();
        return res.json({ success: true, data });
    } catch (error) {
        console.error('[Plantillas] Error al listar:', error);
        return res.status(500).json({ success: false, error: 'No se pudieron cargar las plantillas.' });
    }
}

async function crearPlantilla(req, res) {
    try {
        const filtroEmpresa = obtenerFiltroEmpresa(req);
        if (!filtroEmpresa) return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa.' });
        let empresaId = filtroEmpresa.empresaId || req.user?.empresaId || req.body?.empresaId;
        if (!empresaId || !mongoose.Types.ObjectId.isValid(empresaId)) {
            return res.status(400).json({ success: false, error: 'Selecciona una empresa válida para la plantilla.' });
        }
        if (filtroEmpresa.empresaId && String(filtroEmpresa.empresaId) !== String(empresaId)) {
            return res.status(403).json({ success: false, error: 'La plantilla no pertenece a la empresa seleccionada.' });
        }
        const plantilla = await PlantillaCorreo.create({
            ...normalizarPlantilla(req.body),
            empresaId: new mongoose.Types.ObjectId(empresaId)
        });
        return res.status(201).json({ success: true, data: plantilla });
    } catch (error) {
        const esValidacion = error instanceof mongoose.Error.ValidationError || error.message?.startsWith('El ')
            || error.message?.startsWith('Selecciona') || error.message?.startsWith('El tipo');
        if (!esValidacion) console.error('[Plantillas] Error al crear:', error);
        return res.status(esValidacion ? 400 : 500).json({
            success: false,
            error: esValidacion ? error.message : 'No se pudo crear la plantilla.'
        });
    }
}

async function actualizarPlantilla(req, res) {
    try {
        const filtroEmpresa = obtenerFiltroEmpresa(req);
        if (!filtroEmpresa) return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa.' });
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'El ID de plantilla no es válido.' });
        }
        const plantilla = await PlantillaCorreo.findOneAndUpdate(
            { _id: req.params.id, ...filtroEmpresa },
            normalizarPlantilla(req.body),
            { new: true, runValidators: true }
        );
        if (!plantilla) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
        return res.json({ success: true, data: plantilla });
    } catch (error) {
        const esValidacion = error instanceof mongoose.Error.ValidationError || error.message?.startsWith('El ')
            || error.message?.startsWith('El tipo');
        if (!esValidacion) console.error('[Plantillas] Error al actualizar:', error);
        return res.status(esValidacion ? 400 : 500).json({
            success: false,
            error: esValidacion ? error.message : 'No se pudo actualizar la plantilla.'
        });
    }
}

async function eliminarPlantilla(req, res) {
    try {
        const filtroEmpresa = obtenerFiltroEmpresa(req);
        if (!filtroEmpresa) return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa.' });
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'El ID de plantilla no es válido.' });
        }
        const plantilla = await PlantillaCorreo.findOneAndDelete({ _id: req.params.id, ...filtroEmpresa });
        if (!plantilla) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
        return res.json({ success: true, message: 'Plantilla eliminada.' });
    } catch (error) {
        console.error('[Plantillas] Error al eliminar:', error);
        return res.status(500).json({ success: false, error: 'No se pudo eliminar la plantilla.' });
    }
}

module.exports = { listarPlantillas, crearPlantilla, actualizarPlantilla, eliminarPlantilla };
