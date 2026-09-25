const cron = require('node-cron');
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Notificacion = require('../models/Notificacion');
const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');

async function procesarNotificacionesDiarias() {
    console.log('[Cron Notificaciones] Iniciando barrido diario con configuración dinámica...');
    try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const empresasSeguros = await Empresa.find({ moduloSeguros: true });

        for (const empresa of empresasSeguros) {
            const empresaId = empresa._id;
            const polizas = await Poliza.find({ empresaId, deletedAt: null });

            for (const poliza of polizas) {
                // NOTIFICACIONES DE VENCIMIENTO DE PÓLIZA
                if (poliza.fechas && poliza.fechas.vencimiento) {
                    const fVenc = new Date(poliza.fechas.vencimiento);
                    fVenc.setHours(0, 0, 0, 0);
                    const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));

                    // Usar configuración dinámica de recordatoriosPago
                    const recordatorios = poliza.recordatoriosPago || [7, 3, 1, 0];
                    
                    if (recordatorios.includes(diasRestantes) && diasRestantes >= 0) {
                        // Verificar si ya se envió notificación hoy para este día específico
                        const yaNotificadoHoy = poliza.historialNotificaciones && poliza.historialNotificaciones.some(notif => {
                            const notifDate = new Date(notif.fecha);
                            notifDate.setHours(0, 0, 0, 0);
                            return notif.tipo === 'vencimiento_poliza' && 
                                   notifDate.getTime() === hoy.getTime() &&
                                   notif.diasRestantes === diasRestantes;
                        });

                        if (!yaNotificadoHoy) {
                            await generarYEnviarNotificacion({
                                empresaId,
                                poliza,
                                tipo: 'vencimiento_poliza',
                                mensaje: `Estimado(a) ${poliza.cliente}, su póliza No. ${poliza.numeroPoliza} vence en ${diasRestantes} días.`,
                                diasRestantes
                            });
                        }
                    }
                }

                // NOTIFICACIONES DE PAGOS PENDIENTES - CORREGIDO PARA FRECUENCIA DE PAGO
                if (poliza.proximoPago) {
                    const fPago = new Date(poliza.proximoPago);
                    fPago.setHours(0, 0, 0, 0);
                    const diasParaPago = Math.ceil((fPago - hoy) / (1000 * 60 * 60 * 24));

                    // Verificar si está en el ciclo de pago correcto según tipoPago
                    let debeCobrarHoy = false;
                    const hoyMes = hoy.getMonth();
                    const hoyAnio = hoy.getFullYear();
                    const pagoMes = fPago.getMonth();
                    const pagoAnio = fPago.getFullYear();

                    switch (poliza.tipoPago) {
                        case 'mensual':
                            // Cobrar cada mes si el mes coincide
                            debeCobrarHoy = (pagoMes === hoyMes && pagoAnio === hoyAnio);
                            break;
                        case 'trimestral':
                            // Cobrar cada 3 meses
                            const mesesDiferencia = (hoyAnio - pagoAnio) * 12 + (hoyMes - pagoMes);
                            debeCobrarHoy = (mesesDiferencia % 3 === 0 && mesesDiferencia >= 0);
                            break;
                        case 'semestral':
                            // Cobrar cada 6 meses
                            const mesesDiferenciaSem = (hoyAnio - pagoAnio) * 12 + (hoyMes - pagoMes);
                            debeCobrarHoy = (mesesDiferenciaSem % 6 === 0 && mesesDiferenciaSem >= 0);
                            break;
                        case 'anual':
                        default:
                            // Cobrar cada año
                            debeCobrarHoy = (pagoAnio === hoyAnio);
                            break;
                    }

                    // Usar configuración dinámica de recordatoriosPago para pagos
                    const recordatorios = poliza.recordatoriosPago || [7, 3, 1, 0];

                    // Enviar notificación si está en el ciclo correcto y coincide con recordatorios
                    if (debeCobrarHoy && recordatorios.includes(diasParaPago) && diasParaPago >= 0) {
                        // Verificar si ya se envió notificación hoy para este día específico
                        const yaNotificadoHoy = poliza.historialNotificaciones && poliza.historialNotificaciones.some(notif => {
                            const notifDate = new Date(notif.fecha);
                            notifDate.setHours(0, 0, 0, 0);
                            return notif.tipo === 'pago_pendiente' && 
                                   notifDate.getTime() === hoy.getTime() &&
                                   notif.diasRestantes === diasParaPago;
                        });

                        if (!yaNotificadoHoy) {
                            await generarYEnviarNotificacion({
                                empresaId,
                                poliza,
                                tipo: 'pago_pendiente',
                                mensaje: `Estimado(a) ${poliza.cliente}, tiene un pago pendiente por su póliza No. ${poliza.numeroPoliza} con fecha límite el ${fPago.toLocaleDateString()}.`,
                                diasRestantes: diasParaPago
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

async function generarYEnviarNotificacion({ empresaId, poliza, tipo, mensaje, diasRestantes = 0 }) {
    const canal = 'email';

    // PRIORIDAD: Usar email del modelo Cliente, fallback a poliza.clienteEmail
    let destinatario = 'correo_prueba@ejemplo.com';
    if (poliza.clienteId) {
        const cliente = await Cliente.findById(poliza.clienteId);
        if (cliente && cliente.email) {
            destinatario = cliente.email;
            console.log(`[Cron Notificaciones] Usando email del cliente: ${cliente.email}`);
        } else if (poliza.clienteEmail) {
            destinatario = poliza.clienteEmail;
            console.log(`[Cron Notificaciones] Fallback a poliza.clienteEmail: ${poliza.clienteEmail}`);
        }
    } else if (poliza.clienteEmail) {
        destinatario = poliza.clienteEmail;
        console.log(`[Cron Notificaciones] Sin clienteId, usando poliza.clienteEmail: ${poliza.clienteEmail}`);
    }

    const registro = new Notificacion({ empresaId, polizaId: poliza._id, tipo, canal, destinatario, mensaje });

    // Crear entrada en historial de notificaciones de la póliza
    const entradaHistorial = {
        fecha: new Date(),
        tipo,
        canal,
        mensaje,
        diasRestantes
    };

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
        entradaHistorial.estado = 'enviada';
        
        // Actualizar última notificación de pago
        if (tipo === 'pago_pendiente') {
            poliza.ultimaNotificacionPago = new Date();
        }
    } catch (e) {
        registro.estado = 'fallida';
        registro.errorDetalle = e.message;
        entradaHistorial.estado = 'fallida';
    }
    
    await registro.save();
    
    // Agregar al historial de notificaciones de la póliza
    if (!poliza.historialNotificaciones) {
        poliza.historialNotificaciones = [];
    }
    poliza.historialNotificaciones.push(entradaHistorial);
    await poliza.save();
}

function iniciarCronNotificaciones() {
    cron.schedule('0 8 * * *', () => { procesarNotificacionesDiarias(); });
    console.log('✅ Cron de Notificaciones programado a las 8:00 AM');
}

module.exports = { iniciarCronNotificaciones, procesarNotificacionesDiarias };