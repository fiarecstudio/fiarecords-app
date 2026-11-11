const cron = require('node-cron');
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Notificacion = require('../models/Notificacion');
const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');
const { saveSentCopy } = require('../controllers/bandejaEntradaController');
const {
    renderizarPlantillaCorreo,
    sanitizarCuerpoCorreo
} = require('../services/plantillaCorreoService');
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
    if (poliza?.esCargoAutomatico === true) {
        console.warn(`[Cron Notificaciones] Se omitió el recordatorio de póliza ${poliza._id} por cargo automático.`);
        return false;
    }

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

function calcularProximaFechaMensual(fechaBase, diaRecurrencia) {
    const fecha = new Date(fechaBase);
    const diaDelMes = Number(diaRecurrencia) || fecha.getUTCDate();
    fecha.setUTCDate(1);
    fecha.setUTCMonth(fecha.getUTCMonth() + 1);
    const ultimoDiaDelMes = new Date(Date.UTC(
        fecha.getUTCFullYear(),
        fecha.getUTCMonth() + 1,
        0
    )).getUTCDate();
    fecha.setUTCDate(Math.min(diaDelMes, ultimoDiaDelMes));
    return fecha;
}

function calcularProximaFechaPersonalizada(fechaBase, diasRecurrencia) {
    if (!Array.isArray(diasRecurrencia) || diasRecurrencia.length !== 2) return null;
    const [dia1, dia2] = diasRecurrencia.map(Number).sort((a, b) => a - b);
    if (![dia1, dia2].every(dia => Number.isInteger(dia) && dia >= 1 && dia <= 31) || dia1 === dia2) {
        return null;
    }

    const fecha = new Date(fechaBase);
    const crearFechaDelMes = (anio, mes, dia) => {
        const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
        return new Date(Date.UTC(
            anio,
            mes,
            Math.min(dia, ultimoDiaDelMes),
            fecha.getUTCHours(),
            fecha.getUTCMinutes(),
            fecha.getUTCSeconds(),
            fecha.getUTCMilliseconds()
        ));
    };
    const fechaDia2 = crearFechaDelMes(fecha.getUTCFullYear(), fecha.getUTCMonth(), dia2);
    if (fechaDia2 > fecha) return fechaDia2;

    const siguienteMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 1));
    return crearFechaDelMes(siguienteMes.getUTCFullYear(), siguienteMes.getUTCMonth(), dia1);
}

async function asegurarSiguienteRecordatorio(poliza, recordatorio) {
    if (!recordatorio.proximaFechaRecurrencia) return;
    const proximaFecha = new Date(recordatorio.proximaFechaRecurrencia);
    const resultado = await Poliza.updateOne(
        {
            _id: poliza._id,
            empresaId: poliza.empresaId,
            $and: [
                {
                    recordatoriosPersonalizados: {
                        $elemMatch: {
                            _id: recordatorio._id,
                            enviado: true,
                            recurrencia: { $in: ['mensual', 'mensual_personalizado'] },
                            proximaFechaRecurrencia: proximaFecha
                        }
                    }
                },
                {
                    recordatoriosPersonalizados: {
                        $not: { $elemMatch: { origenRecurrenciaId: recordatorio._id } }
                    }
                }
            ]
        },
        {
            $push: {
                recordatoriosPersonalizados: {
                    fechaProgramada: proximaFecha,
                    destinatario: recordatorio.destinatario,
                    asunto: recordatorio.asunto,
                    mensaje: recordatorio.mensaje,
                    recurrencia: recordatorio.recurrencia,
                    diaRecurrencia: recordatorio.diaRecurrencia || new Date(recordatorio.fechaProgramada).getUTCDate(),
                    diasRecurrencia: recordatorio.diasRecurrencia || [],
                    enviado: false,
                    creadoPor: recordatorio.creadoPor,
                    plantillaId: recordatorio.plantillaId || null,
                    origenRecurrenciaId: recordatorio._id
                }
            }
        }
    );
    if (resultado.modifiedCount > 0) {
        console.log(`[Cron Recordatorios] Próxima recurrencia creada para póliza ${poliza._id}: ${proximaFecha.toISOString()}.`);
    }
}

