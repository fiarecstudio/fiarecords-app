const mongoose = require('mongoose');
const crypto = require('crypto');
const Poliza = require('../models/Poliza');
const Usuario = require('../models/Usuario');
const Cliente = require('../models/Cliente');
const Configuracion = require('../models/Configuracion');
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || (pdfParseModule.default && pdfParseModule.default.PDFParse) || pdfParseModule.default || pdfParseModule;
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

/**
 * Normaliza el texto del PDF respetando saltos de línea vitales
 */
function normalizeText(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\t+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200F\uFEFF]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function normalizarFechaLocal(fecha) {
    if (!fecha) return null;
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [y, m, d] = fecha.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
    const parsed = new Date(fecha);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizarFechasPoliza(fechas) {
    if (!fechas) return fechas;
    return {
        inicio: normalizarFechaLocal(fechas.inicio),
        vencimiento: normalizarFechaLocal(fechas.vencimiento)
    };
}

function calcularProximoPago(fechaBase, tipoPago) {
    const proximoPago = new Date(fechaBase);
    switch (tipoPago) {
        case 'mensual':
            proximoPago.setMonth(proximoPago.getMonth() + 1);
            break;
        case 'trimestral':
            proximoPago.setMonth(proximoPago.getMonth() + 3);
            break;
        case 'anual':
        default:
            proximoPago.setFullYear(proximoPago.getFullYear() + 1);
            break;
    }
    return proximoPago;
}

const obtenerNumeroRecibosPorTipo = tipoPago => ({
    mensual: 12,
    trimestral: 4,
    semestral: 2,
    anual: 1
}[String(tipoPago || '').toLowerCase()] || 1);

const generarCalendarioRecibos = (primaTotal, fechaInicio, tipoPago, primerPago, montoAbono, opciones = {}) => {
    const recibos = [];
    const totalRecibos = obtenerNumeroRecibosPorTipo(tipoPago);
    let mesesIntervalo = 12;
    const tipo = (tipoPago || '').toLowerCase();
    if (tipo === 'mensual') mesesIntervalo = 1;
    else if (tipo === 'trimestral') mesesIntervalo = 3;
    else if (tipo === 'semestral') mesesIntervalo = 6;

    const indiceInicial = Math.max(0, Number(opciones.indiceInicial) || 0);
    const indicesRecibos = Array.isArray(opciones.indices)
        ? opciones.indices
        : Array.from({ length: Number.isInteger(opciones.cantidadRecibos)
            ? Math.min(totalRecibos, Math.max(0, opciones.cantidadRecibos))
            : totalRecibos }, (_, index) => indiceInicial + index);
    const cantidadRecibos = indicesRecibos.length;
    
    const montoBase = cantidadRecibos > 0
        ? parseFloat((primaTotal / cantidadRecibos).toFixed(2))
        : 0;
    const fechaBase = new Date(fechaInicio);
    const diaOriginal = fechaBase.getDate();
    
    for (let i = 0; i < cantidadRecibos; i++) {
        const indicePlan = indicesRecibos[i];
        let montoDelMes = montoBase;
        if (Array.isArray(opciones.montos)) {
            montoDelMes = Number(opciones.montos[i]) || 0;
        } else if (primerPago && montoAbono) {
            montoDelMes = indicePlan === 0 ? parseFloat(primerPago) : parseFloat(montoAbono);
        }

        const mesObjetivo = fechaBase.getMonth() + (indicePlan * mesesIntervalo);
        let fechaRecibo = new Date(fechaBase.getFullYear(), mesObjetivo, diaOriginal);
        const mesEsperado = mesObjetivo % 12;
        if (fechaRecibo.getMonth() !== mesEsperado) {
            fechaRecibo = new Date(fechaBase.getFullYear(), mesObjetivo + 1, 0);
        }

        recibos.push({
            numeroRecibo: `REC-${indicePlan + 1}`,
            montoRecibo: montoDelMes,
            fechaVencimientoRecibo: fechaRecibo,
            estadoRecibo: 'pendiente',
            periodoCobertura: `${indicePlan + 1}/${totalRecibos}`
        });
    }
    return recibos;
};

const esReciboPagado = recibo =>
    String(recibo?.estadoRecibo || recibo?.estado || '').toLowerCase() === 'pagado';

const regenerarRecibosPendientes = ({ recibosActuales = [], primaTotal, fechaInicio, tipoPago, primerPago, montoAbono }) => {
    const cantidadTotal = obtenerNumeroRecibosPorTipo(tipoPago);
    const redondearCentavos = monto => Number((Number(monto) || 0).toFixed(2));
    const costoTotal = redondearCentavos(Math.max(0, Number(primaTotal) || 0));
    const distribuirSaldo = (saldo, cantidad) => {
        if (cantidad <= 0) return [];
        const montos = [];
        let asignado = 0;
        for (let indice = 0; indice < cantidad; indice++) {
            const monto = indice === cantidad - 1
                ? redondearCentavos(saldo - asignado)
                : redondearCentavos(saldo / cantidad);
            montos.push(monto);
            asignado = redondearCentavos(asignado + monto);
        }
        return montos;
    };
    const montoCuotaInicial = cantidadTotal > 1 && Number(primerPago) > 0
        ? Math.min(costoTotal, redondearCentavos(primerPago))
        : null;
    const montosPlan = montoCuotaInicial === null
        ? distribuirSaldo(costoTotal, cantidadTotal)
        : [montoCuotaInicial, ...distribuirSaldo(
            redondearCentavos(costoTotal - montoCuotaInicial),
            cantidadTotal - 1
        )];
    const recibosPorIndice = new Map();

    recibosActuales.forEach((recibo, indiceOriginal) => {
        const numeroRecibo = Number(String(recibo.numeroRecibo || '').match(/\d+/)?.[0]);
        const numeroPeriodo = Number(String(recibo.periodoCobertura || '').match(/^(\d+)/)?.[1]);
        let indicePlan = Number.isFinite(numeroRecibo) && numeroRecibo > 0
            ? numeroRecibo - 1
            : Number.isFinite(numeroPeriodo) && numeroPeriodo > 0
                ? numeroPeriodo - 1
                : indiceOriginal;
        if (indicePlan < 0 || indicePlan >= cantidadTotal || recibosPorIndice.has(indicePlan)) {
            indicePlan = Array.from({ length: cantidadTotal }, (_, indice) => indice)
                .find(indice => !recibosPorIndice.has(indice));
        }
        if (indicePlan !== undefined) {
            recibosPorIndice.set(indicePlan, recibo.toObject ? recibo.toObject() : { ...recibo });
        }
    });

    const fechaBase = new Date(fechaInicio);
    const mesesPorTipo = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
    const mesesIntervalo = mesesPorTipo[String(tipoPago || '').toLowerCase()] || 12;
    const diaBase = fechaBase.getDate();
    return Array.from({ length: cantidadTotal }, (_, indicePlan) => {
        const reciboActual = recibosPorIndice.get(indicePlan) || {};
        const mesObjetivo = fechaBase.getMonth() + indicePlan * mesesIntervalo;
        const anio = fechaBase.getFullYear() + Math.floor(mesObjetivo / 12);
        const mes = mesObjetivo % 12;
        const ultimoDia = new Date(anio, mes + 1, 0).getDate();
        const fechaVencimiento = reciboActual.fechaVencimientoRecibo
            || reciboActual.fechaVencimiento
            || new Date(anio, mes, Math.min(diaBase, ultimoDia));
        return {
            ...reciboActual,
            numeroRecibo: reciboActual.numeroRecibo || `REC-${indicePlan + 1}`,
            periodoCobertura: reciboActual.periodoCobertura || `${indicePlan + 1}/${cantidadTotal}`,
            montoRecibo: montosPlan[indicePlan],
            fechaVencimientoRecibo: fechaVencimiento,
            estadoRecibo: reciboActual.estadoRecibo || reciboActual.estado || 'pendiente'
        };
    });
};

const calcularPagoNeto = (montoRecibo, primaNeta, primaTotal) => {
    const primaTotalNumerica = Number(primaTotal) || 0;
    const factorRatio = primaTotalNumerica
        ? Number(((Number(primaNeta) || 0) / primaTotalNumerica).toFixed(5))
        : 0;
    return Number(((Number(montoRecibo) || 0) * factorRatio).toFixed(2));
};


function datosClienteDesdeModelo(cliente) {
    return {
        clienteId: cliente._id,
        nombre: cliente.nombre,
        email: cliente.email || '',
        telefono: cliente.telefono || ''
    };
}

async function vincularOCrearCliente({ empresaId, asesorId, clienteNombre, clienteEmail, clienteTelefono, clienteId }) {
    const vacio = { clienteId: null, nombre: '', email: '', telefono: '' };

    if (clienteId) {
        const existente = await Cliente.findOne({ _id: clienteId, empresaId, deletedAt: null });
        if (existente) {
            let changed = false;
            if (clienteEmail && !existente.email) {
                existente.email = clienteEmail.trim();
                changed = true;
            }
            if (clienteTelefono && !existente.telefono) {
                existente.telefono = clienteTelefono.trim();
                changed = true;
            }
            if (changed) await existente.save();
            return datosClienteDesdeModelo(existente);
        }
    }

    const nombreNorm = (clienteNombre || '').trim();
    if (!nombreNorm) return vacio;

    let cliente = await Cliente.findOne({ empresaId, nombre: nombreNorm, deletedAt: null });

    if (!cliente) {
        cliente = new Cliente({
            empresaId,
            asesorId,
            nombre: nombreNorm,
            email: clienteEmail ? clienteEmail.trim() : '',
            telefono: clienteTelefono ? clienteTelefono.trim() : ''
        });
        await cliente.save();
        return datosClienteDesdeModelo(cliente);
    }

    let changed = false;
    if (clienteEmail && !cliente.email) {
        cliente.email = clienteEmail.trim();
        changed = true;
    }
    if (clienteTelefono && !cliente.telefono) {
        cliente.telefono = clienteTelefono.trim();
        changed = true;
    }
    if (changed) await cliente.save();

    return datosClienteDesdeModelo(cliente);
}

const crearPoliza = async (req, res) => {
    try {
        const { numeroPoliza, cliente, clienteEmail, clienteTelefono, tipoPago, tipoSeguro, aseguradora, fechas, primaTotal, primaNeta, documentoDriveId, inciso, paquete, montoAbono, primerPago, diasAnticipacionAviso, clienteId, asesorId } = req.body;

        // Inyectar empresaId del usuario autenticado
        const empresaId = req.user.empresaId;

        // Si no se especifica asesorId, asignar automáticamente el del usuario que crea la póliza
        const asesorIdFinal = asesorId || (req.user._id || req.user.id);
        const fechasNormalizadas = normalizarFechasPoliza(fechas);
        const tipoPagoFinal = tipoPago || 'anual';

        const clienteVinculado = await vincularOCrearCliente({
            empresaId,
            asesorId: asesorIdFinal,
            clienteNombre: cliente,
            clienteEmail,
            clienteTelefono,
            clienteId
        });

        let proximoPago = null;
        if (fechasNormalizadas?.inicio) {
            proximoPago = calcularProximoPago(fechasNormalizadas.inicio, tipoPagoFinal);
            if (fechasNormalizadas.vencimiento && proximoPago > fechasNormalizadas.vencimiento) {
                proximoPago = fechasNormalizadas.vencimiento;
            }
        }

        const nuevaPoliza = new Poliza({
            empresaId,
            asesorId: asesorIdFinal,
            numeroPoliza,
            cliente: clienteVinculado.nombre || cliente,
            clienteEmail: clienteVinculado.email || clienteEmail || '',
            clienteTelefono: clienteVinculado.telefono || clienteTelefono || '',
            tipoPago: tipoPagoFinal,
            tipoSeguro,
            aseguradora,
            fechas: fechasNormalizadas,
            primaTotal,
            primaNeta: Number(primaNeta) || 0,
            documentoDriveId,
            inciso,
            paquete,
            montoAbono: montoAbono || null,
            primerPago: primerPago || null,
            diasAnticipacionAviso: diasAnticipacionAviso || 3,
            saldoRestante: primaTotal,
            proximoPago,
            clienteId: clienteVinculado.clienteId
        });

        if (tipoPagoFinal !== "anual") {
            nuevaPoliza.recibos = generarCalendarioRecibos(
                nuevaPoliza.primaTotal,
                fechasNormalizadas.inicio,
                tipoPagoFinal,
                nuevaPoliza.primerPago || primerPago,
                nuevaPoliza.montoAbono || montoAbono
            );
        }
        if (nuevaPoliza.recibos.length > 0) {
            const primerPendiente = nuevaPoliza.recibos.find(recibo =>
                recibo.estadoRecibo?.toLowerCase() === 'pendiente'
                || recibo.estado?.toLowerCase() === 'pendiente'
            );
            const reciboReferencia = primerPendiente || nuevaPoliza.recibos[0];
            nuevaPoliza.proximoPago = reciboReferencia.fechaVencimientoRecibo || reciboReferencia.fechaVencimiento;
        }

        const polizaGuardada = await nuevaPoliza.save();
        res.status(201).json(polizaGuardada);
    } catch (error) {
        console.error('Error al crear póliza:', error);
        res.status(500).json({ error: 'Error al crear la póliza', details: error.message });
    }
};

const importarPolizasExcel = async (req, res) => {
    try {
        const empresaId = req.user?.empresaId || req.tenantFilter?.empresaId;
        const asesorId = req.user?._id || req.user?.id;
        if (!empresaId || !asesorId) {
            return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa o el asesor.' });
        }
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, error: 'Selecciona un archivo Excel .xlsx.' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
            return res.status(400).json({ success: false, error: 'El archivo no contiene hojas de cálculo.' });
        }

        const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        const normalizarEncabezado = value => String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
        const encabezadoIndex = filas.slice(0, 25).findIndex(row => {
            const headers = row.map(normalizarEncabezado);
            return headers.some(value => value === 'POLIZA' || value.endsWith(' POLIZA'))
                && headers.some(value => value === 'RECIBO' || value.includes('RECIBO'));
        });
        if (encabezadoIndex < 0) {
            return res.status(400).json({ success: false, error: 'No se encontraron las columnas POLIZA y RECIBO.' });
        }

        const encabezadosOriginales = filas[encabezadoIndex].map(value => String(value ?? ''));
        const headers = encabezadosOriginales.map(normalizarEncabezado);
        const columnas = {
            numeroPoliza: ['POLIZA', 'NUMERO DE POLIZA', 'NO POLIZA'],
            socio: ['SOCIO', 'ASESOR', 'NOMBRE DEL ASESOR'],
            cliente: ['NOMBRE DEL CLIENTE', 'CLIENTE', 'NOMBRE CLIENTE'],
            telefono: ['TELEFONO', 'TELEFONO DEL CLIENTE', 'CELULAR', 'MOVIL'],
            email: ['EMAIL', 'CORREO', 'CORREO ELECTRONICO'],
            inicio: ['VIG INICIAL', 'VIGENCIA INICIAL', 'VIGENCIA DESDE'],
            vencimiento: ['VIG FINAL', 'VIGENCIA FINAL', 'VIGENCIA HASTA'],
            tipoPago: ['FORMA DE PAGO', 'FORMA PAGO'],
            aseguradora: ['ASEGURADORA', 'COMPANIA'],
            primaTotal: ['P TOTAL', 'PRIMA TOTAL'],
            primaNeta: ['P NETA', 'PRIMA NETA'],
            numeroRecibo: ['RECIBO', 'NO RECIBO', 'NUMERO DE RECIBO'],
            fechaLimite: ['FECHA LIMITE DE PAGO', 'FECHA LIMITE PAGO', 'VENCIMIENTO RECIBO'],
            estatus: ['ESTATUS', 'ESTADO', 'ESTATUS RECIBO'],
            tipoSeguro: ['TIPO DE SEGURO', 'TIPO SEGURO'],
            periodo: ['PERIODO COBERTURA', 'PERIODO'],
            fechaPago: ['FECHA DE PAGO', 'FECHA PAGO']
        };
        const buscarColumna = aliases => {
            const normalizedAliases = aliases.map(normalizarEncabezado);
            let index = headers.findIndex(header => normalizedAliases.includes(header));
            if (index < 0) {
                index = headers.findIndex(header => normalizedAliases.some(alias => header.includes(alias)));
            }
            return index;
        };
        const indices = Object.fromEntries(Object.entries(columnas).map(([key, aliases]) => [key, buscarColumna(aliases)]));
        if (indices.numeroPoliza < 0 || indices.numeroRecibo < 0) {
            return res.status(400).json({ success: false, error: 'El Excel debe incluir POLIZA y RECIBO.' });
        }

        const texto = value => value == null ? '' : String(value).trim();
        const leer = (row, key) => indices[key] < 0 ? '' : row[indices[key]];
        const getCol = (obj, colName) => {
            const key = Object.keys(obj).find(k => k.trim().toUpperCase() === colName.trim().toUpperCase());
            return key ? obj[key] : undefined;
        };
        const convertirImporte = value => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            const valueText = String(value ?? '').trim();
            if (!valueText) return null;
            const parsed = Number(valueText.replace(/[$,\s]/g, ''));
            return Number.isFinite(parsed) ? parsed : null;
        };
        const convertirFecha = value => {
            if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
            if (typeof value === 'number') {
                const parts = XLSX.SSF.parse_date_code(value);
                return parts ? new Date(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S) : null;
            }
            const valueText = texto(value);
            const localDate = valueText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
            if (localDate) return new Date(Number(localDate[3]), Number(localDate[2]) - 1, Number(localDate[1]), 12);
            const parsed = new Date(valueText);
            return valueText && !Number.isNaN(parsed.getTime()) ? parsed : null;
        };
        const normalizarFormaPago = value => {
            const forma = normalizarEncabezado(value);
            if (forma.includes('MENS')) return 'mensual';
            if (forma.includes('TRIM')) return 'trimestral';
            if (forma.includes('SEME')) return 'semestral';
            return 'anual';
        };
        const normalizarTipoSeguro = value => {
            const tipo = normalizarEncabezado(value);
            if (tipo.includes('VIDA')) return 'Vida';
            if (tipo.includes('GASTOS MEDICOS')) return 'Gastos Médicos';
            if (tipo.includes('DANOS')) return 'Daños';
            return 'Vehicular';
        };

        const grupos = new Map();
        for (const row of filas.slice(encabezadoIndex + 1)) {
            const numeroPoliza = texto(leer(row, 'numeroPoliza'));
            if (!numeroPoliza) continue;
            if (!grupos.has(numeroPoliza)) {
                grupos.set(numeroPoliza, { datos: {}, recibos: [] });
            }
            const grupo = grupos.get(numeroPoliza);
            const primeraFila = Object.fromEntries(encabezadosOriginales.map((header, index) => [header, row[index]]));
            const primaTotalExcel = convertirImporte(getCol(primeraFila, 'P TOTAL'))
                ?? convertirImporte(getCol(primeraFila, 'PRIMA TOTAL'))
                ?? convertirImporte(leer(row, 'primaTotal'));
            const primaNetaExcel = convertirImporte(getCol(primeraFila, 'P NETA'))
                ?? convertirImporte(getCol(primeraFila, 'PRIMA NETA'))
                ?? convertirImporte(leer(row, 'primaNeta'));
            const prima = primaTotalExcel;
            const datosFila = {
                socio: texto(leer(row, 'socio')),
                cliente: texto(leer(row, 'cliente')),
                telefono: texto(leer(row, 'telefono')),
                email: texto(leer(row, 'email')),
                inicio: convertirFecha(leer(row, 'inicio')),
                vencimiento: convertirFecha(leer(row, 'vencimiento')),
                tipoPago: texto(leer(row, 'tipoPago')),
                aseguradora: texto(leer(row, 'aseguradora')),
                primaTotal: primaTotalExcel,
                primaNeta: primaNetaExcel,
                tipoSeguro: texto(leer(row, 'tipoSeguro'))
            };
            for (const [key, value] of Object.entries(datosFila)) {
                if ((value instanceof Date && !Number.isNaN(value.getTime())) || (value !== '' && value != null)) {
                    if (grupo.datos[key] == null || grupo.datos[key] === '') grupo.datos[key] = value;
                }
            }

            const numeroRecibo = texto(leer(row, 'numeroRecibo'));
            const fechaVencimientoRecibo = convertirFecha(leer(row, 'fechaLimite')) || datosFila.inicio;
            if (numeroRecibo || fechaVencimientoRecibo || prima != null) {
                const estatus = normalizarEncabezado(leer(row, 'estatus'));
                grupo.recibos.push({
                    numeroRecibo: numeroRecibo || `REC-${grupo.recibos.length + 1}`,
                    montoRecibo: prima ?? 0,
                    fechaVencimientoRecibo,
                    fechaPago: convertirFecha(leer(row, 'fechaPago')),
                    estadoRecibo: estatus.includes('PAGAD') || estatus.includes('COBRAD') ? 'pagado' : 'pendiente',
                    periodoCobertura: texto(leer(row, 'periodo'))
                });
            }
        }

        if (!grupos.size) {
            return res.status(400).json({ success: false, error: 'No se encontraron filas con número de póliza.' });
        }

        let creadas = 0;
        let actualizadas = 0;
        const errores = [];
        for (const [numeroPoliza, grupo] of grupos) {
            try {
                const numeroPolizaTrim = numeroPoliza.trim();
                const filtroPoliza = { empresaId, numeroPoliza: numeroPolizaTrim, deletedAt: null };
                let poliza = await Poliza.findOne(filtroPoliza);
                const primaTotal = grupo.datos.primaTotal
                    ?? (grupo.recibos.reduce((total, recibo) => total + recibo.montoRecibo, 0));
                const fechas = {
                    inicio: grupo.datos.inicio || poliza?.fechas?.inicio,
                    vencimiento: grupo.datos.vencimiento || poliza?.fechas?.vencimiento
                };
                const cliente = grupo.datos.cliente || poliza?.cliente;
                if (!cliente || !fechas.inicio || !fechas.vencimiento || primaTotal == null) {
                    throw new Error('Faltan cliente, vigencias o prima total.');
                }

                const nombreCliente = cliente.trim();
                const nombreEscapado = nombreCliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let clienteDoc = await Cliente.findOne({
                    empresaId,
                    deletedAt: null,
                    nombre: { $regex: new RegExp(`^${nombreEscapado}$`, 'i') }
                });
                if (!clienteDoc) {
                    clienteDoc = new Cliente({
                        empresaId,
                        asesorId,
                        nombre: nombreCliente,
                        telefono: grupo.datos.telefono || '',
                        email: grupo.datos.email || '',
                        origen: 'Importación Excel'
                    });
                    await clienteDoc.save();
                } else {
                    if (grupo.datos.telefono) clienteDoc.telefono = grupo.datos.telefono;
                    if (grupo.datos.email) clienteDoc.email = grupo.datos.email;
                    if (!clienteDoc.asesorId) clienteDoc.asesorId = asesorId;
                    await clienteDoc.save();
                }

                const socioExcel = grupo.datos.socio;
                let asesorPolizaId = poliza?.asesorId || asesorId;
                if (socioExcel) {
                    const socioEscapado = socioExcel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const filtroSocio = {
                        empresaId,
                        isDeleted: { $ne: true },
                        $or: [
                            { username: { $regex: new RegExp(`^${socioEscapado}$`, 'i') } },
                            { nombre: { $regex: new RegExp(`^${socioEscapado}$`, 'i') } }
                        ]
                    };
                    let usuarioSocio = await Usuario.findOne(filtroSocio).select('_id username nombre');

                    if (!usuarioSocio) {
                        const usernameBase = socioExcel.toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]/g, '') || 'asesor';
                        let username = usernameBase;
                        let sufijo = 2;
                        while (await Usuario.exists({ empresaId, username })) {
                            username = `${usernameBase}${sufijo++}`;
                        }

                        usuarioSocio = new Usuario({
                            empresaId,
                            username,
                            nombre: socioExcel,
                            password: crypto.randomBytes(32).toString('hex'),
                            role: 'asesor',
                            estado: 'pendiente',
                            permisos: ['dashboard', 'agenda', 'cotizaciones', 'pagos']
                        });
                        try {
                            await usuarioSocio.save();
                            console.log(`[IMPORT] Nuevo asesor creado automáticamente: ${socioExcel}`);
                        } catch (error) {
                            if (error.code !== 11000) throw error;
                            usuarioSocio = await Usuario.findOne(filtroSocio).select('_id username nombre');
                            if (!usuarioSocio) throw error;
                        }
                    }

                    asesorPolizaId = usuarioSocio._id;
                }

                const esNueva = !poliza;
                if (!poliza) {
                    poliza = new Poliza({
                        empresaId,
                        asesorId: asesorPolizaId,
                        asesorNombre: socioExcel || 'General',
                        numeroPoliza: numeroPolizaTrim,
                        cliente: clienteDoc.nombre,
                        clienteId: clienteDoc._id,
                        clienteTelefono: grupo.datos.telefono || clienteDoc.telefono || '',
                        clienteEmail: grupo.datos.email || clienteDoc.email || '',
                        tipoSeguro: normalizarTipoSeguro(grupo.datos.tipoSeguro),
                        aseguradora: grupo.datos.aseguradora || 'Sin especificar',
                        tipoPago: normalizarFormaPago(grupo.datos.tipoPago),
                        fechas,
                        primaTotal,
                        primaNeta: grupo.datos.primaNeta ?? 0,
                        estado: 'Activa',
                        saldoRestante: primaTotal,
                        pagos: [],
                        recibos: []
                    });
                } else {
                    poliza.asesorId = asesorPolizaId;
                    poliza.asesorNombre = socioExcel || poliza.asesorNombre || 'General';
                    poliza.cliente = clienteDoc.nombre;
                    poliza.clienteId = clienteDoc._id;
                    poliza.clienteTelefono = grupo.datos.telefono || clienteDoc.telefono || poliza.clienteTelefono || '';
                    poliza.clienteEmail = grupo.datos.email || clienteDoc.email || poliza.clienteEmail || '';
                    poliza.aseguradora = grupo.datos.aseguradora || poliza.aseguradora;
                    poliza.tipoPago = grupo.datos.tipoPago ? normalizarFormaPago(grupo.datos.tipoPago) : poliza.tipoPago;
                    poliza.tipoSeguro = grupo.datos.tipoSeguro
                        ? normalizarTipoSeguro(grupo.datos.tipoSeguro)
                        : poliza.tipoSeguro || 'Vehicular';
                    poliza.fechas = fechas;
                    poliza.primaTotal = primaTotal;
                    poliza.primaNeta = grupo.datos.primaNeta ?? 0;
                }

                for (let index = 0; index < grupo.recibos.length; index++) {
                    const importado = grupo.recibos[index];
                    const reciboExistente = poliza.recibos.find(recibo =>
                        texto(recibo.numeroRecibo).toUpperCase() === importado.numeroRecibo.toUpperCase()
                    ) || poliza.recibos.find(recibo =>
                        Number(recibo.montoRecibo) === importado.montoRecibo
                        && recibo.fechaVencimientoRecibo
                        && importado.fechaVencimientoRecibo
                        && new Date(recibo.fechaVencimientoRecibo).toDateString() === importado.fechaVencimientoRecibo.toDateString()
                    );
                
                    let recibo = reciboExistente;
                    if (recibo) {
                        recibo.numeroRecibo = importado.numeroRecibo;
                        recibo.montoRecibo = importado.montoRecibo;
                        recibo.fechaVencimientoRecibo = importado.fechaVencimientoRecibo || fechas.inicio;
                        recibo.estadoRecibo = importado.estadoRecibo;
                        recibo.periodoCobertura = importado.periodoCobertura || `${index + 1}/${grupo.recibos.length}`;
                    } else {
                        poliza.recibos.push({
                            ...importado,
                            fechaVencimientoRecibo: importado.fechaVencimientoRecibo || fechas.inicio,
                            periodoCobertura: importado.periodoCobertura || `${index + 1}/${grupo.recibos.length}`
                        });
                        recibo = poliza.recibos[poliza.recibos.length - 1];
                    }

                    let pagoVinculado = poliza.pagos.find(pago => pago.reciboId && String(pago.reciboId) === String(recibo._id));
                    if (importado.estadoRecibo === 'pagado') {
                        if (!pagoVinculado) {
                            pagoVinculado = poliza.pagos.find(pago =>
                                !pago.reciboId
                                && Number(pago.monto) === importado.montoRecibo
                                && pago.fechaPago
                                && importado.fechaPago
                                && new Date(pago.fechaPago).toDateString() === importado.fechaPago.toDateString()
                            );
                        }
                        if (pagoVinculado) {
                            pagoVinculado.reciboId = recibo._id;
                            pagoVinculado.monto = importado.montoRecibo;
                            pagoVinculado.estado = 'pagado';
                        } else {
                            poliza.pagos.push({
                                reciboId: recibo._id,
                                monto: importado.montoRecibo,
                                fechaPago: importado.fechaPago || new Date(),
                                metodoPago: 'importado',
                                estado: 'pagado'
                            });
                        }
                    } else if (pagoVinculado) {
                        pagoVinculado.estado = 'pendiente';
                    }
                }

                const pendientes = poliza.recibos.filter(recibo => recibo.estadoRecibo === 'pendiente');
                poliza.saldoRestante = pendientes.reduce((total, recibo) => total + (Number(recibo.montoRecibo) || 0), 0);
                poliza.proximoPago = pendientes
                    .map(recibo => recibo.fechaVencimientoRecibo)
                    .filter(Boolean)
                    .sort((a, b) => new Date(a) - new Date(b))[0] || null;
                poliza.estadoPago = poliza.saldoRestante === 0 ? 'pagado_completo' : 'al_corriente';
                poliza.estado = 'Activa';
                const datosUpsert = {
                    empresaId,
                    numeroPoliza: numeroPolizaTrim,
                    asesorId: poliza.asesorId,
                    asesorNombre: poliza.asesorNombre || 'General',
                    clienteId: clienteDoc._id,
                    cliente: clienteDoc.nombre,
                    clienteTelefono: poliza.clienteTelefono || '',
                    clienteEmail: poliza.clienteEmail || '',
                    aseguradora: poliza.aseguradora,
                    tipoPago: poliza.tipoPago,
                    tipoSeguro: poliza.tipoSeguro,
                    fechas: poliza.fechas,
                    primaTotal: poliza.primaTotal,
                    primaNeta: poliza.primaNeta ?? 0,
                    estado: 'Activa',
                    recibos: poliza.recibos.map(recibo => recibo.toObject ? recibo.toObject() : recibo),
                    pagos: poliza.pagos.map(pago => pago.toObject ? pago.toObject() : pago),
                    saldoRestante: poliza.saldoRestante,
                    proximoPago: poliza.proximoPago,
                    estadoPago: poliza.estadoPago
                };
                const opcionesUpsert = {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                    runValidators: true,
                    includeResultMetadata: true
                };
                let resultadoUpsert;
                try {
                    resultadoUpsert = await Poliza.findOneAndUpdate(
                        filtroPoliza,
                        { $set: datosUpsert },
                        opcionesUpsert
                    );
                } catch (error) {
                    if (error.code !== 11000) throw error;
                    resultadoUpsert = await Poliza.findOneAndUpdate(
                        filtroPoliza,
                        { $set: datosUpsert },
                        { ...opcionesUpsert, upsert: false }
                    );
                    if (!resultadoUpsert) throw error;
                }

                const polizaGuardada = resultadoUpsert?.value || resultadoUpsert;
                if (!polizaGuardada) throw new Error('No se pudo guardar la póliza importada.');
                const actualizada = resultadoUpsert?.lastErrorObject
                    ? resultadoUpsert.lastErrorObject.updatedExisting
                    : esNueva && !resultadoUpsert?.value;
                if (actualizada) actualizadas++;
                else creadas++;
            } catch (error) {
                errores.push({ numeroPoliza, error: error.message });
            }
        }

        const procesadas = creadas + actualizadas;
        res.json({
            success: true,
            message: 'Importación exitosa',
            procesadas,
            creadas,
            actualizadas,
            ...(errores.length ? { errores } : {})
        });
    } catch (error) {
        console.error('[importarPolizasExcel] Error:', error);
        res.status(500).json({ success: false, error: 'Error al importar pólizas desde Excel', details: error.message });
    }
};

