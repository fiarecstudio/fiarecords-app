const express = require('express');
const router = express.Router();
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const { enviarEmail } = require('../services/notificationService');
const auth = require('../middleware/auth');
const { applyTenantFilter } = require('../middleware/tenantFilter');

// Endpoint temporal para enviar correo manual
router.post('/enviar-correo-manual/:polizaId', auth, applyTenantFilter, async (req, res) => {
    try {
        console.log('[enviarCorreoManual] Iniciando envio manual...');
        const { polizaId } = req.params;
        const empresaId = req.user.empresaId;

        const poliza = await Poliza.findOne({ _id: polizaId, empresaId, deletedAt: null });
        if (!poliza) {
            console.log('[enviarCorreoManual] Poliza no encontrada');
            return res.status(404).json({ error: 'Poliza no encontrada' });
        }

        console.log('[enviarCorreoManual] Poliza encontrada:', poliza.numeroPoliza);
        console.log('[enviarCorreoManual] clienteEmail de poliza:', poliza.clienteEmail);
        console.log('[enviarCorreoManual] clienteId de poliza:', poliza.clienteId);

        let destinatario = poliza.clienteEmail;
        
        if (!destinatario && poliza.clienteId) {
            console.log('[enviarCorreoManual] Intentando obtener email del modelo Cliente...');
            const cliente = await Cliente.findById(poliza.clienteId);
            if (cliente && cliente.email) {
                destinatario = cliente.email;
                console.log('[enviarCorreoManual] Email del cliente:', destinatario);
            }
        }

        // Si aun no hay destinatario, usar un email de prueba
        if (!destinatario) {
            destinatario = 'correoprueba@ejemplo.com';
            console.log('[enviarCorreoManual] Usando email de prueba:', destinatario);
        }

        console.log('[enviarCorreoManual] Destinatario final:', destinatario);

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let mensaje = '';
        let tipo = '';
        let asunto = '';
        
        if (poliza.fechas && poliza.fechas.vencimiento) {
            const fVenc = new Date(poliza.fechas.vencimiento);
            fVenc.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));
            
            // Correo profesional mejorado
            asunto = 'Recordatorio de Pago de Póliza - EME Asesores';
            mensaje = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">EME Asesores</h2>
                        <p style="margin: 5px 0 0 0;">Gestión de Seguros</p>
                    </div>
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <p style="font-size: 16px; color: #333;">Estimado(a) <strong>${poliza.cliente}</strong>,</p>
                        <p style="font-size: 16px; color: #333;">Le saludamos cordialmente de <strong>EME Asesores</strong>.</p>
                        <p style="font-size: 16px; color: #333;">Por medio del presente le recordamos amablemente el pago de su póliza de seguro con los siguientes detalles:</p>
                        
                        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <p style="margin: 10px 0;"><strong>Número de Póliza:</strong> ${poliza.numeroPoliza}</p>
                            <p style="margin: 10px 0;"><strong>Tipo de Seguro:</strong> ${poliza.tipoSeguro}</p>
                            <p style="margin: 10px 0;"><strong>Aseguradora:</strong> ${poliza.aseguradora}</p>
                            <p style="margin: 10px 0;"><strong>Fecha Límite de Pago:</strong> ${fVenc.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            <p style="margin: 10px 0; color: ${diasRestantes <= 3 ? '#dc3545' : '#007bff'}; font-weight: bold;">Días Restantes: ${diasRestantes}</p>
                        </div>
                        
                        <p style="font-size: 16px; color: #333;">Le agradecemos de antemano su puntualidad en el pago.</p>
                        <p style="font-size: 16px; color: #333;">Si tiene alguna duda o requiere información adicional, no dude en contactarnos.</p>
                        
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                            <p style="margin: 5px 0; color: #666;">Atentamente,</p>
                            <p style="margin: 5px 0; color: #333; font-weight: bold;">EME Asesores</p>
                            <p style="margin: 5px 0; color: #666;">Teléfono: +52 (555) 123-4567</p>
                            <p style="margin: 5px 0; color: #666;">Email: contacto@emeasesores.com</p>
                        </div>
                    </div>
                    <div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;">
                        <p style="margin: 0;">Este correo es un recordatorio automático. Por favor no responda a este mensaje.</p>
                    </div>
                </div>
            `;
            tipo = 'pago_pendiente';
        } else if (poliza.proximoPago) {
            const fPago = new Date(poliza.proximoPago);
            fPago.setHours(0, 0, 0, 0);
            
            asunto = 'Recordatorio de Pago de Póliza - EME Asesores';
            mensaje = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">EME Asesores</h2>
                        <p style="margin: 5px 0 0 0;">Gestión de Seguros</p>
                    </div>
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <p style="font-size: 16px; color: #333;">Estimado(a) <strong>${poliza.cliente}</strong>,</p>
                        <p style="font-size: 16px; color: #333;">Le saludamos cordialmente de <strong>EME Asesores</strong>.</p>
                        <p style="font-size: 16px; color: #333;">Por medio del presente le recordamos amablemente el pago de su póliza de seguro con los siguientes detalles:</p>
                        
                        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <p style="margin: 10px 0;"><strong>Número de Póliza:</strong> ${poliza.numeroPoliza}</p>
                            <p style="margin: 10px 0;"><strong>Tipo de Seguro:</strong> ${poliza.tipoSeguro}</p>
                            <p style="margin: 10px 0;"><strong>Aseguradora:</strong> ${poliza.aseguradora}</p>
                            <p style="margin: 10px 0;"><strong>Fecha Límite de Pago:</strong> ${fPago.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                        
                        <p style="font-size: 16px; color: #333;">Le agradecemos de antemano su puntualidad en el pago.</p>
                        <p style="font-size: 16px; color: #333;">Si tiene alguna duda o requiere información adicional, no dude en contactarnos.</p>
                        
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                            <p style="margin: 5px 0; color: #666;">Atentamente,</p>
                           
