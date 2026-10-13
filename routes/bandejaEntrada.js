const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const { getInbox, replyEmail } = require('../controllers/bandejaEntradaController');

router.use(auth);
router.use(applyTenantFilter);
router.use((req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.isSuperAdmin) return next();
    return res.status(403).json({ success: false, error: 'Solo administradores pueden acceder a la bandeja.' });
});

router.get('/', getInbox);
router.post('/reply', replyEmail);

module.exports = router;
