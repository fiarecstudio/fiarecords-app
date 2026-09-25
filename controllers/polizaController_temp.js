// Versión simplificada del endpoint de envío de correo manual
const enviarCorreoCobranzaDiaria = async (req, res) => {
    try {
        console.log('[enviarCorreoCobranzaDiaria] Iniciando envío manual...');
        const { polizaId } = req.params;
        const empresaId = req.user.empresaId;

        console.log('[enviarCorreoCobranzaDiaria] polizaId:', polizaId, 'empresaId:', empresaId);

        const Poliza = require('../models/Poliza');
        const poliza = await Poliza.findOne({ _id: polizaId, empresaId, deletedAt: null });
        if (!poliza) {
            console.log('[enviarCorreoCobranzaDiaria] Póliza no encontrada');
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        console.log('[enviarCorreoCobranzaDiaria] Póliza encontrada:', poliza.numeroPoliza);

        const { enviarEmail } = require('../services/notificationService');

        // Obtener destinatario (prioridad: clienteId, fallback a campos legacy)
        let destinatario = poliza.clienteEmail || 'correo_prueba@ejemplo.com';
        if (poliza.clienteId) {
            const Cliente = require('../models/Cliente');
            const cliente = await Cliente.findById(poliza.clienteId);
            if (cliente && cliente.email) {
                destinatario = cliente.email;
                console.log('[enviarCorreoCobranzaDiaria] Usando email del cliente:', destinatario);
            }
        }

        console.log('[enviarCorreoCobranzaDiaria] Destinatario:', destinatario);

        // Generar mensaje dinámico
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let mensaje = '';
        let tipo = '';
        
        if (poliza.fechas?.vencimiento) {
            const fVenc = new Date(poliza.fechas.vencimiento);
            fVenc.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));
            mensaje = \`Estimado(a) \${poliza.cliente}, su póliza No. \${poliza.numeroPoliza} vence en \${diasRestantes} días. Por favor contactarnos para su renovación.\`;
            tipo = 'vencimiento_poliza';
        } else if (poliza.proximoPago) {
            const fPago = new Date(poliza.proximoPago);
            fPago.setHours(0, 0, 0, 0);
            mensaje = \`Estimado(a) \${poliza.cliente}, tiene un pago pendiente por su póliza No. \${poliza.numeroPoliza} con fecha límite el \${fPago.toLocaleDateString()}.\`;
            tipo = 'pago_pendiente';
        } else {
            mensaje = \`Estimado(a) \${poliza.cliente}, te recordamos sobre tu póliza No. \${poliza.numeroPoliza}.\`;
            tipo = 'recordatorio_manual';
        }

        console.log('[enviarCorreoCobranzaDiaria] Mensaje generado:', mensaje);
        console.log('[enviarCorreoCobranzaDiaria] Tipo:', tipo);

        try {
            console.log('[enviarCorreoCobranzaDiaria] Intentando enviar email...');
            await enviarEmail({
                empresaId,
                destinatario,
                asunto: tipo === 'vencimiento_poliza' ? 'Recordatorio de Vencimiento de Póliza' : 'Recordatorio de Pago',
                cuerpo: \`<p>\${mensaje}</p>\`
            });
            
            console.log('[enviarCorreoCobranzaDiaria] Email enviado exitosamente');
            
            // Actualizar última notificación de pago
            poliza.ultimaNotificacionPago = new Date();
            await poliza.save();
            
            console.log('[enviarCorreoCobranzaDiaria] ultimaNotificacionPago actualizado');
            
            res.json({ 
                success: true, 
                message: 'Correo enviado manualmente correctamente',
                enviadoManualmente: true
            });
        } catch (e) {
            console.error('[enviarCorreoCobranzaDiaria] Error al enviar email:', e);
            res.status(500).json({ error: 'Error al enviar correo manual', details: e.message });
        }
    } catch (error) {
        console.error('[enviarCorreoCobranzaDiaria] Error general:', error);
        res.status(500).json({ error: 'Error al enviar correo manual', details: error.message });
    }
};

module.exports = { enviarCorreoCobranzaDiaria };