const obtenerPolizas = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;
        
        // Construir filtro base
        let filtro = {
            empresaId,
            deletedAt: null,
            estado: { $nin: ['Cancelada', 'Renovada'] }
        };
        
        // RBAC: Si el usuario es admin, puede ver todas las pólizas de la empresa
        // Si viene un query param asesorId, filtra por ese asesor específico
        if (userRole === 'admin') {
            const asesorSolicitado = String(req.query.asesorId || '').trim();
            if (asesorSolicitado && !['todos', 'all', 'null', 'undefined'].includes(asesorSolicitado.toLowerCase())) {
                filtro.asesorId = asesorSolicitado;
            }
        } else {
            // Si no es admin, SOLO puede ver sus propias pólizas
            filtro.asesorId = userId;
        }
        
        const polizas = await Poliza.find(filtro).populate('asesorId', 'username').lean();
        
        res.json(polizas.map(poliza => {
            const asesor = poliza.asesorId;
            return {
                ...poliza,
                asesorNombre: asesor?.username || poliza.asesorNombre || '',
                asesorId: asesor?._id || asesor
            };
        }));
    } catch (error) {
        console.error('Error al obtener pólizas:', error);
        res.status(500).json({ error: 'Error al obtener las pólizas', details: error.message });
    }
};

