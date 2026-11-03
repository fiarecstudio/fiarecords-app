const cron = require('node-cron');
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Notificacion = require('../models/Notificacion');
const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');
const {
    construirCorreoCobranza,
    obtenerDiasGraciaPoliza
} = require('../controllers/polizaController');

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

function obtenerDiaCalendarioMexico(fecha) {
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [year, month, day] = fecha.split('-').map(Number);
        return Date.UTC(year, month - 1, day) / 86400000;
    }

    const fechaValida = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(fechaValida.getTime())) return null;

    const partes = Object.fromEntries(formatoFechaMexico
        .formatToParts(fechaValida)
        .map(({ type, value }) => [type, value]));
    return Date.UTC(
        Number(partes.year),
        Number(partes.month) - 1,
        Number(partes.day)
    ) / 86400000;
}

function obtenerDiasRestantesMexico(fechaObjetivo, diaActualMexico) {
    const diaObjetivoMexico = obtenerDiaCalendarioMexico(fechaObjetivo);
    if (diaObjetivoMexico === null || diaActualMexico === null) return null;
    return diaObjetivoMexico - diaActualMexico;
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

function obtenerRangoRenovacionMexico(fecha = new Date()) {
    const partes = Object.fromEntries(formatoFechaMexico
        .formatToParts(fecha)
        .map(({ type, value }) => [type, value]));
    const year = Number(partes.year);
    const month = Number(partes.month);
    const day = Number(partes.day);
    const inicioUmbralUtc = new Date(Date.UTC(year, month - 1, day + 46));

    return {
        inicioHoy: fechaLocalMexicoAUTC(year, month, day),
        inicioMasDe45Dias: fechaLocalMexicoAUTC(
            inicioUmbralUtc.getUTCFullYear(),
            inicioUmbralUtc.getUTCMonth() + 1,
            inicioUmbralUtc.getUTCDate()
        )
    };
}

async function procesarEstatusRenovacionDiario() {
    const { inicioHoy, inicioMasDe45Dias } = obtenerRangoRenovacionMexico();
    const filtroPolizasActivas = {
        deletedAt: null,
        'fechas.vencimiento': { $gte: inicioHoy, $lt: inicioMasDe45Dias }
    };
    const filtroPendientesLejanas = {
        deletedAt: null,
        'fechas.vencimiento': { $gte: inicioMasDe45Dias }
    };

    const resultadoPendientes = await Poliza.updateMany(
        { ...filtroPolizasActivas, estado: 'Activa' },
        { $set: { estado: 'PendienteRenovacion' } }
    );
    const resultadoActivas = await Poliza.updateMany(
        { ...filtroPendientesLejanas, estado: 'PendienteRenovacion' },
        { $set: { estado: 'Activa' } }
    );

    console.log(
        `[Cron Estatus Pólizas] Actualización completada: `
        + `${resultadoPendientes.modifiedCount} pendientes de renovación, `
        + `${resultadoActivas.modifiedCount} reactivadas.`
    );
}

async function procesarNotificacionesDiarias() {
    console.log('[Cron Notificaciones] Iniciando barrido diario con configuración dinámica...');
    try {
        const ahora = new Date();
        const hoyMexico = obtenerDiaCalendarioMexico(ahora);
        const empresasSeguros = await Empresa.find({ moduloSeguros: true });

        for (const empresa of empresasSeguros) {
            const empresaId = empresa._id;
            const polizas = await Poliza.find({ empresaId, deletedAt: null });

            for (const poliza of polizas) {
                // FASE 4: NOTIFICACIONES DE RECIBOS PENDIENTES (Regla de 3 días)
                if (poliza.recibos && poliza.recibos.length > 0) {
                    for (const recibo of poliza.recibos) {
                        if (recibo.estadoRecibo === 'pendiente' && recibo.fechaVencimientoRecibo) {
                            const diasParaRecibo = obtenerDiasRestantesMexico(
                                recibo.fechaVencimientoRecibo,
                                hoyMexico
                            );

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
                    const diasRestantes = obtenerDiasRestantesMexico(
                        poliza.fechas.vencimiento,
                        hoyMexico
                    );

                    // Usar configuración dinámica de recordatoriosPago
                    const recordatorios = poliza.recordatoriosPago || [7, 3, 1, 0];
                    
                    if (diasRestantes !== null
                        && recordatorios.includes(diasRestantes)
                        && diasRestantes >= 0) {
                        // Verificar si ya se envió notificación hoy para este día específico
                        const yaNotificadoHoy = poliza.historialNotificaciones && poliza.historialNotificaciones.some(notif => {
                            const diaNotificacionMexico = obtenerDiaCalendarioMexico(notif.fecha);
                            return notif.tipo === 'vencimiento_poliza' && 
                                   diaNotificacionMexico === hoyMexico &&
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

                // Marcar vencida cuando termina el periodo de gracia para renovar.
                if (poliza.fechas?.vencimiento && !['Cancelada', 'Renovada'].includes(poliza.estado)) {
                    const diasGracia = obtenerDiasGraciaPoliza(poliza);
                    const fechaLimiteRenovacion = poliza.fechaLimiteRenovacion
                        || new Date(
                            new Date(poliza.fechas.vencimiento).getTime()
                            + diasGracia * 86400000
                        );
                    const diaLimiteMexico = obtenerDiaCalendarioMexico(fechaLimiteRenovacion);

                    if (diaLimiteMexico !== null && hoyMexico > diaLimiteMexico
                        && poliza.estado !== 'Vencida') {
                        console.log(`[Cron Notificaciones] Marcando póliza ${poliza.numeroPoliza} como vencida - periodo de gracia expirado`);
                        poliza.estado = 'Vencida';
                        await poliza.save();
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

    cron.schedule('0 1 * * *', async () => {
        try {
            await procesarEstatusRenovacionDiario();
        } catch (error) {
            console.error('[Cron Estatus Pólizas] Error al actualizar estatus de renovación:', error);
        }
    }, { timezone: TIMEZONE_MEXICO });
    console.log('✅ Cron de estatus de pólizas programado diariamente a la 1:00 AM');
}

module.exports = {
    iniciarCronNotificaciones,
    procesarNotificacionesDiarias,
    procesarEstatusRenovacionDiario
};