const CENTS_PER_UNIT = 100;
const DEFAULT_IVA_PCT = 16;
const PAYMENT_INTERVALS = Object.freeze({
    mensual: 1,
    trimestral: 3,
    semestral: 6,
    anual: 12
});

function toCents(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.round((amount + Number.EPSILON) * CENTS_PER_UNIT);
}

function fromCents(value) {
    return value / CENTS_PER_UNIT;
}

function roundMoney(value) {
    return fromCents(toCents(value));
}

function calcularDesglosePrima({
    primaNeta = 0,
    derechoEmision = 0,
    recargo = 0,
    otrosServicios = 0,
    ivaPct = DEFAULT_IVA_PCT
} = {}) {
    const subtotalCents = toCents(primaNeta)
        + toCents(derechoEmision)
        + toCents(recargo)
        + toCents(otrosServicios);
    const ivaRate = Number(ivaPct);
    if (!Number.isFinite(ivaRate) || ivaRate < 0) {
        throw new RangeError('El porcentaje de IVA debe ser un número válido mayor o igual a cero.');
    }
    const ivaCents = Math.round(subtotalCents * ivaRate / 100);

    return {
        primaNeta: fromCents(toCents(primaNeta)),
        derechoEmision: fromCents(toCents(derechoEmision)),
        recargo: fromCents(toCents(recargo)),
        otrosServicios: fromCents(toCents(otrosServicios)),
        subtotal: fromCents(subtotalCents),
        ivaPct: ivaRate,
        iva: fromCents(ivaCents),
        total: fromCents(subtotalCents + ivaCents)
    };
}

function normalizarDuracionMeses(duracionMeses) {
    if (duracionMeses === undefined || duracionMeses === null || duracionMeses === '') return 12;
    const duration = Number(duracionMeses);
    return Number.isInteger(duration) && duration >= 1 ? duration : null;
}

function obtenerIntervaloMeses(tipoPago) {
    return PAYMENT_INTERVALS[String(tipoPago || '').toLowerCase()] || 12;
}

function obtenerNumeroRecibosPorTipo(tipoPago, duracionMeses = 12) {
    const duration = normalizarDuracionMeses(duracionMeses);
    if (!duration) throw new RangeError('La duración de la póliza debe ser de al menos un mes.');
    return Math.ceil(duration / obtenerIntervaloMeses(tipoPago));
}

function distribuirCentavos(totalCents, count) {
    const base = Math.floor(totalCents / count);
    const amounts = Array(count).fill(base);
    amounts[0] += totalCents - base * count;
    return amounts;
}

function addMonthsSafe(date, months) {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
}

function parseStartDate(value) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new TypeError('La fecha de inicio no es válida.');
        return new Date(value);
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day, 12);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            throw new TypeError('La fecha de inicio no es válida.');
        }
        return date;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('La fecha de inicio no es válida.');
    return date;
}

function generarTablaRecibos({
    primaTotal,
    tipoPago,
    duracionMeses,
    fechaInicio,
    primerPago = 0,
    montoAbono = 0,
    forzarDerechoPrimerPago = false,
    derechoEmision = 0,
    primaNeta,
    otrosServiciosContratados,
    recargos,
    gastosExpedicion,
    emisionEnPrimerPago
} = {}) {
    const totalCents = toCents(primaTotal);
    if (totalCents < 0) throw new RangeError('La prima total no puede ser negativa.');
    const interval = obtenerIntervaloMeses(tipoPago);
    const duration = normalizarDuracionMeses(duracionMeses);
    if (!duration) throw new RangeError('La duración de la póliza debe ser de al menos un mes.');
    const count = Math.ceil(duration / interval);
    const startDate = parseStartDate(fechaInicio);
    const abonoCents = toCents(montoAbono);
    const firstPaymentCents = toCents(primerPago);
    const feeCents = Math.max(0, toCents(derechoEmision));
    let amounts;

    if (emisionEnPrimerPago === true) {
        amounts = calcularMontosRecibos({
            primaTotal,
            primaNeta,
            otrosServiciosContratados,
            recargos,
            gastosExpedicion: gastosExpedicion ?? derechoEmision,
            montoAbono,
            primerPago,
            emisionEnPrimerPago: true,
            numeroPagos: count
        }).map(toCents);
    } else if (abonoCents > 0 && count > 1) {
        amounts = Array(count).fill(abonoCents);
        amounts[0] = totalCents - abonoCents * (count - 1);
    } else if (firstPaymentCents > 0 && count > 1) {
        amounts = Array(count).fill(0);
        amounts[0] = firstPaymentCents;
        const subsequent = distribuirCentavos(totalCents - firstPaymentCents, count - 1);
        subsequent.forEach((amount, index) => { amounts[index + 1] = amount; });
    } else if ((forzarDerechoPrimerPago || emisionEnPrimerPago) && feeCents > 0 && count > 1) {
        amounts = distribuirCentavos(totalCents - feeCents, count);
        amounts[0] += feeCents;
    } else {
        amounts = distribuirCentavos(totalCents, count);
    }

    if (amounts.some(amount => amount < 0)) {
        throw new RangeError('Los pagos configurados exceden la prima total.');
    }
    const difference = totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
    amounts[0] += difference;

    return amounts.map((amount, index) => {
        const fechaVencimientoRecibo = addMonthsSafe(startDate, index * interval);
        return {
            numeroRecibo: `REC-${index + 1}`,
            montoRecibo: fromCents(amount),
            fechaVencimientoRecibo,
            fechaFinGraciaRecibo: new Date(fechaVencimientoRecibo.getTime() + 30 * 24 * 60 * 60 * 1000),
            estadoRecibo: 'pendiente',
            periodoCobertura: `${index + 1}/${count}`
        };
    });
}

