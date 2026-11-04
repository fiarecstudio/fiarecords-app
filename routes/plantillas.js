const express = require('express');
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const plantillaController = require('../controllers/plantillaController');

const router = express.Router();

router.use(auth, applyTenantFilter);

const requireCompanyAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden administrar plantillas.' });
    }
    return next();
};

router.get('/', plantillaController.listarPlantillas);
router.post('/', requireCompanyAdmin, plantillaController.crearPlantilla);
router.put('/:id', requireCompanyAdmin, plantillaController.actualizarPlantilla);
router.delete('/:id', requireCompanyAdmin, plantillaController.eliminarPlantilla);

module.exports = router;