const actualizarPoliza = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;

        const polizaExistente = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        if (!polizaExistente) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }

        const datosActualizacion = { ...req.body };

        if (datosActualizacion.primaNeta !== undefined) {
            datosActualizacion.primaNeta = Number(datosActualizacion.primaNeta) || 0;
        }

        if (datosActualizacion.fechas) {
            datosActualizacion.fechas = normalizarFechasPoliza(datosActualizacion.fechas);
        }

        const fechasCambiaron = datosActualizacion.fechas && (
            (datosActualizacion.fechas.inicio && polizaExistente.fechas?.inicio &&
                new Date(datosActualizacion.fechas.inicio).getTime() !== new Date(polizaExistente.fechas.inicio).getTime()) ||
            (datosActualizacion.fechas.vencimiento && polizaExistente.fechas?.vencimiento &&
                new Date(datosActualizacion.fechas.vencimiento).getTime() !== new Date(polizaExistente.fechas.vencimiento).getTime())
        );
        const tipoPagoCambio = datosActualizacion.tipoPago && datosActualizacion.tipoPago !== polizaExistente.tipoPago;
        const sinPagosRegistrados = !polizaExistente.pagos || polizaExistente.pagos.length === 0;
        const cambioImportePlan = ['primaTotal', 'primerPago', 'montoAbono'].some(campo =>
            datosActualizacion[campo] !== undefined
            && (Number(datosActualizacion[campo]) || 0) !== (Number(polizaExistente[campo]) || 0)
        );
        const planRecibosCambio = Boolean(
            fechasCambiaron
            || tipoPagoCambio
            || cambioImportePlan
            || req.body.recalcularRecibos === true
        );

        if (fechasCambiaron || tipoPagoCambio) {
            const inicioBase = datosActualizacion.fechas?.inicio || polizaExistente.fechas?.inicio;
            const vencimiento = datosActualizacion.fechas?.vencimiento || polizaExistente.fechas?.vencimiento;
            const tipoPago = datosActualizacion.tipoPago || polizaExistente.tipoPago || 'anual';

            if (inicioBase && (sinPagosRegistrados || fechasCambiaron || tipoPagoCambio)) {
                let proximoPago = calcularProximoPago(inicioBase, tipoPago);
                if (vencimiento && proximoPago > vencimiento) {
                    proximoPago = vencimiento;
                }
                datosActualizacion.proximoPago = proximoPago;
            } else if (vencimiento && polizaExistente.proximoPago && polizaExistente.proximoPago > vencimiento) {
                datosActualizacion.proximoPago = vencimiento;
            }
        }

        const datosClienteCambiaron = datosActualizacion.cliente !== undefined
            || datosActualizacion.clienteEmail !== undefined
            || datosActualizacion.clienteTelefono !== undefined
            || datosActualizacion.clienteId !== undefined;

        if (datosClienteCambiaron) {
            const asesorParaCliente = datosActualizacion.asesorId || polizaExistente.asesorId;
            const clienteVinculado = await vincularOCrearCliente({
                empresaId,
                asesorId: asesorParaCliente,
                clienteNombre: datosActualizacion.cliente ?? polizaExistente.cliente,
                clienteEmail: datosActualizacion.clienteEmail ?? polizaExistente.clienteEmail,
                clienteTelefono: datosActualizacion.clienteTelefono ?? polizaExistente.clienteTelefono,
                clienteId: datosActualizacion.clienteId || polizaExistente.clienteId
            });

            datosActualizacion.clienteId = clienteVinculado.clienteId;
            if (clienteVinculado.clienteId) {
                datosActualizacion.cliente = clienteVinculado.nombre || datosActualizacion.cliente || polizaExistente.cliente;
                datosActualizacion.clienteEmail = clienteVinculado.email || (datosActualizacion.clienteEmail ?? polizaExistente.clienteEmail ?? '');
                datosActualizacion.clienteTelefono = clienteVinculado.telefono || (datosActualizacion.clienteTelefono ?? polizaExistente.clienteTelefono ?? '');
            }
        }

        if (planRecibosCambio) {
            const primaTotal = Number(datosActualizacion.primaTotal ?? polizaExistente.primaTotal) || 0;
            const primerPago = Number(datosActualizacion.primerPago ?? polizaExistente.primerPago) || 0;
            const montoAbono = Number(datosActualizacion.montoAbono ?? polizaExistente.montoAbono) || 0;
            const tipoPago = datosActualizacion.tipoPago || polizaExistente.tipoPago || 'anual';
            const fechaInicio = datosActualizacion.fechas?.inicio || polizaExistente.fechas?.inicio;
            datosActualizacion.recibos = regenerarRecibosPendientes({
                recibosActuales: polizaExistente.recibos || [],
                primaTotal,
                fechaInicio,
                tipoPago,
                primerPago,
                montoAbono
            });
            const recibosPendientes = datosActualizacion.recibos.filter(recibo => !esReciboPagado(recibo));
            datosActualizacion.saldoRestante = Number(recibosPendientes
                .reduce((total, recibo) => total + (Number(recibo.montoRecibo) || 0), 0)
                .toFixed(2));
            datosActualizacion.estadoPago = datosActualizacion.saldoRestante === 0 ? 'pagado_completo' : 'al_corriente';
            datosActualizacion.proximoPago = recibosPendientes[0]?.fechaVencimientoRecibo || null;
        }

        polizaExistente.set(datosActualizacion);
        const poliza = await polizaExistente.save();

        res.json(poliza);
    } catch (error) {
        console.error('Error al actualizar póliza:', error);
        res.status(500).json({ error: 'Error al actualizar la póliza', details: error.message });
    }
};
const recalcularRecibos = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const poliza = await Poliza.findOne({ _id: req.params.id, empresaId, deletedAt: null });
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }

        const obtenerImporte = (valor, respaldo) => {
            if (valor === undefined || valor === null || valor === '') return Number(respaldo) || 0;
            const importe = Number(valor);
            return Number.isFinite(importe) ? importe : null;
        };
        const primaTotal = obtenerImporte(req.body.costoTotal ?? req.body.primaTotal, poliza.primaTotal);
        const primerPago = obtenerImporte(req.body.pagoInicial ?? req.body.primerPago, poliza.primerPago);
        const montoAbono = obtenerImporte(req.body.montoAbono, poliza.montoAbono);
        if ([primaTotal, primerPago, montoAbono].includes(null)) {
            return res.status(400).json({ error: 'Los montos deben ser valores numéricos válidos' });
        }

        const fechaInicio = req.body.fechaInicio || req.body.fechas?.inicio || poliza.fechas?.inicio;
        const fechaInicioDate = new Date(fechaInicio);
        if (!fechaInicio || Number.isNaN(fechaInicioDate.getTime())) {
            return res.status(400).json({ error: 'La fecha de inicio no es válida' });
        }
        const tipoPago = String(req.body.formaPago || req.body.tipoPago || poliza.tipoPago || 'anual').toLowerCase();
        poliza.recibos = regenerarRecibosPendientes({
            recibosActuales: poliza.recibos || [],
            primaTotal,
            fechaInicio: fechaInicioDate,
            tipoPago,
            primerPago,
            montoAbono
        });

        poliza.primaTotal = primaTotal;
        if (req.body.primaNeta !== undefined) {
            poliza.primaNeta = obtenerImporte(req.body.primaNeta, poliza.primaNeta) ?? poliza.primaNeta;
        }
        poliza.primerPago = primerPago;
        poliza.montoAbono = montoAbono;
        poliza.tipoPago = tipoPago;
        poliza.fechas.inicio = fechaInicioDate;
        const primerPendiente = poliza.recibos.find(recibo =>
            recibo.estadoRecibo?.toLowerCase() === 'pendiente'
            || recibo.estado?.toLowerCase() === 'pendiente'
        );
        const reciboReferencia = primerPendiente || poliza.recibos[0];
        poliza.saldoRestante = poliza.recibos
            .filter(recibo => recibo.estadoRecibo === 'pendiente')
            .reduce((total, recibo) => total + (Number(recibo.montoRecibo) || 0), 0);
        poliza.estadoPago = poliza.saldoRestante === 0 ? 'pagado_completo' : 'al_corriente';
        poliza.proximoPago = reciboReferencia
            ? reciboReferencia.fechaVencimientoRecibo || reciboReferencia.fechaVencimiento || null
            : null;

        await poliza.save();
        return res.json({ success: true, message: 'Recibos recalculados correctamente', poliza });
    } catch (error) {
        console.error('[recalcularRecibos] Error:', error);
        return res.status(500).json({ error: 'Error al recalcular los recibos', details: error.message });
    }
};

const eliminarPoliza = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // FASE 2: SOFT DELETE - Solo actualiza deletedAt en lugar de borrar
        const poliza = await Poliza.findOneAndUpdate(
            { _id: id, empresaId, deletedAt: null },
            { deletedAt: new Date() },
            { new: true }
        );
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }

        if (poliza.polizaAnteriorId) {
            const polizaVieja = await Poliza.findOne({
                _id: poliza.polizaAnteriorId,
                empresaId,
                deletedAt: null,
                estado: 'Renovada'
            });
            if (polizaVieja) {
                polizaVieja.estado = 'Activa';
                await polizaVieja.save();
            }
        }
        
        res.json({ message: 'Póliza enviada a papelera de reciclaje' });
    } catch (error) {
        console.error('Error al eliminar póliza:', error);
        res.status(500).json({ error: 'Error al eliminar la póliza', details: error.message });
    }
};

const cancelarPoliza = async (req, res) => {
    try {
        const poliza = await Poliza.findOne({
            _id: req.params.id,
            empresaId: req.user.empresaId,
            deletedAt: null
        });
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        poliza.estado = 'Cancelada';
        if (poliza.recibos && poliza.recibos.length > 0) {
            poliza.recibos.forEach(recibo => {
                const estadoRecibo = (recibo.estadoRecibo || recibo.estado || '').toLowerCase();
                if (estadoRecibo === 'pendiente') {
                    recibo.estadoRecibo = 'cancelado';
                }
            });
        }
        poliza.proximoPago = null;

        await poliza.save();
        return res.json({ success: true, message: 'Póliza cancelada correctamente', poliza });
    } catch (error) {
        console.error('[cancelarPoliza] Error:', error);
        return res.status(500).json({ error: 'Error al cancelar la póliza', details: error.message });
    }
};

const obtenerPolizaPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Buscar por id, empresaId y que no esté eliminada, con populate de clienteId
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null })
            .populate('clienteId', 'nombre telefono email');
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }
        
        res.json(poliza);
    } catch (error) {
        console.error('Error al obtener póliza:', error);
        res.status(500).json({ error: 'Error al obtener la póliza', details: error.message });
    }
};

// FASE 2: PAPELERA DE RECICLAJE
const obtenerPapelera = async (req, res) => {
    try {
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Usar req.tenantFilter proporcionado por el middleware applyTenantFilter
        // Esto permite que el Super Admin use el header X-Empresa-Id para cambiar de empresa
        const filtroEmpresa = req.tenantFilter || {};

        // Combinar filtro de empresa con condición de soft delete (usando deletedAt según modelo Poliza.js)
        const filtroPapelera = {
            ...filtroEmpresa,
            deletedAt: { $ne: null }
        };

        // RBAC: Si no es admin, filtrar por asesorId
        if (userRole !== 'admin') {
            filtroPapelera.asesorId = asesorId;
        }

        // Devolver solo pólizas eliminadas (deletedAt != null) respetando el filtro de empresa
        const polizasEliminadas = await Poliza.find(filtroPapelera).sort({ deletedAt: -1 }).lean();

        res.json(polizasEliminadas);
    } catch (error) {
        console.error('Error al obtener papelera:', error);
        res.status(500).json({ error: 'Error al obtener la papelera', details: error.message });
    }
};

const restaurarPoliza = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Restaurar póliza (poner deletedAt en null)
        const poliza = await Poliza.findOneAndUpdate(
            { _id: id, empresaId, deletedAt: { $ne: null } },
            { deletedAt: null },
            { new: true }
        );
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada en papelera o no pertenece a tu empresa' });
        }
        
        res.json({ message: 'Póliza restaurada correctamente', poliza });
    } catch (error) {
        console.error('Error al restaurar póliza:', error);
        res.status(500).json({ error: 'Error al restaurar la póliza', details: error.message });
    }
};

const eliminarDefinitivamente = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Eliminar definitivamente (delete real)
        const poliza = await Poliza.findOneAndDelete({ 
            _id: id, 
            empresaId, 
            deletedAt: { $ne: null } 
        });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada en papelera o no pertenece a tu empresa' });
        }
        
        res.json({ message: 'Póliza eliminada definitivamente' });
    } catch (error) {
        console.error('Error al eliminar definitivamente:', error);
        res.status(500).json({ error: 'Error al eliminar definitivamente', details: error.message });
    }
};

// FASE 3: GESTIÓN DE PAGOS
const registrarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, metodoPago, fechaPago } = req.body;
        const empresaId = req.user.empresaId;
        
        // Buscar póliza
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }
        
        // Crear nuevo pago con fecha manual o actual
        const nuevoPago = {
            fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
            monto: parseFloat(monto),
            estado: 'pagado',
            metodoPago: metodoPago || 'efectivo'
        };
        
        // Agregar pago al array
        poliza.pagos.push(nuevoPago);
        
        // Lógica matemática de saldo: Inicializar saldoRestante si es la primera vez
        if (!poliza.saldoRestante || poliza.saldoRestante === 0) {
            poliza.saldoRestante = poliza.primaTotal;
        }
        
        // Restar el monto del pago al saldoRestante
        poliza.saldoRestante -= parseFloat(monto);
        
        // Si saldoRestante <= 0, cambiar estadoPago a 'pagado_completo'
        if (poliza.saldoRestante <= 0) {
            poliza.estadoPago = 'pagado_completo';
            poliza.saldoRestante = 0; // Asegurar que no sea negativo
        } else {
            poliza.estadoPago = 'al_corriente';
        }
        
        // Calcular próximo pago según tipoPago (desde inicio si aún no hay próximo pago)
        const fechaBase = poliza.proximoPago
            || (poliza.fechas?.inicio ? new Date(poliza.fechas.inicio) : new Date());
        let proximoPago = calcularProximoPago(fechaBase, poliza.tipoPago);

        if (poliza.fechas?.vencimiento && proximoPago > poliza.fechas.vencimiento) {
            proximoPago = poliza.fechas.vencimiento;
        }

        poliza.proximoPago = proximoPago;

        // Resetear enlacePago si es pago fraccionado (mensual, trimestral, semestral)
        if (poliza.tipoPago === 'mensual' || poliza.tipoPago === 'trimestral' || poliza.tipoPago === 'semestral') {
            poliza.enlacePago = null;
        }

        await poliza.save();
        res.json({
            message: 'Pago registrado correctamente',
            poliza,
            nuevoProximoPago: proximoPago
        });
    } catch (error) {
        console.error('[registrarPago] Error detallado:', error);
        console.error('[registrarPago] Stack trace:', error.stack);
        res.status(500).json({ error: 'Error al registrar pago', details: error.message });
    }
};

// FASE 5: NOTIFICACIONES MANUALES
const enviarRecordatorioManual = async (req, res) => {
    try {
        const { id } = req.params;
        const { canal, tipo } = req.body;
        const empresaId = req.user.empresaId;

        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        if (!poliza) return res.status(404).json({ error: 'Póliza no encontrada' });

        // PRIORIDAD: Usar datos del modelo Cliente si existe clienteId, fallback a campos de póliza
        let destinatario;
        if (poliza.clienteId) {
            const Cliente = require('../models/Cliente');
            const cliente = await Cliente.findById(poliza.clienteId);
            if (cliente) {
                destinatario = canal === 'email'
                    ? (cliente.email || poliza.clienteEmail || 'prueba_correo@ejemplo.com')
                    : (cliente.telefono || poliza.clienteTelefono || '5512345678');
            } else {
                destinatario = canal === 'email'
                    ? (poliza.clienteEmail || 'prueba_correo@ejemplo.com')
                    : (poliza.clienteTelefono || '5512345678');
            }
        } else {
            destinatario = canal === 'email'
                ? (poliza.clienteEmail || 'prueba_correo@ejemplo.com')
                : (poliza.clienteTelefono || '5512345678');
        }

        let mensaje = tipo === 'vencimiento_poliza'
            ? `Hola ${poliza.cliente}, tu póliza No. ${poliza.numeroPoliza} vencerá el ${poliza.fechas?.vencimiento ? new Date(poliza.fechas.vencimiento).toLocaleDateString() : 'N/A'}.`
            : `Hola ${poliza.cliente}, tienes un pago pendiente en tu póliza No. ${poliza.numeroPoliza} por $${poliza.primaTotal || 0}.`;

        const { enviarEmail, enviarWhatsApp } = require('../services/notificationService');
        const Notificacion = require('../models/Notificacion');

        const logNotificacion = new Notificacion({ empresaId, polizaId: poliza._id, tipo, canal, destinatario, mensaje });

        if (canal === 'email') {
            await enviarEmail({ empresaId, destinatario, asunto: 'Recordatorio de Seguro', cuerpo: `<p>${mensaje}</p>` });
        } else if (canal === 'whatsapp') {
            await enviarWhatsApp({ empresaId, destinatario, mensaje });
        }

        logNotificacion.estado = 'enviada';
        logNotificacion.fechaEnvio = new Date();
        await logNotificacion.save();

        res.json({ success: true, message: `Enviado por ${canal}` });
    } catch (e) {
        res.status(500).json({ error: 'Error al enviar', details: e.message });
    }
};

