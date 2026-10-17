const cron = require('node-cron');
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Notificacion = require('../models/Notificacion');
const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');
const { construirCorreoCobranza } = require('../controllers/polizaController');

const TIMEZONE_MEXICO = 'America/Monterrey';
const formatoFechaMexico = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_MEXICO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

function fechaLocalMexicoAUTC(year, month, day) {
    const fechaLocalComoUTC = Date.UTC(year, month - 1, day);
    let timestamp = fechaLocalComoUTC;

    for (let intento = 0; intento < 3; intento++) {
        const partes = Object.fromEntries(formatoFechaMexico
            .formatToParts(new Date(timestamp))
            .map(({ type, value }) => [type, value]));
        const fechaObservadaComoUTC = Date.UTC(
            Number(partes.year),
            Number(partes.month) - 1,
            Number(partes.day),
            Number(partes.hour),
            Number(partes.minute),
            Number(partes.second)
        );
        const diferencia = fechaObservadaComoUTC - fechaLocalComoUTC;
        if (diferencia === 0) break;
        timestamp -= diferencia;
    }

    return new Date(timestamp);
}

function obtenerRangoMesMexico(fecha = new Date()) {
    const partes = Object.fromEntries(formatoFechaMexico
        .formatToParts(fecha)
        .map(({ type, value }) => [type, value]));
    const year = Number(partes.year);
    const month = Number(partes.month);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;

    return {
        inicio: fechaLocalMexicoAUTC(year, month, 1),
        fin: fechaLocalMexicoAUTC(nextMonthYear, nextMonth, 1)
    };
}

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
                // FASE 4: NOTIFICACIONES DE RECIBOS PENDIENTES (Regla de 3 días)
                if (poliza.recibos && poliza.recibos.length > 0) {
                    for (const recibo of poliza.recibos) {
                        if (recibo.estadoRecibo === 'pendiente' && recibo.fechaVencimientoRecibo) {
                            const fVencimientoRecibo = new Date(recibo.fechaVencimientoRecibo);
                            fVencimientoRecibo.setHours(0, 0, 0, 0);
                            const diasParaRecibo = Math.ceil((fVencimientoRecibo - hoy) / (1000 * 60 * 60 * 24));

                            // Regla de 3 días: enviar notificación exactamente 3 días antes
                            if (diasParaRecibo === 3) {
                                const { inicio: inicioMes, fin: finMes } = obtenerRangoMesMexico();
                                const yaNotificadoEsteMes = await Notificacion.exists({
                                    empresaId,
                                    polizaId: poliza._id,
                                    tipo: 'pago_pendiente',
                                    canal: 'email',
                                    numeroRecibo: recibo.numeroRecibo,
                                    estado: 'enviada',
                                    fechaEnvio: { $gte: inicioMes, $lt: finMes }
                                });

                                if (!yaNotificadoEsteMes) {
                                    const moneda = poliza.moneda === 'USD' ? 'USD' : 'MXN';
                                    const montoRecibo = Number(recibo.montoRecibo) || 0;
                                    const importeFormateado = `${moneda === 'USD' ? '' : '$'}${montoRecibo.toFixed(2)} ${moneda}`;
                                    await generarYEnviarNotificacion({
                                        empresaId,
                                        empresa,
                                        poliza,
                                        tipo: 'pago_pendiente',
                                        mensaje: `Estimado(a) ${poliza.cliente}, tiene un recibo pendiente (${recibo.numeroRecibo} - ${recibo.periodoCobertura}) por ${importeFormateado}.`,
                                        diasRestantes: diasParaRecibo,
                                        numeroRecibo: recibo.numeroRecibo,
                                        periodoCobertura: recibo.periodoCobertura
                                    });
                                }
                            }
                        }
                    }
                }

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
                                empresa,
                                poliza,
                                tipo: 'vencimiento_poliza',
                                mensaje: `Estimado(a) ${poliza.cliente}, su póliza No. ${poliza.numeroPoliza} requiere atención. Contacte a su asesor si necesita apoyo con la renovación.`,
                                diasRestantes
                            });
                        }
                    }
                }

                // FASE 4: CANCELACIÓN POR EXPIRACIÓN DE PERIODO DE GRACIA
                if (poliza.fechas?.vencimiento && poliza.fechaLimiteRenovacion) {
                    const fLimite = new Date(poliza.fechaLimiteRenovacion);
                    fLimite.setHours(0, 0, 0, 0);
                    
                    // Si la fecha actual pasó el límite de renovación
                    if (hoy > fLimite) {
                        if (poliza.estado !== 'Cancelada') {
                            console.log(`[Cron Notificaciones] Cancelando póliza ${poliza.numeroPoliza} - periodo de gracia expirado`);
                            poliza.estado = 'Cancelada';
                            await poliza.save();
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

async function generarYEnviarNotificacion({
    empresaId,
    empresa,
    poliza,
    tipo,
    mensaje,
    diasRestantes = 0,
    numeroRecibo,
    periodoCobertura
}) {
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

    const registro = new Notificacion({
        empresaId,
        polizaId: poliza._id,
        tipo,
        canal,
        destinatario,
        mensaje,
        ...(numeroRecibo ? { numeroRecibo } : {})
    });

    // Crear entrada en historial de notificaciones de la póliza
    const entradaHistorial = {
        fecha: new Date(),
        tipo,
        canal,
        mensaje,
        diasRestantes,
        ...(numeroRecibo ? { numeroRecibo } : {})
    };

    try {
        if (canal === 'email') {
            const recibo = numeroRecibo
                ? poliza.recibos?.find(item => item.numeroRecibo === numeroRecibo)
                : null;
            const moneda = poliza.moneda === 'USD' ? 'USD' : 'MXN';
            const monto = tipo === 'pago_pendiente'
                ? Number(recibo?.montoRecibo) || 0
                : Number(poliza.primaTotal) || 0;
            const cuerpoBase = construirCorreoCobranza({
                cliente: poliza.cliente,
                mensaje,
                numeroPoliza: poliza.numeroPoliza,
                aseguradora: poliza.aseguradora,
                monto: `${moneda === 'USD' ? '' : '$'}${monto.toFixed(2)} ${moneda}`,
                enlacePago: poliza.enlacePago,
                nombreEmpresa: empresa?.nombre || 'M Asesores',
                numeroRecibo,
                periodoCobertura
            });
            const firmaHTML = empresa?.notificaciones?.email?.firmaHTML
                || empresa?.notificaciones?.email?.signatureHtml
                || '';
            const cuerpo = firmaHTML
                ? cuerpoBase.replace('</body>', `<div style="max-width:620px;margin:16px auto 0;">${firmaHTML}</div></body>`)
                : cuerpoBase;
            const replyTo = empresa?.notificaciones?.email?.smtpUser
                || empresa?.email
                || process.env.IMAP_USER;

            await enviarEmail({
                empresaId,
                destinatario,
                asunto: tipo === 'vencimiento_poliza' ? 'Recordatorio de Póliza' : 'Pago Pendiente',
                cuerpo,
                replyTo
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
    cron.schedule('0 9 * * *', async () => {
        await procesarNotificacionesDiarias();
    }, { timezone: TIMEZONE_MEXICO });
    console.log('✅ Cron de Notificaciones programado a las 9:00 AM');
}

module.exports = { iniciarCronNotificaciones, procesarNotificacionesDiarias };