const express = require('express');
const router = express.Router();
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const { enviarEmail } = require('../services/notificationService');
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');

router.post('/enviar-correo-manual/:polizaId', auth, applyTenantFilter, async (req, res) => {
    try {
        console.log('[enviarCorreoManual] Iniciando envio manual...');
        const { polizaId } = req.params;
        const empresaId = req.user.empresaId;

        const poliza = await Poliza.findOne({ _id: polizaId, empresaId, deletedAt: null });
        if (!poliza) {
            return res.status(404).json({ error: 'Poliza no encontrada' });
        }

        let destinatario = poliza.clienteEmail;
        if (!destinatario && poliza.clienteId) {
            const cliente = await Cliente.findById(poliza.clienteId);
            if (cliente && cliente.email) {
                destinatario = cliente.email;
            }
        }

        if (!destinatario) {
            destinatario = 'correoprueba@ejemplo.com';
        }

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let mensaje = '';
        let asunto = 'Recordatorio de Pago de Póliza - EME Asesores';
        
        if (poliza.fechas && poliza.fechas.vencimiento) {
            const fVenc = new Date(poliza.fechas.vencimiento);
            fVenc.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));
            
            mensaje = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background-color: #007bff; color: white; padding: 20px; text-align: center;"><h2 style="margin: 0;">EME Asesores</h2><p style="margin: 5px 0 0 0;">Gestión de Seguros</p></div><div style="padding: 30px; background-color: #f8f9fa;"><p style="font-size: 16px; color: #333;">Estimado(a) <strong>' + poliza.cliente + '</strong>,</p><p style="font-size: 16px; color: #333;">Le saludamos cordialmente de <strong>EME Asesores</strong>.</p><p style="font-size: 16px; color: #333;">Por medio del presente le recordamos amablemente el pago de su póliza de seguro.</p><div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="margin: 10px 0;"><strong>Número de Póliza:</strong> ' + poliza.numeroPoliza + '</p><p style="margin: 10px 0;"><strong>Tipo de Seguro:</strong> ' + poliza.tipoSeguro + '</p><p style="margin: 10px 0;"><strong>Aseguradora:</strong> ' + poliza.aseguradora + '</p><p style="margin: 10px 0;"><strong>Fecha Límite:</strong> ' + fVenc.toLocaleDateString('es-ES') + '</p><p style="margin: 10px 0; color: ' + (diasRestantes <= 3 ? '#dc3545' : '#007bff') + '; font-weight: bold;">Días Restantes: ' + diasRestantes + '</p></div><p style="font-size: 16px; color: #333;">Le agradecemos su puntualidad en el pago.</p><div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;"><p style="margin: 5px 0; color: #666;">Atentamente,</p><p style="margin: 5px 0; color: #333; font-weight: bold;">EME Asesores</p><p style="margin: 5px 0; color: #666;">Teléfono: +52 (555) 123-4567</p></div></div><div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;"><p style="margin: 0;">Este correo es un recordatorio automático.</p></div></div>';
        } else if (poliza.proximoPago) {
            const fPago = new Date(poliza.proximoPago);
            fPago.setHours(0, 0, 0, 0);
            mensaje = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background-color: #007bff; color: white; padding: 20px; text-align: center;"><h2 style="margin: 0;">EME Asesores</h2><p style="margin: 5px 0 0 0;">Gestión de Seguros</p></div><div style="padding: 30px; background-color: #f8f9fa;"><p style="font-size: 16px; color: #333;">Estimado(a) <strong>' + poliza.cliente + '</strong>,</p><p style="font-size: 16px; color: #333;">Le saludamos cordialmente de <strong>EME Asesores</strong>.</p><p style="font-size: 16px; color: #333;">Por medio del presente le recordamos amablemente el pago de su póliza de seguro.</p><div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="margin: 10px 0;"><strong>Número de Póliza:</strong> ' + poliza.numeroPoliza + '</p><p style="margin: 10px 0;"><strong>Tipo de Seguro:</strong> ' + poliza.tipoSeguro + '</p><p style="margin: 10px 0;"><strong>Aseguradora:</strong> ' + poliza.aseguradora + '</p><p style="margin: 10px 0;"><strong>Fecha Límite:</strong> ' + fPago.toLocaleDateString('es-ES') + '</p></div><p style="font-size: 16px; color: #333;">Le agradecemos su puntualidad en el pago.</p><div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;"><p style="margin: 5px 0; color: #666;">Atentamente,</p><p style="margin: 5px 0; color: #333; font-weight: bold;">EME Asesores</p><p style="margin: 5px 0; color: #666;">Teléfono: +52 (555) 123-4567</p></div></div><div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;"><p style="margin: 0;">Este correo es un recordatorio automático.</p></div></div>';
        } else {
            mensaje = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><div style="background-color: #007bff; color: white; padding: 20px; text-align: center;"><h2 style="margin: 0;">EME Asesores</h2><p style="margin: 5px 0 0 0;">Gestión de Seguros</p></div><div style="padding: 30px; background-color: #f8f9fa;"><p style="font-size: 16px; color: #333;">Estimado(a) <strong>' + poliza.cliente + '</strong>,</p><p style="font-size: 16px; color: #333;">Le saludamos cordialmente de <strong>EME Asesores</strong>.</p><p style="font-size: 16px; color: #333;">Le recordamos sobre su póliza de seguro.</p><div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="margin: 10px 0;"><strong>Número de Póliza:</strong> ' + poliza.numeroPoliza + '</p><p style="margin: 10px 0;"><strong>Tipo de Seguro:</strong> ' + poliza.tipoSeguro + '</p><p style="margin: 10px 0;"><strong>Aseguradora:</strong> ' + poliza.aseguradora + '</p></div><p style="font-size: 16px; color: #333;">Si tiene alguna duda, contactenos.</p><div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;"><p style="margin: 5px 0; color: #666;">Atentamente,</p><p style="margin: 5px 0; color: #333; font-weight: bold;">EME Asesores</p><p style="margin: 5px 0; color: #666;">Teléfono: +52 (555) 123-4567</p></div></div><div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;"><p style="margin: 0;">Este correo es un recordatorio automático.</p></div></div>';
        }

        try {
            await enviarEmail({
                empresaId,
                destinatario,
                asunto: asunto,
                cuerpo: mensaje
            });
            
            poliza.ultimaNotificacionPago = new Date();
            await poliza.save();
            
            res.json({ 
                success: true, 
                message: 'Correo enviado manualmente correctamente',
                destinatario: destinatario
            });
        } catch (e) {
            console.error('[enviarCorreoManual] Error al enviar email:', e);
            res.status(500).json({ error: 'Error al enviar correo manual', details: e.message });
        }
    } catch (error) {
        console.error('[enviarCorreoManual] Error general:', error);
        res.status(500).json({ error: 'Error al enviar correo manual', details: error.message });
    }
});

module.exports = router;