async function procesarRecordatoriosPersonalizados() {
    const ahora = new Date();
    const limiteLease = new Date(ahora.getTime() + 10 * 60 * 1000);
    const polizas = await Poliza.find({
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        esCargoAutomatico: { $ne: true },
        recordatoriosPersonalizados: {
            $elemMatch: {
                $or: [
                    { enviado: false, fechaProgramada: { $lte: ahora } },
                    {
                        enviado: true,
                        recurrencia: { $in: ['mensual', 'mensual_personalizado'] },
                        proximaFechaRecurrencia: { $type: 'date' }
                    }
                ]
            }
        }
    }).select('_id empresaId esCargoAutomatico recordatoriosPersonalizados').lean();

    for (const poliza of polizas) {
        if (poliza.esCargoAutomatico === true) continue;

        const recurrenciasPendientesDeCrear = (poliza.recordatoriosPersonalizados || [])
            .filter(recordatorio => recordatorio.enviado
                && ['mensual', 'mensual_personalizado'].includes(recordatorio.recurrencia)
                && recordatorio.proximaFechaRecurrencia);
        for (const recordatorio of recurrenciasPendientesDeCrear) {
            try {
                await asegurarSiguienteRecordatorio(poliza, recordatorio);
            } catch (error) {
                console.error(`[Cron Recordatorios] No se pudo crear la siguiente recurrencia ${recordatorio._id}:`, error);
            }
        }

        const recordatoriosVencidos = (poliza.recordatoriosPersonalizados || [])
            .filter(recordatorio => !recordatorio.enviado
                && new Date(recordatorio.fechaProgramada) <= ahora);

        for (const recordatorio of recordatoriosVencidos) {
            const filtroRecordatorio = {
                _id: recordatorio._id,
                enviado: false,
                fechaProgramada: { $lte: ahora },
                $or: [
                    { procesandoHasta: null },
                    { procesandoHasta: { $exists: false } },
                    { procesandoHasta: { $lte: ahora } }
                ]
            };
            const polizaBloqueada = await Poliza.findOneAndUpdate(
                {
                    _id: poliza._id,
                    empresaId: poliza.empresaId,
                    esCargoAutomatico: { $ne: true },
                    recordatoriosPersonalizados: { $elemMatch: filtroRecordatorio }
                },
                { $set: { 'recordatoriosPersonalizados.$.procesandoHasta': limiteLease } },
                { new: true }
            );
            if (!polizaBloqueada) continue;
            if (polizaBloqueada.esCargoAutomatico === true) {
                await Poliza.updateOne(
                    {
                        _id: polizaBloqueada._id,
                        empresaId: polizaBloqueada.empresaId,
                        recordatoriosPersonalizados: { $elemMatch: { _id: recordatorio._id, enviado: false } }
                    },
                    { $set: { 'recordatoriosPersonalizados.$.procesandoHasta': null } }
                );
                continue;
            }

            const recordatorioBloqueado = polizaBloqueada.recordatoriosPersonalizados
                .find(item => String(item._id) === String(recordatorio._id));
            if (!recordatorioBloqueado) continue;

            try {
                const empresa = await Empresa.findById(polizaBloqueada.empresaId)
                    .select('nombre notificaciones.email.firmaHTML notificaciones.email.signatureHtml notificaciones.email.smtpUser')
                    .lean();
                const firmaHTML = empresa?.notificaciones?.email?.firmaHTML
                    || empresa?.notificaciones?.email?.signatureHtml
                    || process.env.EMAIL_SIGNATURE_HTML
                    || `
                        <br><br>
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                        <div style="font-family: Arial, sans-serif; color: #333; font-size: 12px;">
                          <strong>Gestión de Cobranza</strong><br>
                          EME Asesores<br>
                          <a href="mailto:cobranza@masesores.mx">cobranza@masesores.mx</a> | +52 81 1585 1732<br>
                        </div>
                    `;
                const correoRecordatorio = renderizarPlantillaCorreo({
                    asunto: recordatorioBloqueado.asunto,
                    cuerpo: recordatorioBloqueado.mensaje
                }, {
                    CLIENTE: polizaBloqueada.cliente || '',
                    POLIZA: polizaBloqueada.numeroPoliza || 'S/N',
                    MONTO: '',
                    ASEGURADORA: polizaBloqueada.aseguradora || 'N/D'
                });
                const cuerpoConFirma = sanitizarCuerpoCorreo(`${correoRecordatorio.cuerpo}${firmaHTML}`);
                await enviarEmail({
                    empresaId: polizaBloqueada.empresaId,
                    destinatario: recordatorioBloqueado.destinatario,
                    asunto: correoRecordatorio.asunto,
                    cuerpo: cuerpoConFirma
                });
                const sentCopySaved = await saveSentCopy({
                    destinatarios: [recordatorioBloqueado.destinatario],
                    asunto: correoRecordatorio.asunto,
                    cuerpo: cuerpoConFirma,
                    attachments: [],
                    headers: {},
                    empresa,
                    followUp: false
                });
                if (!sentCopySaved) {
                    console.warn(`[Cron Recordatorios] Recordatorio ${recordatorio._id} enviado, pero no se guardó en Enviados.`);
                }
            } catch (error) {
                console.error(`[Cron Recordatorios] Error al enviar recordatorio ${recordatorio._id}:`, error);
                try {
                    await Poliza.updateOne(
                        {
                            _id: polizaBloqueada._id,
                            empresaId: polizaBloqueada.empresaId,
                            recordatoriosPersonalizados: {
                                $elemMatch: { _id: recordatorio._id, enviado: false }
                            }
                        },
                        { $set: { 'recordatoriosPersonalizados.$.procesandoHasta': null } }
                    );
                } catch (errorLiberacion) {
                    console.error(`[Cron Recordatorios] No se pudo liberar el recordatorio ${recordatorio._id}:`, errorLiberacion);
                }
                continue;
            }

            try {
                const proximaFechaRecurrencia = recordatorioBloqueado.recurrencia === 'mensual'
                    ? calcularProximaFechaMensual(
                        recordatorioBloqueado.fechaProgramada,
                        recordatorioBloqueado.diaRecurrencia
                    )
                    : recordatorioBloqueado.recurrencia === 'mensual_personalizado'
                        ? calcularProximaFechaPersonalizada(
                            recordatorioBloqueado.fechaProgramada,
                            recordatorioBloqueado.diasRecurrencia
                        )
                        : null;
                const resultado = await Poliza.updateOne(
                    {
                        _id: polizaBloqueada._id,
                        empresaId: polizaBloqueada.empresaId,
                        recordatoriosPersonalizados: { $elemMatch: { _id: recordatorio._id, enviado: false } }
                    },
                    {
                        $set: {
                            'recordatoriosPersonalizados.$.enviado': true,
                            'recordatoriosPersonalizados.$.procesandoHasta': null,
                            'recordatoriosPersonalizados.$.proximaFechaRecurrencia': proximaFechaRecurrencia
                        },
                        $push: {
                            historialComentarios: {
                                texto: `Recordatorio personalizado enviado a ${recordatorioBloqueado.destinatario}: ${recordatorioBloqueado.asunto}`,
                                fecha: new Date(),
                                gestor: recordatorioBloqueado.creadoPor,
                                tipo: 'recordatorio'
                            }
                        }
                    }
                );
                if (resultado.modifiedCount === 0) {
                    console.error(`[Cron Recordatorios] El correo se envió, pero no se pudo actualizar el recordatorio ${recordatorio._id}. Se conserva el lease para evitar un reintento inmediato.`);
                    continue;
                }
                console.log(`[Cron Recordatorios] Recordatorio ${recordatorio._id} enviado para póliza ${polizaBloqueada._id}.`);
                if (proximaFechaRecurrencia) {
                    try {
                        await asegurarSiguienteRecordatorio(polizaBloqueada, {
                            ...recordatorioBloqueado.toObject(),
                            enviado: true,
                            proximaFechaRecurrencia
                        });
                    } catch (errorRecurrencia) {
                        console.error(`[Cron Recordatorios] El correo se envió, pero no se pudo programar la siguiente recurrencia ${recordatorio._id}:`, errorRecurrencia);
                    }
                }
            } catch (error) {
                console.error(`[Cron Recordatorios] El correo se envió, pero no se pudo marcar el recordatorio ${recordatorio._id} como enviado. El lease expirará para permitir reintento:`, error);
            }
        }
    }
}

function iniciarCronNotificaciones() {
    cron.schedule('* * * * *', async () => {
        try {
            await procesarRecordatoriosPersonalizados();
        } catch (error) {
            console.error('[Cron Recordatorios] Error en el barrido de recordatorios personalizados:', error);
        }
    }, { timezone: TIMEZONE_MEXICO });
    console.log('✅ Cron de recordatorios personalizados activo (cada minuto)');

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
    procesarEstatusRenovacionDiario,
    procesarRecordatoriosPersonalizados,
    calcularProximaFechaMensual,
    calcularProximaFechaPersonalizada
};