const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const {
    getInbox,
    getUnreadCount,
    getEmailDetail,
    getFolders,
    createFolder,
    getMailRules,
    createMailRule,
    deleteMailRule,
    getBlacklist,
    addBlacklistEntry,
    removeBlacklistEntry,
    markRead,
    markUnread,
    updateFlag,
    moveEmail,
    moveEmailToSpam,
    moveEmailToTrash,
    replyEmail,
    programarCorreo,
    getScheduledEmails,
    cancelScheduledEmail,
    sendScheduledEmailNow
} = require('../controllers/bandejaEntradaController');

router.use(auth);
router.use(applyTenantFilter);
router.use((req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.isSuperAdmin) return next();
    return res.status(403).json({ success: false, error: 'Solo administradores pueden acceder a la bandeja.' });
});

router.get('/', getInbox);
router.get('/unread-count', getUnreadCount);
router.get('/folders', getFolders);
router.post('/carpetas', createFolder);
router.get('/reglas', getMailRules);
router.post('/reglas', createMailRule);
router.delete('/reglas/:id', deleteMailRule);
router.get('/lista-negra', getBlacklist);
router.post('/lista-negra', addBlacklistEntry);
router.delete('/lista-negra/:id', removeBlacklistEntry);
router.get('/programados', getScheduledEmails);
router.post('/programar', programarCorreo);
router.delete('/programados/:id', cancelScheduledEmail);
router.post('/programados/:id/send-now', sendScheduledEmailNow);
router.get('/:id', getEmailDetail);
router.post('/mark-read', markRead);
router.post('/reply', replyEmail);
router.post('/mark-unread', markUnread);
router.post('/:id/flag', updateFlag);
router.post('/:id/move', moveEmail);
router.post('/:id/spam', moveEmailToSpam);
router.post('/:id/delete', moveEmailToTrash);

module.exports = router;