// FASE 6: MÉTRICAS DEL DASHBOARD DE SEGUROS
const obtenerMetricasSeguros = async (req, res) => {
    try {
        const usuario = req.user || req.usuario || {};
        const empresaId = usuario.empresaId;
        const filtroTenant = req.tenantFilter ?? (empresaId ? { empresaId } : null);
        if (!filtroTenant) {
            return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa del usuario.' });
        }

        const filtroBase = {
            ...filtroTenant,
            deletedAt: null,
            estado: { $nin: ['Cancelada', 'Renovada'] }
        };
        const esAdmin = usuario.role === 'admin' || usuario.isSuperAdmin;
        if (!esAdmin) {
            const asesorId = usuario._id || usuario.id;
            if (asesorId) filtroBase.asesorId = asesorId;
        }

        const polizas = await Poliza.find(filtroBase).lean();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
        const limiteVencimientos = new Date(hoy);
        limiteVencimientos.setDate(limiteVencimientos.getDate() + 30);

        const polizasFormateadas = polizas.map(p => {
            const poliza = p.toObject ? p.toObject() : p;
            if (poliza.estado === 'Renovada' || poliza.estado === 'Cancelada') return poliza;
            const estadoOriginal = poliza.estado;

            const vencimiento = poliza.fechas?.vencimiento ? new Date(poliza.fechas.vencimiento) : null;
            const diasGracia = Number(poliza.diasGracia ?? 30);
            const fechaLimite = poliza.fechaLimiteRenovacion
                ? new Date(poliza.fechaLimiteRenovacion)
                : vencimiento && new Date(vencimiento.getTime() + diasGracia * 86400000);

            if (vencimiento && poliza.estado !== 'Cancelada' && poliza.estado !== 'Renovada') {
                if (hoy > vencimiento && fechaLimite && hoy <= fechaLimite) {
                    poliza.estado = 'PendienteRenovacion';
                } else if (fechaLimite && hoy > fechaLimite) {
                    poliza.estado = 'Vencida';
                }
            }

            const fechaPago = poliza.proximoPago ? new Date(poliza.proximoPago) : null;
            if (estadoOriginal === 'Activa' && fechaPago && !Number.isNaN(fechaPago.getTime())
                && fechaPago < hoy && poliza.estadoPago !== 'pagado_completo') {
                poliza.estado = 'Vencida';
                poliza.tipoUrgencia = 'pago_vencido';
                poliza.fechaUrgencia = fechaPago;
            }

            if (fechaLimite) poliza.fechaLimiteRenovacion = fechaLimite;
            return poliza;
        });

        const activas = polizasFormateadas.filter(p => p.estado === 'Activa').length;
        const pendientesRenovacionPolizas = polizasFormateadas.filter(p => p.estado === 'PendienteRenovacion');
        const renovacionesUrgentes = pendientesRenovacionPolizas
            .sort((a, b) => new Date(a.fechaLimiteRenovacion) - new Date(b.fechaLimiteRenovacion))
            .slice(0, 10);
        const urgencias = [
            ...renovacionesUrgentes.map(poliza => ({ ...poliza, tipoUrgencia: 'renovacion' })),
            ...polizasFormateadas.filter(poliza => poliza.tipoUrgencia === 'pago_vencido')
        ]
            .sort((a, b) => new Date(a.fechaUrgencia || a.fechaLimiteRenovacion) - new Date(b.fechaUrgencia || b.fechaLimiteRenovacion))
            .slice(0, 10);
        const porVencer = polizasFormateadas.filter(p => {
            const vencimiento = p.fechas?.vencimiento ? new Date(p.fechas.vencimiento) : null;
            return p.estado !== 'Cancelada' && vencimiento && vencimiento >= hoy && vencimiento <= limiteVencimientos;
        }).length;
        const pagosPendientes = polizasFormateadas.filter(p =>
            p.estado !== 'Cancelada' && p.estadoPago !== 'pagado_completo' && p.proximoPago && new Date(p.proximoPago) < hoy
        ).length;

        let totalRecaudado = 0;
        polizasFormateadas.forEach(p => {
            totalRecaudado += (p.pagos || []).reduce((total, pago) =>
                total + (pago.estado === 'pagado' ? Number(pago.monto) || 0 : 0), 0);
        });

        let proyeccionCobranza = 0;
        const mesActual = new Date().getMonth();
        const añoActual = new Date().getFullYear();

        polizas.forEach(poliza => {
            if (poliza.estado === 'Cancelada' || poliza.estado === 'Renovada') return;

            if (poliza.recibos && poliza.recibos.length > 0) {
                poliza.recibos.forEach(recibo => {
                    const estadoR = (recibo.estadoRecibo || recibo.estado || '').toLowerCase();

                    if (estadoR === 'pendiente') {
                        const fechaR = new Date(recibo.fechaVencimientoRecibo || recibo.fechaVencimiento);
                        if (fechaR.getMonth() === mesActual && fechaR.getFullYear() === añoActual) {
                            proyeccionCobranza += parseFloat(
                                recibo.montoRecibo || poliza.montoAbono || (poliza.primaTotal / 12) || 0
                            );
                        }
                    }
                });
            } else if (poliza.proximoPago) {
                const fechaPago = new Date(poliza.proximoPago);
                if (fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === añoActual) {
                    proyeccionCobranza += parseFloat(
                        poliza.montoAbono || poliza.saldoRestante || poliza.primaTotal || 0
                    );
                }
            }
        });

        const metricas = {
            activas,
            pendientesRenovacion: pendientesRenovacionPolizas.length,
            porVencer,
            pagosPendientes,
            totalRecaudado,
            proyeccionCobranza,
            proyeccionCobranzaMes: proyeccionCobranza,
            renovacionesUrgentes
        };

        const filtro = req.query.filtroTiempo || 'mensual';
        const fechaActual = new Date();
        const currentYear = fechaActual.getFullYear();
        const currentMonth = fechaActual.getMonth();
        const labels = filtro === 'semanal'
            ? ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5']
            : filtro === 'diario'
                ? Array.from({ length: 31 }, (_, index) => String(index + 1))
                : ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const cobrado = Array(labels.length).fill(0);
        const pendiente = Array(labels.length).fill(0);
        const polizasMes = Array(labels.length).fill(0);
        const numeroPagosPorTipo = { mensual: 12, trimestral: 4, semestral: 2, anual: 1 };
        const obtenerIndicePeriodo = fecha => {
            if (!fecha || Number.isNaN(fecha.getTime())) return -1;
            if (filtro === 'mensual') {
                return fecha.getFullYear() === currentYear ? fecha.getMonth() : -1;
            }
            if (fecha.getFullYear() !== currentYear || fecha.getMonth() !== currentMonth) return -1;
            if (filtro === 'semanal') return Math.min(Math.ceil(fecha.getDate() / 7) - 1, 4);
            if (filtro === 'diario') return fecha.getDate() - 1;
            return -1;
        };

        polizas.forEach(poliza => {
            if (poliza.estado === 'Cancelada') return;

            const fechaInicio = poliza.fechas?.inicio ? new Date(poliza.fechas.inicio) : null;
            const indiceInicio = obtenerIndicePeriodo(fechaInicio);
            if (indiceInicio >= 0) polizasMes[indiceInicio] += 1;

            const recibos = poliza.recibos || [];
            if (recibos.length > 0) {
                recibos.forEach((recibo, index) => {
                    const estadoRecibo = String(recibo.estadoRecibo || recibo.estado || '').toLowerCase();
                    if (estadoRecibo !== 'pagado' && estadoRecibo !== 'pendiente') return;

                    const fechaRecibo = recibo.fechaVencimientoRecibo || recibo.fechaVencimiento;
                    const fechaVencimiento = fechaRecibo ? new Date(fechaRecibo) : null;
                    const indicePeriodo = obtenerIndicePeriodo(fechaVencimiento);
                    if (indicePeriodo < 0) return;

                    const numeroPagos = numeroPagosPorTipo[poliza.tipoPago] || 1;
                    const importeConfigurado = index === 0
                        ? Number(poliza.primerPago) || 0
                        : Number(poliza.montoAbono) || 0;
                    const importeAlternativo = importeConfigurado || (Number(poliza.primaTotal) || 0) / numeroPagos;
                    const importeRecibo = Number(recibo.montoRecibo);
                    const monto = Number.isFinite(importeRecibo) && importeRecibo > 0
                        ? importeRecibo
                        : importeAlternativo;
                    if (estadoRecibo === 'pagado') cobrado[indicePeriodo] += monto;
                    if (estadoRecibo === 'pendiente') pendiente[indicePeriodo] += monto;
                });
                return;
            }

            (poliza.pagos || []).forEach(pago => {
                if (String(pago.estado || '').toLowerCase() !== 'pagado' || !pago.fechaPago) return;
                const fechaPago = new Date(pago.fechaPago);
                const indicePeriodo = obtenerIndicePeriodo(fechaPago);
                if (indicePeriodo >= 0) cobrado[indicePeriodo] += Number(pago.monto) || 0;
            });

            if (poliza.proximoPago) {
                const fechaPagoPendiente = new Date(poliza.proximoPago);
                const indicePeriodo = obtenerIndicePeriodo(fechaPagoPendiente);
                if (indicePeriodo >= 0) {
                    const numeroPagos = numeroPagosPorTipo[poliza.tipoPago] || 1;
                    pendiente[indicePeriodo] += Number(poliza.montoAbono)
                        || Number(poliza.saldoRestante)
                        || (Number(poliza.primaTotal) || 0) / numeroPagos;
                }
            }
        });

        const graficas = { labels, cobrado, pendiente, polizasMes };

        res.json({
            success: true,
            proyeccionCobranza,
            metricas,
            graficas,
            detalles: { renovacionesUrgentes, urgencias }
        });
    } catch (error) {
        console.error('[RESCUE ERROR DASHBOARD]:', error);
        res.status(500).json({ error: 'Error al obtener métricas', details: error.message });
    }
};

// ENDPOINT: Migración de fechas para el calendario (Temporal)
const migrarFechasAgenda = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;

        // Verificar que el usuario sea admin
        if (userRole !== 'admin') {
            return res.status(403).json({ 
                error: 'Acceso denegado. Solo administradores pueden ejecutar esta migración.' 
            });
        }

        // Buscar todas las pólizas de la empresa
        const polizas = await Poliza.find({ empresaId, deletedAt: null });
        
        let polizasActualizadas = 0;

        for (const poliza of polizas) {
            let actualizada = false;

            // Convertir fechas.vencimiento si es string
            if (poliza.fechas && poliza.fechas.vencimiento) {
                if (typeof poliza.fechas.vencimiento === 'string') {
                    const fechaVencimiento = new Date(poliza.fechas.vencimiento);
                    if (!isNaN(fechaVencimiento.getTime())) {
                        poliza.fechas.vencimiento = fechaVencimiento;
                        actualizada = true;
                    }
                }
            }

            // Convertir proximoPago si es string
            if (poliza.proximoPago) {
                if (typeof poliza.proximoPago === 'string') {
                    const proximoPago = new Date(poliza.proximoPago);
                    if (!isNaN(proximoPago.getTime())) {
                        poliza.proximoPago = proximoPago;
                        actualizada = true;
                    }
                }
            }

            // Si proximoPago no existe pero hay tipoPago, establecer fecha por defecto
            if (!poliza.proximoPago && poliza.tipoPago) {
                const fechaInicio = poliza.fechas?.inicio ? new Date(poliza.fechas.inicio) : new Date();
                if (!isNaN(fechaInicio.getTime())) {
                    const proximoPago = new Date(fechaInicio);
                    
                    // Calcular próximo pago según tipoPago
                    switch (poliza.tipoPago) {
                        case 'mensual':
                            proximoPago.setMonth(proximoPago.getMonth() + 1);
                            break;
                        case 'trimestral':
                            proximoPago.setMonth(proximoPago.getMonth() + 3);
                            break;
                        case 'anual':
                        default:
                            proximoPago.setFullYear(proximoPago.getFullYear() + 1);
                            break;
                    }
                    
                    poliza.proximoPago = proximoPago;
                    actualizada = true;
                }
            }

            // Guardar si hubo cambios
            if (actualizada) {
                await poliza.save();
                polizasActualizadas++;
            }
        }

        res.json({
            success: true,
            message: `Migración completada. ${polizasActualizadas} pólizas actualizadas de ${polizas.length} totales.`,
            polizasActualizadas,
            polizasTotales: polizas.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al ejecutar migración de fechas', details: error.message });
    }
};

// ENDPOINT: Obtener eventos de pólizas para el calendario (Módulo de Seguros)
const obtenerEventosAgenda = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;

        // Construir filtro base con RBAC
        let filtroBase = { empresaId, deletedAt: null };
        
        // RBAC: Si el usuario no es admin, filtrar por asesorId
        if (userRole !== 'admin') {
            filtroBase.asesorId = userId;
        }

        // Buscar todas las pólizas activas
        const polizas = await Poliza.find(filtroBase).lean();

        const eventos = [];

        polizas.forEach(poliza => {
            // Evento de Vencimiento
            if (poliza.fechas && poliza.fechas.vencimiento) {
                const fechaVencimiento = new Date(poliza.fechas.vencimiento);
                eventos.push({
                    id: `vencimiento-${poliza._id}`,
                    title: `VENCE: ${poliza.cliente || 'N/A'}`,
                    start: fechaVencimiento.toISOString().split('T')[0],
                    backgroundColor: '#dc3545',
                    borderColor: '#dc3545',
                    allDay: true,
                    extendedProps: {
                        tipo: 'vencimiento',
                        polizaId: poliza._id,
                        cliente: poliza.cliente,
                        aseguradora: poliza.aseguradora
                    }
                });
            }

            // Eventos de Pagos Recurrentes
            if (poliza.proximoPago && poliza.tipoPago) {
                const fechaVencimiento = poliza.fechas && poliza.fechas.vencimiento ? new Date(poliza.fechas.vencimiento) : null;
                const fechaLimite = fechaVencimiento ? new Date(fechaVencimiento) : new Date();
                
                // Si no hay vencimiento, proyectar máximo 12 meses al futuro
                if (!fechaVencimiento) {
                    fechaLimite.setMonth(fechaLimite.getMonth() + 12);
                }

                let fechaIterada = new Date(poliza.proximoPago);
                let index = 0;

                // Determinar incremento según tipo de pago
                let mesesIncremento = 12; // anual por defecto
                if (poliza.tipoPago === 'mensual') {
                    mesesIncremento = 1;
                } else if (poliza.tipoPago === 'trimestral') {
                    mesesIncremento = 3;
                }

                // Calcular monto fraccionado como fallback
                let montoFraccionado = poliza.primaTotal || 0;
                if (poliza.tipoPago === 'mensual') {
                    montoFraccionado = montoFraccionado / 12;
                } else if (poliza.tipoPago === 'trimestral') {
                    montoFraccionado = montoFraccionado / 4;
                }

                // Bucle para generar pagos recurrentes
                // Condición ESTRICTAMENTE MENOR (<) para no generar pago en fecha de vencimiento
                while (fechaIterada < fechaLimite && index < 100) { // Límite de seguridad: 100 iteraciones
                    // Determinar monto del pago según si es el primer pago o subsecuente
                    let montoPago = montoFraccionado; // fallback por defecto
                    
                    if (index === 0) {
                        // Primer pago: usar campo primerPago si existe y es mayor a 0
                        if (poliza.primerPago && poliza.primerPago > 0) {
                            montoPago = poliza.primerPago;
                        }
                    } else {
                        // Pagos subsecuentes: usar campo montoAbono si existe y es mayor a 0
                        if (poliza.montoAbono && poliza.montoAbono > 0) {
                            montoPago = poliza.montoAbono;
                        }
                    }

                    eventos.push({
                        id: `pago-${poliza._id}_${index}`,
                        title: `COBRO: ${poliza.cliente || 'N/A'}`,
                        start: fechaIterada.toISOString().split('T')[0],
                        backgroundColor: '#ffc107',
                        borderColor: '#ffc107',
                        textColor: '#000',
                        allDay: true,
                        extendedProps: {
                            tipo: 'pago',
                            polizaId: poliza._id,
                            cliente: poliza.cliente,
                            montoPago: montoPago,
                            tipoPago: poliza.tipoPago
                        }
                    });

                    // Incrementar fecha según tipo de pago
                    fechaIterada.setMonth(fechaIterada.getMonth() + mesesIncremento);
                    index++;
                }
            }
        });

        res.json({
            success: true,
            eventos
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener eventos de agenda', details: error.message });
    }
};

// ENDPOINT: Renovar pago (actualizar fechaProximoPago al siguiente ciclo)
const renovarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Buscar póliza
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }
        
        // Calcular monto del pago según tipoPago
        let montoPago = poliza.primaTotal || 0;
        switch (poliza.tipoPago) {
            case 'mensual':
                montoPago = montoPago / 12;
                break;
            case 'trimestral':
                montoPago = montoPago / 4;
                break;
            case 'semestral':
                montoPago = montoPago / 2;
                break;
            case 'anual':
            default:
                montoPago = montoPago;
                break;
        }
        
        // Crear registro de pago en el historial
        const nuevoPago = {
            fechaPago: new Date(),
            monto: montoPago,
            estado: 'pagado',
            metodoPago: 'pago_rapido'
        };
        
        // Agregar pago al array
        if (!poliza.pagos) {
            poliza.pagos = [];
        }
        poliza.pagos.push(nuevoPago);
        
        // Calcular nuevo próximo pago basado en la fecha actual o el próximo pago existente
        const fechaBase = poliza.proximoPago || new Date();
        const nuevoProximoPago = calcularProximoPago(fechaBase, poliza.tipoPago);
        
        // Actualizar póliza
        poliza.proximoPago = nuevoProximoPago;
        await poliza.save();
        
        res.json({ 
            success: true, 
            message: 'Próximo pago renovado correctamente', 
            poliza,
            nuevoProximoPago: nuevoProximoPago,
            pagoRegistrado: nuevoPago
        });
    } catch (error) {
        console.error('[renovarPago] Error:', error);
        res.status(500).json({ error: 'Error al renovar pago', details: error.message });
    }
};

