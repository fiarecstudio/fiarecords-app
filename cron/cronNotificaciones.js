const cron = require('node-cron');
const Poliza = require('../models/Poliza');
const Empresa = require('../models/Empresa');
const Notificacion = require('../models/Notificacion');
const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');

async function procesarNotificacionesDiarias() {
    console.log('[Cron Notificaciones] Iniciando barrido diario...');
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const empresasSeguros = await Empresa.find({ moduloSeguros: true });
        
        for (const empresa of empresasSeguros) {
            const empresaId = empresa._id;
            const polizas = await Poliza.find({ empresaId, deletedAt: null });

            for (const poliza of polizas) {
                if (poliza.fechas?.vencimiento) {
                    const fVenc = new Date(poliza.fechas.vencimiento);
                    fVenc.setHours(0,0,0,0);
                    const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));

                    if ([30, 15, 5].includes(diasRestantes)) {
                        await generarYEnviarNotificacion({
                            empresaId,
                            poliza,
                            tipo: 'vencimiento_poliza',
                            mensaje: `Estimado(a) ${poliza.cliente}, su póliza No. ${poliza.numeroPoliza} vence en ${diasRestantes} días.` 
                        });
                    }
                }

                if (poliza.proximoPago) {
                    const fPago = new Date(poliza.proximoPago);
                    fPago.setHours(0,0,0,0);
                    if (hoy >= fPago) {
                        const yaNotificado = await Notificacion.findOne({
                            polizaId: poliza._id,
                            tipo: 'pago_pendiente',
                            createdAt: { $gte: fPago }
                        });
                        if (!yaNotificado) {
                            await generarYEnviarNotificacion({
                                empresaId,
                                poliza,
                                tipo: 'pago_pendiente',
                                mensaje: `Estimado(a) ${poliza.cliente}, presenta un pago pendiente por su póliza No. ${poliza.numeroPoliza}.` 
                            });
                        }
                    }
                }
            }
        }
        console.log('[Cron Notificaciones] Barrido diario completado.');
    } catch (error) {
        console.error('[Cron Notificaciones] Error:', error);
    }
}

async function generarYEnviarNotificacion({ empresaId, poliza, tipo, mensaje }) {
    const canal = 'email'; 
    const destinatario = poliza.clienteEmail || 'correo_prueba@ejemplo.com';
    const registro = new Notificacion({ empresaId, polizaId: poliza._id, tipo, canal, destinatario, mensaje });

    try {
        if (canal === 'email') {
            await enviarEmail({
                empresaId,
                destinatario,
                asunto: tipo === 'vencimiento_poliza' ? 'Vencimiento de Póliza' : 'Pago Pendiente',
                cuerpo: `<p>${mensaje}</p>` 
            });
        }
        registro.estado = 'enviada';
        registro.fechaEnvio = new Date();
    } catch (e) {
        registro.estado = 'fallida';
        registro.errorDetalle = e.message;
    }
    await registro.save();
}

function iniciarCronNotificaciones() {
    cron.schedule('0 8 * * *', () => { procesarNotificacionesDiarias(); });
    console.log('✅ Cron de Notificaciones programado a las 8:00 AM');
}

module.exports = { iniciarCronNotificaciones, procesarNotificacionesDiarias };
