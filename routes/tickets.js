const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');
const chatController = require('../controllers/chatController');

/**
 * Middleware opcional para verificar JWT si existe
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Ignore invalid token and continuar sin usuario
      console.warn('[TicketsRoute] Token inválido en optionalAuth:', error.message);
    }
  }
  next();
};

// GET /api/tickets/activo
router.get('/activo', optionalAuth, chatController.checkActiveTicket);

// POST /api/tickets/close
router.post('/close', auth, applyTenantFilter, chatController.closeTicketPost);

module.exports = router;
