// Contenido COMPLETO para: routes/servicios.js
const express = require('express');
const router = express.Router();
const Servicio = require('../models/Servicio');
const auth = require('../middleware/auth');
const { applyTenantFilter, buildQueryFilter, hasTenantAccess } = require('../middleware/tenantFilter');

router.use(auth);
router.use(applyTenantFilter); // FASE 3: Aplicar filtro de empresa automáticamente

router.get('/', async (req, res) => { try { const filtro = buildQueryFilter(req, {isDeleted:false}); const d = await Servicio.find(filtro); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/:id', async (req, res) => { try { const d = await Servicio.findById(req.params.id); if(!d) return res.status(404).json({error:'No encontrado'}); if(!hasTenantAccess(req, d)) return res.status(403).json({error:'No autorizado'}); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.post('/', async (req, res) => { 
    try { 
        // FASE 4: Determinar empresaId
        let empresaIdAsignar;
        if (req.user.isSuperAdmin) {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            empresaIdAsignar = headerEmpresaId || req.user.empresaId;
        } else {
            empresaIdAsignar = req.user.empresaId;
        }
        
        const datos = {...req.body, empresaId: empresaIdAsignar}; 
        const d = new Servicio(datos); 
        await d.save(); 
        res.status(201).json(d); 
    } catch(e){res.status(500).json({e:'Error'})}
});
router.put('/:id', async (req, res) => { try { const existente = await Servicio.findById(req.params.id); if (!existente) return res.status(404).json({error:'No encontrado'}); if (!hasTenantAccess(req, existente)) return res.status(403).json({error:'No autorizado'}); const d = await Servicio.findByIdAndUpdate(req.params.id, req.body, {new:true}); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id', async (req, res) => { try { const existente = await Servicio.findById(req.params.id); if (!existente) return res.status(404).json({error:'No encontrado'}); if (!hasTenantAccess(req, existente)) return res.status(403).json({error:'No autorizado'}); await Servicio.findByIdAndUpdate(req.params.id, {isDeleted:true}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.get('/papelera/all', async (req, res) => { try { const filtro = buildQueryFilter(req, {isDeleted:true}); const d = await Servicio.find(filtro); res.json(d); } catch(e){res.status(500).json({e:'Error'})}});
router.put('/:id/restaurar', async (req, res) => { try { const existente = await Servicio.findById(req.params.id); if (!existente) return res.status(404).json({error:'No encontrado'}); if (!hasTenantAccess(req, existente)) return res.status(403).json({error:'No autorizado'}); await Servicio.findByIdAndUpdate(req.params.id, {isDeleted:false}); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});
router.delete('/:id/permanente', async (req, res) => { try { const existente = await Servicio.findById(req.params.id); if (!existente) return res.status(404).json({error:'No encontrado'}); if (!hasTenantAccess(req, existente)) return res.status(403).json({error:'No autorizado'}); await Servicio.findByIdAndDelete(req.params.id); res.status(204).send(); } catch(e){res.status(500).json({e:'Error'})}});

router.delete('/papelera/vaciar', async (req, res) => {
    try {
        const filtro = buildQueryFilter(req, { isDeleted: true });
        await Servicio.deleteMany(filtro);
        res.status(204).send();
    } catch (err) { res.status(500).json({ error: "Error al vaciar la papelera" }); }
});

module.exports = router;