// ENDPOINT: Eliminar pago específico del historial
const eliminarPago = async (req, res) => {
    try {
        const { id, pagoIndex } = req.params;
        const empresaId = req.user.empresaId;
        
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }
        
        const indicePago = Number(pagoIndex);
        if (!poliza.pagos || !Number.isInteger(indicePago) || indicePago < 0 || indicePago >= poliza.pagos.length) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        
        const pagoABorrar = poliza.pagos[indicePago];
        const montoRevertir = Number(pagoABorrar?.monto) || 0;
        poliza.saldoRestante = (Number(poliza.saldoRestante) || 0) + montoRevertir;

        if (poliza.recibos?.length) {
            const recibosPagados = poliza.recibos.filter(recibo =>
                recibo.estadoRecibo?.toLowerCase() === 'pagado' || recibo.estado?.toLowerCase() === 'pagado'
            );
            const ultimoPagado = recibosPagados[recibosPagados.length - 1];
            if (ultimoPagado) {
                if (ultimoPagado.estadoRecibo) ultimoPagado.estadoRecibo = 'pendiente';
                if (ultimoPagado.estado) ultimoPagado.estado = 'pendiente';
                poliza.proximoPago = ultimoPagado.fechaVencimientoRecibo || ultimoPagado.fechaVencimiento;
            }
            poliza.estadoPago = 'pendiente';
        } else {
            if (poliza.proximoPago) {
                const proximoPago = new Date(poliza.proximoPago);
                proximoPago.setMonth(proximoPago.getMonth() - 1);
                poliza.proximoPago = proximoPago;
            }
            poliza.estado = 'PendienteRenovacion';
            poliza.estadoPago = 'pendiente';
        }

        poliza.pagos.splice(indicePago, 1);
        await poliza.save();
        
        res.json({ success: true, message: 'Pago eliminado correctamente' });
    } catch (error) {
        console.error('[eliminarPago] Error:', error);
        res.status(500).json({ error: 'Error al eliminar pago', details: error.message });
    }
};

// ENDPOINT: Actualizar fecha de próximo pago
const actualizarProximoPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { proximoPago } = req.body;
        const empresaId = req.user.empresaId;
        
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }
        
        poliza.proximoPago = new Date(proximoPago);
        await poliza.save();
        
        res.json({ success: true, message: 'Próximo pago actualizado correctamente', poliza });
    } catch (error) {
        console.error('[actualizarProximoPago] Error:', error);
        res.status(500).json({ error: 'Error al actualizar próximo pago', details: error.message });
    }
};

// ENDPOINT: Enviar recordatorio por correo
const enviarRecordatorioCorreo = async (req, res) => {
    try {
        const { polizaId, destinatario, asunto, mensaje } = req.body;
        const empresaId = req.user.empresaId;
        
        const poliza = await Poliza.findOne({ _id: polizaId, empresaId, deletedAt: null });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }
        
        // Calcular destinatario automáticamente si está vacío (para Cobranza Diaria)
        let destinatarioFinal = destinatario;
        if (!destinatario || destinatario.trim() === '') {
            console.log('[enviarRecordatorioCorreo] Destinatario vacío, calculando desde póliza...');
            
            // PRIORIDAD: Usar correo del modelo Cliente si existe clienteId
            if (poliza.clienteId) {
                const Cliente = require('../models/Cliente');
                const cliente = await Cliente.findById(poliza.clienteId);
                if (cliente && cliente.email) {
                    destinatarioFinal = cliente.email;
                    console.log('[enviarRecordatorioCorreo] Email desde modelo Cliente:', destinatarioFinal);
                }
            }
            
            // Fallback a campos legacy de póliza
            if (!destinatarioFinal) {
                destinatarioFinal = poliza.clienteEmail || '';
                console.log('[enviarRecordatorioCorreo] Email desde póliza.clienteEmail:', destinatarioFinal);
            }
            
            // Fallback final a email de prueba
            if (!destinatarioFinal) {
                destinatarioFinal = 'correoprueba@ejemplo.com';
                console.log('[enviarRecordatorioCorreo] Usando email de prueba:', destinatarioFinal);
            }
        }
        
        console.log('[enviarRecordatorioCorreo] Destinatario final:', destinatarioFinal);
        
        // Calcular monto a pagar según la lógica existente
        let montoPago = 0;
        if (poliza.primerPago && poliza.primerPago > 0) {
            montoPago = poliza.primerPago;
        } else if (poliza.montoAbono && poliza.montoAbono > 0) {
            montoPago = poliza.montoAbono;
        } else {
            const primaTotal = poliza.primaTotal || 0;
            switch (poliza.tipoPago) {
                case 'mensual':
                    montoPago = primaTotal / 12;
                    break;
                case 'trimestral':
                    montoPago = primaTotal / 4;
                    break;
                case 'semestral':
                    montoPago = primaTotal / 2;
                    break;
                case 'anual':
                default:
                    montoPago = primaTotal;
                    break;
            }
        }
        
        // Formatear monto
        const montoFormateado = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(montoPago);
        
        // Formatear fecha de vencimiento
        const fechaVencimiento = poliza.fechas?.vencimiento 
            ? new Date(poliza.fechas.vencimiento).toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            })
            : 'N/A';
        
        // Plantilla HTML profesional
        const htmlPlantilla = `
<div style="font-family: Arial, sans-serif; color: #333333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #003366; padding: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Recordatorio de Vencimiento</h2>
    </div>
    <div style="padding: 30px 20px;">
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Estimado/a <strong>${poliza.cliente}</strong>,
        </p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Esperamos que se encuentre muy bien. Nos comunicamos de parte de su equipo de asesores para recordarle amablemente que su póliza de seguro está próxima a vencer.
        </p>
        <div style="background-color: #f9f9f9; border-left: 4px solid #003366; padding: 15px; margin-bottom: 25px;">
            <h3 style="margin-top: 0; color: #003366; font-size: 18px;">Detalles de la Póliza</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; font-weight: bold; width: 40%;">Aseguradora:</td>
                    <td style="padding: 8px 0;">${poliza.aseguradora || 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Ramo / Tipo:</td>
                    <td style="padding: 8px 0;">${poliza.tipoSeguro || 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">No. de Póliza:</td>
                    <td style="padding: 8px 0;">${poliza.numeroPoliza || 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Fecha de Vencimiento:</td>
                    <td style="padding: 8px 0; color: #d9534f; font-weight: bold;">${fechaVencimiento}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; font-weight: bold;">Monto a Pagar:</td>
                    <td style="padding: 8px 0; font-size: 18px; color: #28a745; font-weight: bold;">${montoFormateado}</td>
                </tr>
            </table>
        </div>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Para mantener su cobertura activa y evitar recargos, le invitamos a realizar el pago correspondiente antes de la fecha señalada. Si usted ya realizó este pago, por favor haga caso omiso a este mensaje.
        </p>
        ${poliza.enlacePago ? `
        <div style="background-color: #e8f5e9; border-left: 4px solid #28a745; padding: 15px; margin-bottom: 25px;">
            <h3 style="margin-top: 0; color: #28a745; font-size: 18px;">💳 Enlace de Pago</h3>
            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 10px;">
                Puede realizar su pago de forma segura a través del siguiente enlace:
            </p>
            <p style="font-size: 16px; line-height: 1.5; margin: 0;">
                <a href="${poliza.enlacePago}" style="color: #003366; font-weight: bold; text-decoration: underline;">${poliza.enlacePago}</a>
            </p>
        </div>
        ` : ''}
    </div>
    <div style="background-color: #f1f1f1; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #333333;">EME Asesores</p>
        <p style="margin: 5px 0 0; font-size: 12px; color: #777777;">
            Protegiendo su tranquilidad y patrimonio.
        </p>
    </div>
</div>
`;
        
        const { enviarEmail } = require('../services/notificationService');
        const Notificacion = require('../models/Notificacion');
        
        await enviarEmail({ 
            empresaId, 
            destinatario: destinatarioFinal, 
            asunto: asunto || 'Recordatorio de Vencimiento - Póliza', 
            cuerpo: htmlPlantilla 
        });
        
        // Guardar en historial de notificaciones de la póliza
        const diasRestantes = poliza.fechas?.vencimiento 
            ? Math.ceil((new Date(poliza.fechas.vencimiento) - new Date()) / (1000 * 60 * 60 * 24))
            : 0;
        
        poliza.historialNotificaciones.push({
            fecha: new Date(),
            tipo: 'recordatorio_manual',
            canal: 'email',
            mensaje: htmlPlantilla,
            estado: 'enviada',
            diasRestantes: diasRestantes,
            enviadoManualmente: true
        });
        
        // Limitar historial a 50 registros más recientes
        if (poliza.historialNotificaciones.length > 50) {
            poliza.historialNotificaciones = poliza.historialNotificaciones.slice(-50);
        }
        
        await poliza.save();
        
        // Guardar log de notificación en modelo Notificación
        const logNotificacion = new Notificacion({ 
            empresaId, 
            polizaId: poliza._id, 
            tipo: 'recordatorio_pago', 
            canal: 'email', 
            destinatario: destinatarioFinal, 
            mensaje: htmlPlantilla 
        });
        logNotificacion.estado = 'enviada';
        logNotificacion.fechaEnvio = new Date();
        await logNotificacion.save();
        
        res.json({ success: true, message: 'Recordatorio enviado correctamente' });
    } catch (error) {
        console.error('[enviarRecordatorioCorreo] Error:', error);
        res.status(500).json({ error: 'Error al enviar recordatorio', details: error.message });
    }
};

// ENDPOINT: Cobranza Diaria - Pólizas que requieren gestión hoy
const COBRANZA_TZ = 'America/Mexico_City';