function calcularPagosNetosDistribuidos(primaNeta, numeroPagos) {
    const count = Math.max(1, Number(numeroPagos) || 1);
    return distribuirCentavos(toCents(primaNeta), count).map(fromCents);
}

function calcularPagosNetosConAbonosManuales({
    primaNeta,
    otrosServiciosContratados,
    primaTotal,
    gastosExpedicion,
    montoAbono,
    emisionEnPrimerPago,
    numeroPagos
}) {
    const netPayableCents = toCents(primaNeta) + toCents(otrosServiciosContratados);
    const count = Math.max(1, Number(numeroPagos) || 1);
    const abonoCents = toCents(montoAbono);
    if (abonoCents <= 0) return calcularPagosNetosDistribuidos(fromCents(netPayableCents), count);

    const expensesCents = toCents(gastosExpedicion);
    const installmentSubtotalCents = Math.round(abonoCents / 1.16);
    const totalSubtotalCents = Math.round(toCents(primaTotal) / 1.16);
    const surchargesCents = totalSubtotalCents - netPayableCents - expensesCents;
    const baseTotalCents = netPayableCents + surchargesCents;
    const expensePerInstallmentCents = emisionEnPrimerPago ? 0 : expensesCents / count;
    const installmentBaseCents = installmentSubtotalCents - expensePerInstallmentCents;
    const netRatio = baseTotalCents > 0 ? netPayableCents / baseTotalCents : 1;
    const subsequentNetCents = Math.max(0, Math.round(installmentBaseCents * netRatio));
    const firstNetCents = Math.max(0, netPayableCents - subsequentNetCents * (count - 1));
    return Array.from({ length: count }, (_, index) =>
        fromCents(index === 0 ? firstNetCents : subsequentNetCents));
}

function calcularMontosRecibos({
    primaTotal,
    primaNeta,
    otrosServiciosContratados,
    recargos,
    gastosExpedicion,
    montoAbono,
    primerPago,
    emisionEnPrimerPago,
    numeroPagos
}) {
    const totalCents = toCents(primaTotal);
    const count = Math.max(1, Number(numeroPagos) || 1);
    const abonoCents = toCents(montoAbono);
    if (abonoCents > 0 && count > 1) {
        const amounts = Array(count).fill(abonoCents);
        amounts[0] = totalCents - abonoCents * (count - 1);
        return amounts.map(fromCents);
    }

    if (emisionEnPrimerPago !== true) {
        return distribuirCentavos(totalCents, count).map(fromCents);
    }
    const feeCents = Math.max(0, toCents(gastosExpedicion));
    const netCents = toCents(primaNeta);
    const servicesCents = toCents(otrosServiciosContratados);
    const surchargeCents = recargos === undefined
        ? Math.round(totalCents / 1.16) - netCents - servicesCents - feeCents
        : toCents(recargos);
    const installmentBaseCents = (netCents + servicesCents + surchargeCents) / count;
    const amounts = Array.from({ length: count }, (_, index) =>
        Math.round((installmentBaseCents + (index === 0 ? feeCents : 0)) * 1.16));
    amounts[0] += totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
    return amounts.map(fromCents);
}

function validarImportesRecibos(recibos, primaTotal) {
    const totalCents = toCents(primaTotal);
    if (totalCents <= 0) return 'La Prima Total debe ser mayor a cero para generar recibos fraccionados.';
    if (!Array.isArray(recibos) || recibos.length === 0) return 'No se generaron recibos para el plan de pagos.';
    const amounts = recibos.map(recibo => Number(recibo?.montoRecibo));
    if (amounts.some(amount => !Number.isFinite(amount) || amount < 0
        || (totalCents > 0 && amount === 0))) {
        return 'El plan contiene recibos con importes inválidos, negativos o en cero.';
    }
    const sumCents = amounts.reduce((sum, amount) => sum + toCents(amount), 0);
    const difference = Math.abs(sumCents - totalCents);
    if (difference > 1) {
        return `La suma de los recibos no coincide con la Prima Total. Diferencia: $${fromCents(difference).toFixed(2)}; el máximo permitido es $0.01.`;
    }
    return null;
}

module.exports = {
    calcularDesglosePrima,
    generarTablaRecibos,
    normalizarDuracionMeses,
    obtenerIntervaloMeses,
    obtenerNumeroRecibosPorTipo,
    calcularPagosNetosDistribuidos,
    calcularPagosNetosConAbonosManuales,
    calcularMontosRecibos,
    validarImportesRecibos,
    roundMoney,
    toCents,
    fromCents
};