const obtenerCobranzaDiaria = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;

        const hoyString = new Intl.DateTimeFormat('en-CA', { timeZone: COBRANZA_TZ }).format(new Date());
        const hoyInicio = { $dateFromString: { dateString: hoyString, timezone: COBRANZA_TZ } };

        const matchInicial = {
            empresaId: new mongoose.Types.ObjectId(empresaId),
            estado: { $nin: ['Cancelada', 'Renovada'] },
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
        };
        if (userRole !== 'admin') {
            matchInicial.asesorId = new mongoose.Types.ObjectId(userId);
        }

        const pipeline = [
            { $match: matchInicial },
            {
                $addFields: {
                    _fechaVencimiento: {
                        $cond: {
                            if: { $ne: [{ $ifNull: ['$fechas.vencimiento', null] }, null] },
                            then: { $toDate: '$fechas.vencimiento' },
                            else: null
                        }
                    },
                    _fechaProximoPago: {
                        $cond: {
                            if: { $ne: [{ $ifNull: ['$proximoPago', null] }, null] },
                            then: { $toDate: '$proximoPago' },
                            else: null
                        }
                    }
                }
            },
            {
                $addFields: {
                    diasRestantesVencimiento: {
                        $cond: {
                            if: { $ne: ['$_fechaVencimiento', null] },
                            then: {
                                $dateDiff: {
                                    startDate: hoyInicio,
                                    endDate: '$_fechaVencimiento',
                                    unit: 'day',
                                    timezone: COBRANZA_TZ
                                }
                            },
                            else: null
                        }
                    },
                    diasRestantesPago: {
                        $cond: {
                            if: { $ne: ['$_fechaProximoPago', null] },
                            then: {
                                $dateDiff: {
                                    startDate: hoyInicio,
                                    endDate: '$_fechaProximoPago',
                                    unit: 'day',
                                    timezone: COBRANZA_TZ
                                }
                            },
                            else: null
                        }
                    }
                }
            },
            {
                $addFields: {
                    diasRestantes: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $ne: ['$diasRestantesVencimiento', null] },
                                            { $ne: ['$diasRestantesPago', null] }
                                        ]
                                    },
                                    then: { $min: ['$diasRestantesVencimiento', '$diasRestantesPago'] }
                                },
                                {
                                    case: { $ne: ['$diasRestantesVencimiento', null] },
                                    then: '$diasRestantesVencimiento'
                                },
                                {
                                    case: { $ne: ['$diasRestantesPago', null] },
                                    then: '$diasRestantesPago'
                                }
                            ],
                            default: null
                        }
                    },
                    tipoGestion: {
                        $cond: {
                            if: {
                                $and: [
                                    { $ne: ['$diasRestantesVencimiento', null] },
                                    {
                                        $or: [
                                            { $eq: ['$diasRestantesPago', null] },
                                            { $lte: ['$diasRestantesVencimiento', '$diasRestantesPago'] }
                                        ]
                                    }
                                ]
                            },
                            then: 'vencimiento_poliza',
                            else: 'pago_pendiente'
                        }
                    },
                    montoCalculado: {
                        $cond: {
                            if: {
                                $gt: [
                                    { $size: { $ifNull: ['$pagos', []] } },
                                    0
                                ]
                            },
                            then: {
                                $cond: {
                                    if: { $and: [{ $gt: ['$montoAbono', 0] }, { $ne: ['$montoAbono', null] }] },
                                    then: '$montoAbono',
                                    else: '$primaTotal'
                                }
                            },
                            else: {
                                $cond: {
                                    if: { $and: [{ $gt: ['$primerPago', 0] }, { $ne: ['$primerPago', null] }] },
                                    then: '$primerPago',
                                    else: {
                                        $cond: {
                                            if: { $and: [{ $gt: ['$montoAbono', 0] }, { $ne: ['$montoAbono', null] }] },
                                            then: '$montoAbono',
                                            else: {
                                                $cond: {
                                                    if: { $eq: ['$tipoPago', 'mensual'] },
                                                    then: { $divide: ['$primaTotal', 12] },
                                                    else: {
                                                        $cond: {
                                                            if: { $eq: ['$tipoPago', 'trimestral'] },
                                                            then: { $divide: ['$primaTotal', 4] },
                                                            else: '$primaTotal'
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            { $match: { diasRestantes: { $ne: null, $lte: 7 } } },
            {
                $facet: {
                    vencidas: [
                        { $match: { diasRestantes: { $lt: 0 } } },
                        { $sort: { diasRestantes: 1 } },
                        { $limit: 100 },
                        {
                            $project: {
                                _id: 1,
                                numeroPoliza: 1,
                                cliente: 1,
                                clienteTelefono: 1,
                                clienteEmail: 1,
                                tipoSeguro: 1,
                                tipoPago: 1,
                                montoCalculado: 1,
                                vencimiento: '$_fechaVencimiento',
                                proximoPago: '$_fechaProximoPago',
                                estado: 1,
                                estadoPago: 1,
                                tipoGestion: 1,
                                diasRestantes: 1,
                                aseguradora: 1,
                                enlacePago: 1,
                                historialNotificaciones: 1
                            }
                        }
                    ],
                    cobrosHoy: [
                        { $match: { diasRestantes: 0 } },
                        { $sort: { diasRestantes: 1 } },
                        { $limit: 100 },
                        {
                            $project: {
                                _id: 1,
                                numeroPoliza: 1,
                                cliente: 1,
                                clienteTelefono: 1,
                                clienteEmail: 1,
                                tipoSeguro: 1,
                                tipoPago: 1,
                                montoCalculado: 1,
                                vencimiento: '$_fechaVencimiento',
                                proximoPago: '$_fechaProximoPago',
                                estado: 1,
                                estadoPago: 1,
                                tipoGestion: 1,
                                diasRestantes: 1,
                                aseguradora: 1,
                                enlacePago: 1,
                                historialNotificaciones: 1
                            }
                        }
                    ],
                    porVencer: [
                        { $match: { diasRestantes: { $gt: 0, $lte: 7 } } },
                        { $sort: { diasRestantes: 1 } },
                        { $limit: 100 },
                        {
                            $project: {
                                _id: 1,
                                numeroPoliza: 1,
                                cliente: 1,
                                clienteTelefono: 1,
                                clienteEmail: 1,
                                tipoSeguro: 1,
                                tipoPago: 1,
                                montoCalculado: 1,
                                vencimiento: '$_fechaVencimiento',
                                proximoPago: '$_fechaProximoPago',
                                estado: 1,
                                estadoPago: 1,
                                tipoGestion: 1,
                                diasRestantes: 1,
                                aseguradora: 1,
                                enlacePago: 1,
                                historialNotificaciones: 1
                            }
                        }
                    ]
                }
            }
        ];

        const resultado = await Poliza.aggregate(pipeline);
        console.log('[obtenerCobranzaDiaria] Raw facet counts:', {
            vencidas: resultado[0]?.vencidas?.length ?? 0,
            cobrosHoy: resultado[0]?.cobrosHoy?.length ?? 0,
            porVencer: resultado[0]?.porVencer?.length ?? 0
        });
        const datos = resultado[0] || { vencidas: [], cobrosHoy: [], porVencer: [] };

        const mapPolizaRespuesta = (poliza) => ({
            polizaId: poliza._id,
            numeroPoliza: poliza.numeroPoliza,
            cliente: poliza.cliente || 'Sin nombre',
            telefono: poliza.clienteTelefono || '',
            email: poliza.clienteEmail || '',
            tipoSeguro: poliza.tipoSeguro,
            tipoPago: poliza.tipoPago,
            montoPagar: poliza.montoCalculado || 0,
            vencimiento: poliza.vencimiento,
            proximoPago: poliza.proximoPago,
            estado: poliza.estado,
            estadoPago: poliza.estadoPago,
            tipoGestion: poliza.tipoGestion,
            diasRestantes: poliza.diasRestantes,
            aseguradora: poliza.aseguradora,
            enlacePago: poliza.enlacePago || null,
            historialNotificaciones: poliza.historialNotificaciones || []
        });

        const vencidas = (datos.vencidas || []).map(mapPolizaRespuesta);
        const cobrosHoy = (datos.cobrosHoy || []).map(mapPolizaRespuesta);
        const porVencer = (datos.porVencer || []).map(mapPolizaRespuesta);

        const resultados = {
            success: true,
            fecha: hoyString,
            vencidas,
            cobrosHoy,
            porVencer,
            totales: {
                vencidas: vencidas.length,
                cobrosHoy: cobrosHoy.length,
                porVencer: porVencer.length
            }
        };

        res.json(resultados);
    } catch (error) {
        console.error('[obtenerCobranzaDiaria] Error:', error);
        res.status(500).json({ error: 'Error al obtener cobranza diaria', details: error.message });
    }
};

// ENDPOINT: Marcar póliza como resuelta en Cobranza Diaria
const marcarCobranzaResuelta = async (req, res) => {
    try {
        const { polizaId } = req.params;
        const empresaId = req.user.empresaId;
        const { resuelta } = req.body;

        const poliza = await Poliza.findOneAndUpdate(
            { _id: polizaId, empresaId, deletedAt: null },
            { 
                cobranzaResuelta: resuelta,
                fechaResolucionCobranza: resuelta ? new Date() : null
            },
            { new: true }
        );

        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        res.json({
            success: true,
            message: resuelta ? 'Póliza marcada como resuelta' : 'Póliza reactivada en cobranza',
            poliza
        });
    } catch (error) {
        console.error('[marcarCobranzaResuelta] Error:', error);
        res.status(500).json({ error: 'Error al marcar póliza como resuelta', details: error.message });
    }
};

// ENDPOINT: Enviar correo manual desde Cobranza Diaria
const enviarCorreoCobranzaDiaria = async (req, res) => {
    try {
        const { polizaId } = req.params;
        const empresaId = req.user.empresaId;

        const poliza = await Poliza.findOne({ _id: polizaId, empresaId, deletedAt: null });
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        const { enviarEmail } = require('../services/notificationService');
        const Notificacion = require('../models/Notificacion');

        // Obtener destinatario (prioridad: clienteId, fallback a campos legacy)
        let destinatario = poliza.clienteEmail || 'correo_prueba@ejemplo.com';
        if (poliza.clienteId) {
            const Cliente = require('../models/Cliente');
            const cliente = await Cliente.findById(poliza.clienteId);
            if (cliente && cliente.email) {
                destinatario = cliente.email;
            }
        }

        // Generar mensaje dinámico profesional
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let asunto = '';
        let cuerpo = '';
        let tipo = '';
        let montoPagar = 0;
        
        // Calcular monto a pagar
        if (poliza.primerPago && poliza.primerPago > 0) {
            montoPagar = poliza.primerPago;
        } else if (poliza.montoAbono && poliza.montoAbono > 0) {
            montoPagar = poliza.montoAbono;
        } else if (poliza.tipoPago === 'mensual') {
            montoPagar = poliza.primaTotal / 12;
        } else if (poliza.tipoPago === 'trimestral') {
            montoPagar = poliza.primaTotal / 4;
        } else {
            montoPagar = poliza.primaTotal;
        }
        
        const montoFormateado = new Intl.NumberFormat('es-MX', { 
            style: 'currency', 
            currency: 'MXN' 
        }).format(montoPagar);
        
        if (poliza.fechas?.vencimiento) {
            const fVenc = new Date(poliza.fechas.vencimiento);
            fVenc.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((fVenc - hoy) / (1000 * 60 * 60 * 24));
            const fechaFormateada = fVenc.toLocaleDateString('es-MX', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            asunto = `Recordatorio de Pago de Póliza - EME Asesores`;
            
            let enlacePagoHTML = '';
            if (poliza.enlacePago) {
                enlacePagoHTML = `
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${poliza.enlacePago}" 
                           style="background-color: #007bff; color: white; padding: 12px 25px; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold; 
                                  display: inline-block;">
                            Realizar Pago Online
                        </a>
                    </div>
                `;
            }
            
            cuerpo = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #003366; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">EME Asesores</h1>
                        <p style="color: #cce5ff; margin: 5px 0 0 0;">Seguros y Servicios Financieros</p>
                    </div>
                    
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <h2 style="color: #333; margin-top: 0;">Recordatorio de Pago de Póliza</h2>
                        
                        <p>Estimado(a) <strong>${poliza.cliente}</strong>,</p>
                        
                        <p>Le recordamos que su póliza de seguro está próxima a vencer. A continuación presentamos los detalles:</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr style="background-color: #003366; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Concepto</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Detalle</th>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Número de Póliza:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.numeroPoliza}</td>
                            </tr>
                            <tr style="background-color: #f2f2f2;">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Tipo de Seguro:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.tipoSeguro}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Aseguradora:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.aseguradora || 'N/A'}</td>
                            </tr>
                            <tr style="background-color: #f2f2f2;">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Fecha Límite:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${fechaFormateada}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Monto a Pagar:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #28a745;">${montoFormateado}</td>
                            </tr>
                            <tr style="background-color: ${diasRestantes <= 3 ? '#ffeeee' : '#e6f7ff'};">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Días Restantes:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: ${diasRestantes <= 3 ? '#dc3545' : '#007bff'};">${diasRestantes} días</td>
                            </tr>
                        </table>
                        
                        ${enlacePagoHTML}
                        
                        <p style="font-size: 14px; color: #666; margin-top: 25px;">
                            <strong>Información de Contacto:</strong><br>
                            Teléfono: 55-1234-5678<br>
                            Email: contacto@emeasesores.com
                        </p>
                        
                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center; border-top: 1px solid #ddd; padding-top: 15px;">
                            Este correo es un recordatorio automático. Si ya realizó su pago, puede ignorar este mensaje.
                        </p>
                    </div>
                </div>
            `;
            
            tipo = 'vencimiento_poliza';
        } else if (poliza.proximoPago) {
            const fPago = new Date(poliza.proximoPago);
            fPago.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((fPago - hoy) / (1000 * 60 * 60 * 24));
            const fechaFormateada = fPago.toLocaleDateString('es-MX', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            
            asunto = `Recordatorio de Pago Pendiente - EME Asesores`;
            
            let enlacePagoHTML = '';
            if (poliza.enlacePago) {
                enlacePagoHTML = `
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${poliza.enlacePago}" 
                           style="background-color: #007bff; color: white; padding: 12px 25px; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold; 
                                  display: inline-block;">
                            Realizar Pago Online
                        </a>
                    </div>
                `;
            }
            
            cuerpo = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #003366; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">EME Asesores</h1>
                        <p style="color: #cce5ff; margin: 5px 0 0 0;">Seguros y Servicios Financieros</p>
                    </div>
                    
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <h2 style="color: #333; margin-top: 0;">Recordatorio de Pago Pendiente</h2>
                        
                        <p>Estimado(a) <strong>${poliza.cliente}</strong>,</p>
                        
                        <p>Le recordamos que tiene un pago pendiente por su póliza de seguro. A continuación presentamos los detalles:</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr style="background-color: #003366; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Concepto</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Detalle</th>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Número de Póliza:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.numeroPoliza}</td>
                            </tr>
                            <tr style="background-color: #f2f2f2;">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Tipo de Seguro:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.tipoSeguro}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Fecha Límite:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${fechaFormateada}</td>
                            </tr>
                            <tr style="background-color: #f2f2f2;">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Monto a Pagar:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #28a745;">${montoFormateado}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Días Restantes:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: ${diasRestantes <= 3 ? '#dc3545' : '#007bff'};">${diasRestantes} días</td>
                            </tr>
                        </table>
                        
                        ${enlacePagoHTML}
                        
                        <p style="font-size: 14px; color: #666; margin-top: 25px;">
                            <strong>Información de Contacto:</strong><br>
                            Teléfono: 55-1234-5678<br>
                            Email: contacto@emeasesores.com
                        </p>
                        
                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center; border-top: 1px solid #ddd; padding-top: 15px;">
                            Este correo es un recordatorio automático. Si ya realizó su pago, puede ignorar este mensaje.
                        </p>
                    </div>
                </div>
            `;
            
            tipo = 'pago_pendiente';
        } else {
            asunto = `Recordatorio de Póliza - EME Asesores`;
            cuerpo = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #003366; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">EME Asesores</h1>
                        <p style="color: #cce5ff; margin: 5px 0 0 0;">Seguros y Servicios Financieros</p>
                    </div>
                    
                    <div style="padding: 30px; background-color: #f8f9fa;">
                        <h2 style="color: #333; margin-top: 0;">Recordatorio de Póliza</h2>
                        
                        <p>Estimado(a) <strong>${poliza.cliente}</strong>,</p>
                        
                        <p>Le recordamos sobre su póliza de seguro con EME Asesores:</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr style="background-color: #003366; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Concepto</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #003366;">Detalle</th>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Número de Póliza:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.numeroPoliza}</td>
                            </tr>
                            <tr style="background-color: #f2f2f2;">
                                <td style="padding: 12px; border: 1px solid #ddd;"><strong>Tipo de Seguro:</strong></td>
                                <td style="padding: 12px; border: 1px solid #ddd;">${poliza.tipoSeguro}</td>
                            </tr>
                        </table>
                        
                        <p style="font-size: 14px; color: #666; margin-top: 25px;">
                            <strong>Información de Contacto:</strong><br>
                            Teléfono: 55-1234-5678<br>
                            Email: contacto@emeasesores.com
                        </p>
                        
                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center; border-top: 1px solid #ddd; padding-top: 15px;">
                            Este correo es un recordatorio automático.
                        </p>
                    </div>
                </div>
            `;
            tipo = 'recordatorio_manual';
        }

        // Crear registro de notificación
        const registro = new Notificacion({ 
            empresaId, 
            polizaId: poliza._id, 
            tipo, 
            canal: 'email', 
            destinatario, 
            mensaje,
            enviadoManualmente: true // MARCA DE ENVÍO MANUAL
        });

        try {
            await enviarEmail({
                empresaId,
                destinatario,
                asunto: tipo === 'vencimiento_poliza' ? 'Recordatorio de Vencimiento de Póliza' : 'Recordatorio de Pago',
                cuerpo: `<p>${mensaje}</p>`
            });
            
            registro.estado = 'enviada';
            registro.fechaEnvio = new Date();
            
            // Agregar al historial de notificaciones de la póliza
            if (!poliza.historialNotificaciones) {
                poliza.historialNotificaciones = [];
            }
            
            const entradaHistorial = {
                fecha: new Date(),
                tipo,
                canal: 'email',
                mensaje,
                estado: 'enviada',
                enviadoManualmente: true, // MARCA DE ENVÍO MANUAL
                diasRestantes: poliza.fechas?.vencimiento ? Math.ceil((new Date(poliza.fechas.vencimiento) - hoy) / (1000 * 60 * 60 * 24)) : 0
            };
            
            poliza.historialNotificaciones.push(entradaHistorial);
            await poliza.save();
            
            await registro.save();
            
            res.json({ 
                success: true, 
                message: 'Correo enviado manualmente correctamente',
                enviadoManualmente: true
            });
        } catch (e) {
            registro.estado = 'fallida';
            registro.errorDetalle = e.message;
            registro.enviadoManualmente = true;
            await registro.save();
            
            res.status(500).json({ error: 'Error al enviar correo manual', details: e.message });
        }
    } catch (error) {
        console.error('[enviarCorreoCobranzaDiaria] Error:', error);
        res.status(500).json({ error: 'Error al enviar correo manual', details: error.message });
    }
};

const renovarPoliza = async (req, res) => {
    let polizaViejaParaRestaurar = null;
    let estadoAnteriorPoliza = null;
    let nuevaPolizaGuardada = false;
    try {
        console.log('[RENOVAR] Iniciando proceso de renovación...');
        console.log('[RENOVAR] Body recibido:', req.body);
        console.log('[RENOVAR] Archivo recibido:', req.file);

        const { id } = req.params;
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        console.log('[RENOVAR] ID de póliza:', id);
        console.log('[RENOVAR] Empresa ID:', empresaId);
        console.log('[RENOVAR] Asesor ID:', asesorId);
        console.log('[RENOVAR] Rol de usuario:', userRole);

        // Validar que la empresa tenga el módulo de seguros activado
        const Empresa = require('../models/Empresa');
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            console.log('[RENOVAR] Error: Empresa no encontrada');
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            console.log('[RENOVAR] Error: Módulo de seguros no activado');
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        console.log('[RENOVAR] Buscando póliza antigua...');
        // Buscar póliza antigua
        const polizaAntigua = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });

        if (!polizaAntigua) {
            console.log('[RENOVAR] Error: Póliza no encontrada');
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        console.log('[RENOVAR] Póliza antigua encontrada:', polizaAntigua.numeroPoliza);

        // RBAC: Verificar que el asesor tenga acceso a la póliza (si no es admin)
        if (userRole !== 'admin' && polizaAntigua.asesorId.toString() !== asesorId.toString()) {
            console.log('[RENOVAR] Error: Sin permisos para renovar esta póliza');
            return res.status(403).json({ error: 'No tienes permiso para renovar esta póliza' });
        }

        polizaViejaParaRestaurar = polizaAntigua;
        estadoAnteriorPoliza = polizaAntigua.estado;
        polizaAntigua.estado = 'Renovada';
        await polizaAntigua.save();

        // PREPARACIÓN DE DATOS
        let datosNuevaPoliza = {};

        if (req.file) {
            // ESCENARIO A: Procesamiento de PDF
            console.log('[RENOVAR] Procesando PDF de renovación...');

            let pdfData;
            try {
                const parser = new PDFParse({ data: req.file.buffer });
                pdfData = await parser.getText();
                await parser.destroy();
                console.log('[RENOVAR] PDF parseado exitosamente');
            } catch (pdfError) {
                console.error('[RENOVAR] Error al procesar PDF:', pdfError);
                throw Object.assign(new Error('No se pudo procesar el PDF'), {
                    statusCode: 400,
                    details: pdfError.message
                });
            }

            const textoCompleto = normalizeText(pdfData.text);
            const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            // Datos extraídos del PDF
            const datosExtraidos = {
                numeroPoliza: '',
                cliente: '',
                aseguradora: 'CHUBB',
                inciso: '',
                tipoSeguro: 'Vehicular',
                paquete: '',
                fechaInicio: '',
                fechaVencimiento: '',
                primaTotal: 0
            };

            // Extraer fechas
            const regexFechas = /\b(\d{1,2}\/[A-Za-z]{3}\/\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/ig;
            const todasLasFechas = [...textoCompleto.matchAll(regexFechas)].map(m => m[1]);
            const fechasVigencia = todasLasFechas.filter(f => parseInt(f.split('/')[2]) >= 2020);

            if (fechasVigencia.length >= 2) {
                datosExtraidos.fechaInicio = fechasVigencia[0];
                datosExtraidos.fechaVencimiento = fechasVigencia[1];
            }

            // Extraer número de póliza
            const polizaMatch = textoCompleto.match(/\b(AN[\s\-]*\d{8})\b/i);
            if (polizaMatch) datosExtraidos.numeroPoliza = polizaMatch[1].replace(/\s+/g, '');

            // Extraer datos de las líneas
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i];
                const lineaUpper = linea.toUpperCase();

                if (datosExtraidos.numeroPoliza && lineaUpper.replace(/\s+/g, '') === datosExtraidos.numeroPoliza.replace(/\s+/g, '')) {
                    if (lineas[i + 1] && lineas[i + 1].match(/^\d{1,2}$/)) datosExtraidos.inciso = lineas[i + 1];
                }

                const paqueteMatch = lineaUpper.match(/\b(AMPLIA|LIMITADA|INTEGRAL|BASICA|PREMIER|ESENCIAL)\b/);
                if (paqueteMatch && !datosExtraidos.paquete) {
                    datosExtraidos.paquete = paqueteMatch[1];
                    if (lineas[i + 1]) datosExtraidos.cliente = lineas[i + 1];
                }

                if (lineaUpper === 'CARÁTULA' || lineaUpper === 'CARATULA') {
                    if (i > 0 && lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)) {
                        const montoRaw = lineas[i - 1].match(/[0-9,]+\.[0-9]{2}/)[0];
                        datosExtraidos.primaTotal = parseFloat(montoRaw.replace(/,/g, ''));
                    }
                }
            }

            if (!datosExtraidos.inciso) datosExtraidos.inciso = "1";
            if (!datosExtraidos.cliente) {
                const clienteFallback = textoCompleto.match(/Asegurado:\s*([A-Z\s]{10,})/i);
                if (clienteFallback) datosExtraidos.cliente = clienteFallback[1].trim();
            }

            console.log('[RENOVAR] Datos extraídos del PDF:', JSON.stringify(datosExtraidos, null, 2));

            // Convertir fechas de DD/MM/YYYY a objetos Date
            const convertirFecha = (fechaStr) => {
                if (!fechaStr) return null;
                const meses = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
                const partes = fechaStr.toLowerCase().split('/');
                if (partes.length === 3) {
                    const dia = partes[0].padStart(2, '0');
                    const mes = /^\d{1,2}$/.test(partes[1])
                        ? partes[1].padStart(2, '0')
                        : meses[partes[1].substring(0, 3)];
                    if (!mes) return null;
                    return normalizarFechaLocal(`${partes[2]}-${mes}-${dia}`);
                }
                return null;
            };

            const inicioSolicitado = req.body.fechaInicio || req.body['fechas[inicio]'];
            const vencimientoSolicitado = req.body.fechaVencimiento || req.body['fechas[vencimiento]'];
            const inicioNuevo = normalizarFechaLocal(inicioSolicitado) || convertirFecha(datosExtraidos.fechaInicio);
            const vencimientoNuevo = normalizarFechaLocal(vencimientoSolicitado) || convertirFecha(datosExtraidos.fechaVencimiento);
            if (!inicioNuevo || !vencimientoNuevo) {
                throw Object.assign(new Error('No se pudieron determinar las fechas de la nueva póliza.'), { statusCode: 400 });
            }

            // Mapear datos extraídos con fallback de polizaAntigua
            datosNuevaPoliza = {
                numeroPoliza: req.body.numeroPoliza || datosExtraidos.numeroPoliza || polizaAntigua.numeroPoliza,
                cliente: polizaAntigua.cliente, // Mantener el cliente de la póliza antigua
                clienteEmail: polizaAntigua.clienteEmail,
                clienteTelefono: polizaAntigua.clienteTelefono,
                tipoPago: req.body.tipoPago || polizaAntigua.tipoPago,
                tipoSeguro: datosExtraidos.tipoSeguro || polizaAntigua.tipoSeguro,
                aseguradora: datosExtraidos.aseguradora || polizaAntigua.aseguradora,
                inciso: datosExtraidos.inciso || polizaAntigua.inciso,
                paquete: datosExtraidos.paquete || polizaAntigua.paquete,
                primaTotal: Number(req.body.primaTotal) || datosExtraidos.primaTotal || polizaAntigua.primaTotal,
                primaNeta: req.body.primaNeta != null && req.body.primaNeta !== '' ? Number(req.body.primaNeta) : polizaAntigua.primaNeta || 0,
                primerPago: polizaAntigua.primerPago,
                montoAbono: polizaAntigua.montoAbono,
                fechas: {
                    inicio: inicioNuevo,
                    vencimiento: vencimientoNuevo
                }
            };
        } else {
            // ESCENARIO B: Carga manual desde req.body
            const {
                numeroPoliza,
                fechas,
                primaTotal,
                primaNeta,
                tipoPago,
                primerPago,
                montoAbono,
                tipoSeguro,
                aseguradora,
                inciso,
                paquete
            } = req.body;
            const fechasSolicitadas = fechas || {};

            datosNuevaPoliza = {
                numeroPoliza: numeroPoliza || polizaAntigua.numeroPoliza,
                fechas: {
                    inicio: normalizarFechaLocal(req.body.fechaInicio || fechasSolicitadas.inicio) || polizaAntigua.fechas?.inicio,
                    vencimiento: normalizarFechaLocal(req.body.fechaVencimiento || fechasSolicitadas.vencimiento) || polizaAntigua.fechas?.vencimiento
                },
                primaTotal: Number(primaTotal) || polizaAntigua.primaTotal,
                primaNeta: primaNeta != null && primaNeta !== '' ? Number(primaNeta) : polizaAntigua.primaNeta || 0,
                tipoPago: tipoPago || polizaAntigua.tipoPago,
                primerPago: primerPago || polizaAntigua.primerPago,
                montoAbono: montoAbono || polizaAntigua.montoAbono,
                tipoSeguro: tipoSeguro || polizaAntigua.tipoSeguro,
                aseguradora: aseguradora || polizaAntigua.aseguradora,
                inciso: inciso || polizaAntigua.inciso,
                paquete: paquete || polizaAntigua.paquete,
                cliente: polizaAntigua.cliente,
                clienteEmail: polizaAntigua.clienteEmail,
                clienteTelefono: polizaAntigua.clienteTelefono
            };
        }

        const numeroBase = String(datosNuevaPoliza.numeroPoliza || '').trim();
        let numeroNuevo = numeroBase;
        let intentoNumero = 1;
        while (await Poliza.exists({ empresaId, numeroPoliza: numeroNuevo })) {
            const sufijo = intentoNumero === 1
                ? `-REN-${datosNuevaPoliza.fechas.inicio.getFullYear()}`
                : `-REN-${datosNuevaPoliza.fechas.inicio.getFullYear()}-${intentoNumero}`;
            numeroNuevo = `${numeroBase}${sufijo}`;
            intentoNumero++;
        }
        datosNuevaPoliza.numeroPoliza = numeroNuevo;

        // HISTORIAL: Crear nueva póliza con los mismos datos del cliente
        const nuevaPoliza = new Poliza({
            empresaId,
            asesorId,
            clienteId: polizaAntigua.clienteId, // Mantener el mismo clienteId si existe
            polizaAnteriorId: polizaAntigua._id,
            ...datosNuevaPoliza,
            estado: 'Activa',
            proximoPago: datosNuevaPoliza.fechas?.inicio || new Date()
        });

        if (nuevaPoliza.tipoPago !== 'anual') {
            nuevaPoliza.recibos = generarCalendarioRecibos(
                nuevaPoliza.primaTotal,
                nuevaPoliza.fechas.inicio,
                nuevaPoliza.tipoPago,
                nuevaPoliza.primerPago,
                nuevaPoliza.montoAbono
            );
        }
        const primerReciboPendiente = nuevaPoliza.recibos.find(
            recibo => recibo.estadoRecibo?.toLowerCase() === 'pendiente'
        );
        if (primerReciboPendiente) {
            nuevaPoliza.proximoPago = primerReciboPendiente.fechaVencimientoRecibo;
        }

        await nuevaPoliza.save();
        nuevaPolizaGuardada = true;

        res.status(201).json({
            success: true,
            message: 'Renovación exitosa',
            poliza: nuevaPoliza,
            polizaAntigua: {
                id: polizaAntigua._id,
                estado: polizaAntigua.estado
            },
            nuevaPoliza
        });
    } catch (error) {
        console.error('[renovarPoliza] Error:', error);

        if (polizaViejaParaRestaurar && !nuevaPolizaGuardada) {
            try {
                polizaViejaParaRestaurar.estado = estadoAnteriorPoliza;
                await polizaViejaParaRestaurar.save();
            } catch (restoreError) {
                console.error('[renovarPoliza] No se pudo restaurar el estado anterior:', restoreError);
            }
        }

        // Manejo de error de llave duplicada
        if (error.code === 11000) {
            return res.status(400).json({
                error: 'Ya existe una póliza activa con este número en el sistema. Si la aseguradora mantuvo el mismo número para la renovación, por favor agrégale un sufijo (ej. -01) al número de póliza.'
            });
        }

        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Error al renovar póliza',
            details: error.details || error.message
        });
    }
};

// ==========================================
// ASIGNAR ASESOR A PÓLIZA
// ==========================================
const asignarAsesor = async (req, res) => {
    try {
        const { id } = req.params;
        const { nuevoAsesorId } = req.body;
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;

        // Verificar que sea admin
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Solo administradores pueden reasignar asesores' });
        }

        // Verificar que el nuevo asesor exista y pertenezca a la empresa (asesor o admin)
        const nuevoAsesor = await Usuario.findOne({
            _id: nuevoAsesorId,
            empresaId,
            role: { $in: ['asesor', 'admin'] },
            isDeleted: false
        });
        if (!nuevoAsesor) {
            return res.status(404).json({ error: 'Asesor no encontrado o no pertenece a tu empresa' });
        }

        // Actualizar la póliza
        const poliza = await Poliza.findOneAndUpdate(
            { _id: id, empresaId, deletedAt: null },
            { asesorId: nuevoAsesorId },
            { new: true }
        );

        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        res.json({ message: 'Asesor reasignado correctamente', poliza });
    } catch (error) {
        console.error('[asignarAsesor] Error:', error);
        res.status(500).json({ error: 'Error al reasignar asesor', details: error.message });
    }
};

// ==========================================
// EXPORTAR REPORTE EXCEL (ACTUALIZADO CON ASESOR Y DESGLOSE DE PAGOS)
// ==========================================
const exportarReporteExcel = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;

        // Construir filtro
        let filtro = { empresaId, deletedAt: null };
        if (userRole !== 'admin') {
            filtro.asesorId = userId;
        }

        let asesorExportado = null;
        const asesorIdSolicitado = userRole === 'admin' ? req.query.asesorId : String(userId || '');
        if (asesorIdSolicitado && asesorIdSolicitado !== 'todos') {
            if (!mongoose.Types.ObjectId.isValid(asesorIdSolicitado)) {
                return res.status(400).json({ error: 'El asesor seleccionado no es válido' });
            }
            asesorExportado = await Usuario.findOne({ _id: asesorIdSolicitado, empresaId }).select('username');
            if (!asesorExportado) {
                return res.status(404).json({ error: 'Asesor no encontrado en esta empresa' });
            }
            filtro.asesorId = asesorExportado._id;
        }

        // AGREGADO: .populate('asesorId', 'username') para traer el nombre del asesor
        const polizas = await Poliza.find(filtro)
            .populate('asesorId', 'username')
            .sort({ createdAt: -1 })
            .lean();

        // Crear workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Pólizas');

        // Agregar encabezados con desglose de pagos
        worksheet.columns = [
            { header: 'Número de Póliza', key: 'numeroPoliza', width: 20 },
            { header: 'Cliente', key: 'cliente', width: 30 },
            { header: 'Asesor', key: 'asesor', width: 20 },
            { header: 'Email', key: 'clienteEmail', width: 25 },
            { header: 'Teléfono', key: 'clienteTelefono', width: 15 },
            { header: 'Aseguradora', key: 'aseguradora', width: 20 },
            { header: 'Tipo de Seguro', key: 'tipoSeguro', width: 15 },
            { header: 'Tipo de Pago', key: 'tipoPago', width: 12 },
            { header: 'Fecha Inicio', key: 'fechaInicio', width: 15 },
            { header: 'Fecha Vencimiento', key: 'fechaVencimiento', width: 15 },
            { header: 'Prima Total / A Cobrar', key: 'primaTotal', width: 18 },
            { header: 'Prima Neta', key: 'primaNeta', width: 15 },
            { header: 'Primer Pago (Enganche)', key: 'primerPago', width: 22 },
            { header: 'Monto Abono', key: 'montoAbono', width: 15 },
            { header: 'Estado', key: 'estado', width: 12 },
            { header: 'No. Pago', key: 'numeroPago', width: 10 },
            { header: 'Fecha Esperada', key: 'fechaEsperada', width: 15 },
            { header: 'Monto Pago', key: 'montoPago', width: 12 },
            { header: 'Pago Neto (Base Comisión)', key: 'montoPagoNeto', width: 24 },
            { header: 'Estado Pago', key: 'estadoPago', width: 12 }
        ];

        // Función para calcular número de pagos según tipo
        const getNumeroPagos = (tipoPago) => {
            switch (tipoPago) {
                case 'mensual': return 12;
                case 'trimestral': return 4;
                case 'semestral': return 2;
                case 'anual': return 1;
                default: return 1;
            }
        };

        // Función para calcular fechas de pagos esperados
        const calcularFechasPagos = (fechaInicio, tipoPago, numPagos) => {
            const fechas = [];
            const inicio = new Date(fechaInicio);
            
            for (let i = 0; i < numPagos; i++) {
                const fechaPago = new Date(inicio);
                switch (tipoPago) {
                    case 'mensual':
                        fechaPago.setMonth(inicio.getMonth() + i);
                        break;
                    case 'trimestral':
                        fechaPago.setMonth(inicio.getMonth() + (i * 3));
                        break;
                    case 'semestral':
                        fechaPago.setMonth(inicio.getMonth() + (i * 6));
                        break;
                    case 'anual':
                        fechaPago.setFullYear(inicio.getFullYear() + i);
                        break;
                }
                fechas.push(fechaPago);
            }
            return fechas;
        };

        // Función para verificar estado de un pago específico
        const getEstadoPago = (poliza, indexPago, fechaEsperada) => {
            if (!poliza.pagos || poliza.pagos.length === 0) {
                return 'Pendiente';
            }
            
            // Buscar si existe un pago registrado para este índice
            const pagoRegistrado = poliza.pagos[indexPago];
            if (pagoRegistrado) {
                return pagoRegistrado.estado === 'pagado' ? 'Pagado' : 'Pendiente';
            }
            
            // Verificar si la fecha esperada ya pasó
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fechaEsperadaClean = new Date(fechaEsperada);
            fechaEsperadaClean.setHours(0, 0, 0, 0);
            
            if (fechaEsperadaClean < hoy) {
                return 'Atrasado';
            }
            
            return 'Pendiente';
        };

        // Agregar datos con desglose de pagos
        let totalPagoNeto = 0;
        polizas.forEach(poliza => {
            const numPagos = getNumeroPagos(poliza.tipoPago);
            const fechasPagos = calcularFechasPagos(poliza.fechas?.inicio, poliza.tipoPago, numPagos);
            const recibos = poliza.recibos || [];
            const pagosExportar = recibos.length
                ? recibos.map((recibo, index) => ({
                    numeroPago: recibo.numeroRecibo || index + 1,
                    fechaEsperada: recibo.fechaVencimientoRecibo || recibo.fechaVencimiento,
                    montoPago: Number(recibo.montoRecibo) || 0,
                    estadoPago: String(recibo.estadoRecibo || recibo.estado || '').toLowerCase() === 'pagado'
                        ? 'Pagado'
                        : String(recibo.estadoRecibo || recibo.estado || '').toLowerCase() === 'atrasado'
                            ? 'Atrasado'
                            : 'Pendiente'
                }))
                : Array.from({ length: numPagos }, (_, index) => {
                    const pagoRegistrado = poliza.pagos?.[index];
                    const montoConfigurado = index === 0
                        ? (Number(poliza.primerPago) || (numPagos === 1 ? Number(poliza.primaTotal) || 0 : 0))
                        : Number(poliza.montoAbono) || 0;
                    return {
                        numeroPago: index + 1,
                        fechaEsperada: fechasPagos[index],
                        montoPago: Number(pagoRegistrado?.monto ?? montoConfigurado) || 0,
                        estadoPago: getEstadoPago(poliza, index, fechasPagos[index])
                    };
                });

            // Generar filas con los recibos reales; usar pagos configurados en pólizas legacy.
            pagosExportar.forEach(pago => {
                const montoPagoNeto = calcularPagoNeto(pago.montoPago, poliza.primaNeta, poliza.primaTotal);
                worksheet.addRow({
                    numeroPoliza: poliza.numeroPoliza,
                    cliente: poliza.cliente,
                    asesor: poliza.asesorId ? poliza.asesorId.username : 'Sin Asesor',
                    clienteEmail: poliza.clienteEmail || '',
                    clienteTelefono: poliza.clienteTelefono || '',
                    aseguradora: poliza.aseguradora,
                    tipoSeguro: poliza.tipoSeguro,
                    tipoPago: poliza.tipoPago,
                    fechaInicio: poliza.fechas?.inicio ? new Date(poliza.fechas.inicio).toLocaleDateString() : '',
                    fechaVencimiento: poliza.fechas?.vencimiento ? new Date(poliza.fechas.vencimiento).toLocaleDateString() : '',
                    primaTotal: Number(poliza.primaTotal) || 0,
                    primaNeta: Number(poliza.primaNeta) || 0,
                    primerPago: Number(poliza.primerPago) || 0,
                    montoAbono: Number(poliza.montoAbono) || 0,
                    estado: poliza.estado,
                    numeroPago: pago.numeroPago,
                    fechaEsperada: pago.fechaEsperada ? new Date(pago.fechaEsperada).toLocaleDateString() : '',
                    montoPago: pago.montoPago,
                    montoPagoNeto,
                    estadoPago: pago.estadoPago
                });
                totalPagoNeto = Number((totalPagoNeto + montoPagoNeto).toFixed(2));
            });
        });

        const totalPrimaTotal = polizas.reduce((sum, poliza) => sum + (Number(poliza.primaTotal) || 0), 0);
        const totalPrimaNeta = polizas.reduce((sum, poliza) => sum + (Number(poliza.primaNeta) || 0), 0);
        const rowTotal = worksheet.addRow({
            numeroPoliza: 'TOTAL GENERAL',
            cliente: '',
            asesor: '',
            clienteEmail: '',
            clienteTelefono: '',
            aseguradora: '',
            tipoSeguro: '',
            tipoPago: '',
            fechaInicio: '',
            fechaVencimiento: '',
            primaTotal: totalPrimaTotal,
            primaNeta: totalPrimaNeta,
            primerPago: '',
            montoAbono: '',
            estado: '',
            numeroPago: '',
            fechaEsperada: '',
            montoPago: '',
            montoPagoNeto: totalPagoNeto,
            estadoPago: ''
        });
        rowTotal.eachCell((cell) => {
            cell.font = { bold: true };
        });

        // Enviar archivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const sufijoAsesor = asesorExportado
            ? `_Asesor_${String(asesorExportado.username || 'asesor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`
            : '';
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Polizas${sufijoAsesor}_${new Date().toISOString().split('T')[0]}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('[exportarReporteExcel] Error:', error);
        res.status(500).json({ error: 'Error al exportar reporte Excel', details: error.message });
    }
};

// ==========================================
// EXPORTAR REPORTE PDF (CON DESGLOSE DE PAGOS)
// ==========================================
const exportarReportePDF = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;

        // Construir filtro
        let filtro = { empresaId, deletedAt: null };
        if (userRole !== 'admin') {
            filtro.asesorId = userId;
        }

        let asesorExportado = null;
        const asesorIdSolicitado = userRole === 'admin' ? req.query.asesorId : String(userId || '');
        if (asesorIdSolicitado && asesorIdSolicitado !== 'todos') {
            if (!mongoose.Types.ObjectId.isValid(asesorIdSolicitado)) {
                return res.status(400).json({ error: 'El asesor seleccionado no es válido' });
            }
            asesorExportado = await Usuario.findOne({ _id: asesorIdSolicitado, empresaId }).select('username');
            if (!asesorExportado) {
                return res.status(404).json({ error: 'Asesor no encontrado en esta empresa' });
            }
            filtro.asesorId = asesorExportado._id;
        }

        const polizas = await Poliza.find(filtro).populate('asesorId', 'username').sort({ createdAt: -1 }).lean();

        // Obtener configuración de la empresa para el logo
        const config = await Configuracion.findOne({ empresaId });
        const logoBase64 = config?.logoBase64 || null;

        // Crear documento PDF con márgenes
        const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape', bufferPages: true });

        res.setHeader('Content-Type', 'application/pdf');
        const sufijoAsesor = asesorExportado
            ? `_Asesor_${String(asesorExportado.username || 'asesor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`
            : '';
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Polizas${sufijoAsesor}_${new Date().toISOString().split('T')[0]}.pdf`);

        doc.pipe(res);

        // Logo: Posición X=20, Y=20. Usamos fit: [80, 80] para que no se corte.
        if (logoBase64) {
            try {
                const cleanBase64 = logoBase64.replace(/^data:image\/[a-z]+;base64,/, '');
                const logoBuffer = Buffer.from(cleanBase64, 'base64');
                doc.image(logoBuffer, 20, 20, { 
                    fit: [80, 80], 
                    align: 'left', 
                    valign: 'top' 
                });
            } catch (err) {
                console.warn('[exportarReportePDF] Error al cargar logo:', err);
            }
        }

        // Centrar el título sobre el ancho de la página, independientemente del logo.
        const tituloReporte = asesorExportado
            ? `Reporte de Pólizas - Asesor: ${asesorExportado.username.toUpperCase()}`
            : 'Reporte General de Pólizas';
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#111111')
            .text(tituloReporte, 0, 30, { width: doc.page.width, align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('#444444')
            .text(`Fecha: ${new Date().toLocaleDateString()}`, 0, 54, { width: doc.page.width, align: 'center' });

        const tableTop = 100;
        const tableLeft = 20;
        const tableWidth = doc.page.width - (tableLeft * 2);
        const columnRatios = [0.07, 0.115, 0.05, 0.055, 0.06, 0.065, 0.075, 0.06, 0.07, 0.045, 0.07, 0.06, 0.075, 0.06, 0.07];
        const columnWidths = columnRatios.map(ratio => tableWidth * ratio);
        const headers = [
            'Número', 'Cliente', 'Tipo Pago', 'Inicio', 'Vencimiento',
            'Prima Neta', 'Primer Pago / Enganche', 'Monto Abono', 'Prima Total / A Cobrar',
            'No. Pago', 'Fecha Esperada', 'Monto Pago', 'Pago Neto (Base Comisión)', 'Estado Pago', 'Asesor'
        ];
        const headerHeight = 36;
        const cellPadding = 3;

        // Funciones auxiliares (mismas que en Excel)
        const getNumeroPagos = (tipoPago) => {
            switch (tipoPago) {
                case 'mensual': return 12;
                case 'trimestral': return 4;
                case 'semestral': return 2;
                case 'anual': return 1;
                default: return 1;
            }
        };

        const calcularFechasPagos = (fechaInicio, tipoPago, numPagos) => {
            const fechas = [];
            const inicio = new Date(fechaInicio);
            
            for (let i = 0; i < numPagos; i++) {
                const fechaPago = new Date(inicio);
                switch (tipoPago) {
                    case 'mensual':
                        fechaPago.setMonth(inicio.getMonth() + i);
                        break;
                    case 'trimestral':
                        fechaPago.setMonth(inicio.getMonth() + (i * 3));
                        break;
                    case 'semestral':
                        fechaPago.setMonth(inicio.getMonth() + (i * 6));
                        break;
                    case 'anual':
                        fechaPago.setFullYear(inicio.getFullYear() + i);
                        break;
                }
                fechas.push(fechaPago);
            }
            return fechas;
        };

        const getEstadoPago = (poliza, indexPago, fechaEsperada) => {
            if (!poliza.pagos || poliza.pagos.length === 0) {
                return 'Pendiente';
            }
            
            const pagoRegistrado = poliza.pagos[indexPago];
            if (pagoRegistrado) {
                return pagoRegistrado.estado === 'pagado' ? 'Pagado' : 'Pendiente';
            }
            
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fechaEsperadaClean = new Date(fechaEsperada);
            fechaEsperadaClean.setHours(0, 0, 0, 0);
            
            if (fechaEsperadaClean < hoy) {
                return 'Atrasado';
            }
            
            return 'Pendiente';
        };

        const getMontoPago = (poliza, indexPago, numPagos) => {
            if (indexPago === 0 && Number(poliza.primerPago) > 0) return Number(poliza.primerPago);
            if (Number(poliza.montoAbono) > 0) return Number(poliza.montoAbono);
            return (Number(poliza.primaTotal) || 0) / numPagos;
        };

        const formatearMonto = monto => '$' + (Number(monto) || 0).toFixed(2);
        const formatearFecha = fecha => fecha ? new Date(fecha).toLocaleDateString() : '';
        let totalPagoNeto = 0;
        const totalPrimaTotal = polizas.reduce((sum, poliza) => sum + (Number(poliza.primaTotal) || 0), 0);
        const totalPrimaNeta = polizas.reduce((sum, poliza) => sum + (Number(poliza.primaNeta) || 0), 0);

        // Encabezados
        const drawHeaders = (yPos) => {
            doc.fontSize(7).font('Helvetica-Bold');
            let x = tableLeft;
            headers.forEach((header, i) => {
                doc.rect(x, yPos, columnWidths[i], headerHeight).fillAndStroke('#E9ECEF', '#B8B8B8');
                doc.fillColor('#111111').text(header, x + cellPadding, yPos + cellPadding, {
                    width: columnWidths[i] - (cellPadding * 2),
                    height: headerHeight - (cellPadding * 2),
                    align: 'center',
                    valign: 'center'
                });
                x += columnWidths[i];
            });
        };

        drawHeaders(tableTop);

        // Datos con desglose de pagos y altura adaptable al contenido de cada fila.
        doc.fontSize(8).font('Helvetica');
        let y = tableTop + headerHeight + 4;
        let rowIndex = 0;

        polizas.forEach((poliza) => {
            const numPagos = getNumeroPagos(poliza.tipoPago);
            const fechasPagos = calcularFechasPagos(poliza.fechas?.inicio, poliza.tipoPago, numPagos);
            const recibos = poliza.recibos || [];
            const pagosExportar = recibos.length
                ? recibos.map((recibo, index) => {
                    const estadoRecibo = String(recibo.estadoRecibo || recibo.estado || '').toLowerCase();
                    const montoRecibo = recibo.montoRecibo == null ? NaN : Number(recibo.montoRecibo);
                    return {
                        numeroPago: recibo.numeroRecibo || index + 1,
                        fechaEsperada: recibo.fechaVencimientoRecibo || recibo.fechaVencimiento || fechasPagos[index],
                        montoPago: Number.isFinite(montoRecibo) ? montoRecibo : getMontoPago(poliza, index, numPagos),
                        estadoPago: estadoRecibo === 'pagado'
                            ? 'Pagado'
                            : estadoRecibo === 'atrasado'
                                ? 'Atrasado'
                                : estadoRecibo === 'cancelado'
                                    ? 'Cancelado'
                                    : 'Pendiente'
                    };
                })
                : Array.from({ length: numPagos }, (_, index) => ({
                    numeroPago: index + 1,
                    fechaEsperada: fechasPagos[index],
                    montoPago: getMontoPago(poliza, index, numPagos),
                    estadoPago: getEstadoPago(poliza, index, fechasPagos[index])
                }));

            pagosExportar.forEach((pago) => {
                const montoPagoNeto = calcularPagoNeto(pago.montoPago, poliza.primaNeta, poliza.primaTotal);
                const data = [
                    poliza.numeroPoliza || '',
                    poliza.cliente || '',
                    poliza.tipoPago || '',
                    formatearFecha(poliza.fechas?.inicio),
                    formatearFecha(poliza.fechas?.vencimiento),
                    formatearMonto(poliza.primaNeta),
                    formatearMonto(poliza.primerPago),
                    formatearMonto(poliza.montoAbono),
                    formatearMonto(poliza.primaTotal),
                    pago.numeroPago,
                    formatearFecha(pago.fechaEsperada),
                    formatearMonto(pago.montoPago),
                    formatearMonto(montoPagoNeto),
                    pago.estadoPago,
                    poliza.asesorId?.username || ''
                ].map(value => String(value ?? ''));
                totalPagoNeto = Number((totalPagoNeto + montoPagoNeto).toFixed(2));

                doc.fontSize(8).font('Helvetica');
                const alturasTexto = data.map((text, index) => doc.heightOfString(text, {
                    width: columnWidths[index] - (cellPadding * 2),
                    align: 'center'
                }));
                const rowHeight = Math.max(20, ...alturasTexto.map(height => height + (cellPadding * 2)));

                if (y + rowHeight > doc.page.height - 40) {
                    doc.addPage();
                    y = 20;
                    drawHeaders(y);
                    y += headerHeight + 4;
                }

                let x = tableLeft;
                data.forEach((text, columnIndex) => {
                    const columnWidth = columnWidths[columnIndex];
                    const rowColor = rowIndex % 2 === 0 ? '#F7F7F7' : '#FFFFFF';
                    doc.rect(x, y, columnWidth, rowHeight).fillAndStroke(rowColor, '#D0D0D0');

                    const colorEstado = pago.estadoPago === 'Pagado'
                        ? '#198754'
                        : pago.estadoPago === 'Atrasado'
                            ? '#DC3545'
                            : '#111111';
                    doc.fontSize(8).font('Helvetica').fillColor(columnIndex === 13 ? colorEstado : '#111111');
                    doc.text(text, x + cellPadding, y + cellPadding, {
                        width: columnWidth - (cellPadding * 2),
                        height: rowHeight - (cellPadding * 2),
                        align: 'center',
                        valign: 'center'
                    });
                    x += columnWidth;
                });

                y += rowHeight;
                rowIndex++;
            });
        });

        const totalRow = [
            'TOTAL GENERAL', '', '', '', '',
            formatearMonto(totalPrimaNeta), '', '', formatearMonto(totalPrimaTotal),
            '', '', '', formatearMonto(totalPagoNeto), '', ''
        ];

        doc.font('Helvetica-Bold').fillColor('#111111');
        let x = tableLeft;
        const totalRowHeight = 24;
        if (y + totalRowHeight > doc.page.height - 40) {
            doc.addPage();
            y = 20;
        }
        totalRow.forEach((text, columnIndex) => {
            const columnWidth = columnWidths[columnIndex];
            doc.rect(x, y, columnWidth, totalRowHeight).fillAndStroke('#EAF7EA', '#8BCF8A');
            doc.text(String(text), x + cellPadding, y + cellPadding, {
                width: columnWidth - (cellPadding * 2),
                height: totalRowHeight - (cellPadding * 2),
                align: 'center',
                valign: 'center'
            });
            x += columnWidth;
        });

        // Pie de página (Numeración)
        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(
                `Página ${i + 1} de ${pages.count}`,
                20, doc.page.height - 30, { align: 'center' }
            );
        }

        doc.end();
    } catch (error) {
        console.error('[exportarReportePDF] Error:', error);
        if (res.headersSent) {
            res.destroy(error);
            return;
        }
        res.status(500).json({ error: 'Error al exportar reporte PDF', details: error.message });
    }
};

const actualizarEnlacePago = async (req, res) => {
    try {
        const { id } = req.params;
        const { enlacePago } = req.body;
        const empresaId = req.user.empresaId;

        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });

        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada' });
        }

        poliza.enlacePago = enlacePago || null;
        await poliza.save();

        res.json({
            success: true,
            message: 'Enlace de pago actualizado correctamente',
            enlacePago: poliza.enlacePago
        });
    } catch (error) {
        console.error('[actualizarEnlacePago] Error:', error);
        res.status(500).json({ error: 'Error al actualizar enlace de pago' });
    }
};


const resolverCobranzaConPago = async (req, res) => {
    try {
        const empresaId = req.user?.empresaId || req.usuario?.empresaId;
        const filtroTenant = req.tenantFilter ?? (empresaId ? { empresaId } : null);
        if (!filtroTenant) {
            return res.status(403).json({ success: false, error: 'No se pudo determinar la empresa del usuario.' });
        }

        const polizaId = req.params.id || req.params.polizaId;
        const poliza = await Poliza.findOne({ _id: polizaId, ...filtroTenant, deletedAt: null });
        if (!poliza) {
            return res.status(404).json({ success: false, error: 'Póliza no encontrada' });
        }
        
        const reciboPendiente = poliza.recibos?.find(
            recibo => recibo.estadoRecibo?.toLowerCase() === 'pendiente'
        );
        const saldoPendiente = Number(poliza.saldoRestante || poliza.primaTotal) || 0;
        if ((!poliza.recibos || poliza.recibos.length === 0 || !reciboPendiente) && saldoPendiente > 0) {
            const yaTienePagos = poliza.pagos && poliza.pagos.length > 0;
            const montoCobrado = Number(yaTienePagos
                ? (poliza.montoAbono || poliza.primaTotal)
                : (poliza.primerPago || poliza.montoAbono || poliza.primaTotal)) || 0;

            poliza.pagos.push({
                monto: montoCobrado,
                fechaPago: new Date(),
                metodoPago: req.body.metodoPago || 'transferencia',
                estado: 'pagado'
            });

            poliza.saldoRestante = Math.max(0, saldoPendiente - montoCobrado);
            poliza.estado = 'Activa';
            if (poliza.fechas) {
                const prox = new Date(poliza.proximoPago || poliza.fechas.vencimiento);
                prox.setMonth(prox.getMonth() + 1);
                poliza.proximoPago = prox;
            }
            await poliza.save();
            return res.json({ success: true, message: 'Cobranza legacy resuelta', poliza });
        }
        
        const recibo = reciboPendiente;
        if (!recibo) {
            return res.status(409).json({ success: false, error: 'No hay recibos pendientes para esta póliza.' });
        }

        const montoPagado = Number(recibo.montoRecibo) || 0;
        const fechaSolicitada = req.body?.fechaPago ? new Date(req.body.fechaPago) : null;
        const fechaPago = fechaSolicitada && !Number.isNaN(fechaSolicitada.getTime()) ? fechaSolicitada : new Date();
        const metodoPago = req.body?.metodoPago || 'efectivo';
        recibo.estadoRecibo = 'pagado';
        recibo.metodoPago = metodoPago;
        poliza.pagos.push({ fechaPago, monto: montoPagado, estado: 'pagado', metodoPago });

        const saldoActual = Number(poliza.saldoRestante) || 0;
        const saldoBase = saldoActual > 0 ? saldoActual : poliza.recibos
            .filter(r => r.estadoRecibo?.toLowerCase() === 'pendiente')
            .reduce((total, r) => total + (Number(r.montoRecibo) || 0), 0) + montoPagado;
        poliza.saldoRestante = Math.max(0, saldoBase - montoPagado);
        poliza.estadoPago = poliza.saldoRestante === 0 ? 'pagado_completo' : 'al_corriente';

        const proxRecibo = poliza.recibos.find(r => r.estadoRecibo?.toLowerCase() === 'pendiente');
        poliza.proximoPago = proxRecibo?.fechaVencimientoRecibo || null;

        await poliza.save();
        res.json({ success: true, message: 'Pago registrado correctamente', poliza });
    } catch (error) {
        console.error('[RESCUE ERROR PAGO]:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};


module.exports = {
    crearPoliza,
    importarPolizasExcel,
    obtenerPolizas,
    obtenerPolizaPorId,
    actualizarPoliza,
    recalcularRecibos,
    regenerarRecibosPendientes,
    cancelarPoliza,
    eliminarPoliza,
    obtenerPapelera,
    restaurarPoliza,
    eliminarDefinitivamente,
    registrarPago,
    asignarAsesor,
    exportarReporteExcel,
    exportarReportePDF,
    enviarRecordatorioManual,
    obtenerMetricasSeguros,
    obtenerEventosAgenda,
    migrarFechasAgenda,
    renovarPago,
    eliminarPago,
    actualizarProximoPago,
    enviarRecordatorioCorreo,
    renovarPoliza,
    obtenerCobranzaDiaria,
    marcarCobranzaResuelta,
    enviarCorreoCobranzaDiaria,
    actualizarEnlacePago,
    generarCalendarioRecibos,
    resolverCobranzaConPago
};
