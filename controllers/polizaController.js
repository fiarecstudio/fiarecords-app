const Poliza = require('../models/Poliza');
const pdfParseModule = require('pdf-parse');
const PDFParse = pdfParseModule.PDFParse || (pdfParseModule.default && pdfParseModule.default.PDFParse) || pdfParseModule.default || pdfParseModule;

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

const crearPoliza = async (req, res) => {
    try {
        const { numeroPoliza, cliente, clienteEmail, clienteTelefono, tipoPago, tipoSeguro, aseguradora, fechas, primaTotal, documentoDriveId, inciso, paquete, montoAbono, primerPago, diasAnticipacionAviso, clienteId } = req.body;

        // Inyectar empresaId del usuario autenticado
        const empresaId = req.user.empresaId;

        // Asignar automáticamente el asesorId del usuario que crea la póliza
        const asesorId = req.user._id || req.user.id;

        const nuevaPoliza = new Poliza({
            empresaId,
            asesorId,
            numeroPoliza,
            cliente,
            clienteEmail,
            clienteTelefono,
            tipoPago,
            tipoSeguro,
            aseguradora,
            fechas,
            primaTotal,
            documentoDriveId,
            inciso,
            paquete,
            montoAbono: montoAbono || null,
            primerPago: primerPago || null,
            diasAnticipacionAviso: diasAnticipacionAviso || 3,
            saldoRestante: primaTotal, // Inicializar saldoRestante con la prima total
            clienteId: clienteId || null // Guardar clienteId si viene del CRM
        });

        const polizaGuardada = await nuevaPoliza.save();
        res.status(201).json(polizaGuardada);
    } catch (error) {
        console.error('Error al crear póliza:', error);
        res.status(500).json({ error: 'Error al crear la póliza', details: error.message });
    }
};

const obtenerPolizas = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;
        
        // Construir filtro base
        let filtro = { empresaId, deletedAt: null };
        
        // RBAC: Si el usuario es admin, puede ver todas las pólizas de la empresa
        // Si viene un query param asesorId, filtra por ese asesor específico
        if (userRole === 'admin') {
            if (req.query.asesorId) {
                filtro.asesorId = req.query.asesorId;
            }
        } else {
            // Si no es admin, SOLO puede ver sus propias pólizas
            filtro.asesorId = userId;
        }
        
        const polizas = await Poliza.find(filtro);
        
        res.json(polizas);
    } catch (error) {
        console.error('Error al obtener pólizas:', error);
        res.status(500).json({ error: 'Error al obtener las pólizas', details: error.message });
    }
};

const actualizarPoliza = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Buscar y actualizar, asegurando que pertenezca al empresaId y no esté eliminada
        const poliza = await Poliza.findOneAndUpdate(
            { _id: id, empresaId, deletedAt: null },
            req.body,
            { new: true, runValidators: true }
        );
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }
        
        res.json(poliza);
    } catch (error) {
        console.error('Error al actualizar póliza:', error);
        res.status(500).json({ error: 'Error al actualizar la póliza', details: error.message });
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
        
        res.json({ message: 'Póliza enviada a papelera de reciclaje' });
    } catch (error) {
        console.error('Error al eliminar póliza:', error);
        res.status(500).json({ error: 'Error al eliminar la póliza', details: error.message });
    }
};

const obtenerPolizaPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        
        // Buscar por id, empresaId y que no esté eliminada
        const poliza = await Poliza.findOne({ _id: id, empresaId, deletedAt: null });
        
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
        const polizasEliminadas = await Poliza.find(filtroPapelera).sort({ deletedAt: -1 });

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
        
        // Calcular próximo pago según tipoPago
        const fechaBase = poliza.proximoPago || new Date();
        let proximoPago;
        
        switch (poliza.tipoPago) {
            case 'mensual':
                proximoPago = new Date(fechaBase);
                proximoPago.setMonth(proximoPago.getMonth() + 1);
                break;
            case 'trimestral':
                proximoPago = new Date(fechaBase);
                proximoPago.setMonth(proximoPago.getMonth() + 3);
                break;
            case 'anual':
            default:
                proximoPago = new Date(fechaBase);
                proximoPago.setFullYear(proximoPago.getFullYear() + 1);
                break;
        }
        
        poliza.proximoPago = proximoPago;
        
        await poliza.save();
        res.json({ message: 'Pago registrado correctamente', poliza });
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

        const destinatario = canal === 'email' 
            ? (poliza.clienteEmail || 'prueba_correo@ejemplo.com')
            : (poliza.clienteTelefono || '5512345678');

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
        const empresaId = req.user.empresaId;
        const userRole = req.user.role;
        const userId = req.user._id || req.user.id;
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        // Construir filtro base con RBAC
        let filtroBase = { empresaId, deletedAt: null };
        
        // RBAC: Si el usuario no es admin, filtrar por asesorId
        if (userRole !== 'admin') {
            filtroBase.asesorId = userId;
        }

        // 1. Pólizas Activas
        const activas = await Poliza.countDocuments(filtroBase);

        // 2. Pólizas Próximas a Vencer (dentro de los próximos 30 días)
        const unMesDespues = new Date(hoy);
        unMesDespues.setDate(unMesDespues.getDate() + 30);
        const porVencer = await Poliza.countDocuments({
            ...filtroBase,
            "fechas.vencimiento": { $gte: hoy, $lte: unMesDespues }
        });

        // 3. Pagos Pendientes / Atrasados
        const pagosPendientes = await Poliza.countDocuments({
            ...filtroBase,
            proximoPago: { $lt: hoy }
        });

        // 4. Monto Total Recaudado (Suma de todos los pagos registrados)
        const polizasConPagos = await Poliza.find(filtroBase);
        let totalRecaudado = 0;
        polizasConPagos.forEach(p => {
            if (p.pagos) {
                p.pagos.forEach(pago => {
                    if (pago.estado === 'pagado') totalRecaudado += pago.monto;
                });
            }
        });

        res.json({
            success: true,
            metricas: {
                activas,
                porVencer,
                pagosPendientes,
                totalRecaudado
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener métricas', details: error.message });
    }
};

// FUNCIÓN UTILITARIA: Calcular próximo pago según tipoPago
const calcularProximoPago = (fechaBase, tipoPago) => {
    const proximoPago = new Date(fechaBase);
    
    switch (tipoPago) {
        case 'mensual':
            proximoPago.setMonth(proximoPago.getMonth() + 1);
            break;
        case 'trimestral':
            proximoPago.setMonth(proximoPago.getMonth() + 3);
            break;
        case 'semestral':
            proximoPago.setMonth(proximoPago.getMonth() + 6);
            break;
        case 'anual':
        default:
            proximoPago.setFullYear(proximoPago.getFullYear() + 1);
            break;
    }
    
    return proximoPago;
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
        const polizas = await Poliza.find(filtroBase);

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
        
        if (!poliza.pagos || poliza.pagos.length <= pagoIndex) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        
        // Eliminar pago del array
        poliza.pagos.splice(pagoIndex, 1);
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
        
        const { enviarEmail } = require('../services/notificationService');
        const Notificacion = require('../models/Notificacion');
        
        await enviarEmail({ 
            empresaId, 
            destinatario, 
            asunto, 
            cuerpo: `<p>${mensaje}</p>` 
        });
        
        // Guardar log de notificación
        const logNotificacion = new Notificacion({ 
            empresaId, 
            polizaId: poliza._id, 
            tipo: 'recordatorio_pago', 
            canal: 'email', 
            destinatario, 
            mensaje 
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

// ENDPOINT: Renovar póliza (crear nueva póliza y marcar antigua como renovada)
const renovarPoliza = async (req, res) => {
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
                return res.status(400).json({ error: 'No se pudo procesar el PDF', details: pdfError.message });
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

            // Validar que se hayan extraído las fechas
            if (!datosExtraidos.fechaInicio || !datosExtraidos.fechaVencimiento) {
                console.log('[RENOVAR] Error: No se pudieron extraer las fechas del PDF');
                return res.status(400).json({ error: 'No se pudieron extraer las fechas del PDF. Intenta la carga manual.' });
            }

            // Convertir fechas de DD/MM/YYYY a objetos Date
            const convertirFecha = (fechaStr) => {
                if (!fechaStr) return null;
                const meses = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
                const partes = fechaStr.toLowerCase().split('/');
                if (partes.length === 3) {
                    const dia = partes[0].padStart(2, '0');
                    const mes = meses[partes[1].substring(0, 3)] || '01';
                    return new Date(`${partes[2]}-${mes}-${dia}`);
                }
                return null;
            };

            // Mapear datos extraídos con fallback de polizaAntigua
            datosNuevaPoliza = {
                numeroPoliza: datosExtraidos.numeroPoliza || polizaAntigua.numeroPoliza,
                cliente: polizaAntigua.cliente, // Mantener el cliente de la póliza antigua
                clienteEmail: polizaAntigua.clienteEmail,
                clienteTelefono: polizaAntigua.clienteTelefono,
                tipoPago: polizaAntigua.tipoPago,
                tipoSeguro: datosExtraidos.tipoSeguro || polizaAntigua.tipoSeguro,
                aseguradora: datosExtraidos.aseguradora || polizaAntigua.aseguradora,
                inciso: datosExtraidos.inciso || polizaAntigua.inciso,
                paquete: datosExtraidos.paquete || polizaAntigua.paquete,
                primaTotal: datosExtraidos.primaTotal || polizaAntigua.primaTotal,
                primerPago: polizaAntigua.primerPago,
                montoAbono: polizaAntigua.montoAbono,
                fechas: {
                    inicio: convertirFecha(datosExtraidos.fechaInicio),
                    vencimiento: convertirFecha(datosExtraidos.fechaVencimiento)
                }
            };
        } else {
            // ESCENARIO B: Carga manual desde req.body
            const {
                numeroPoliza,
                fechas,
                primaTotal,
                tipoPago,
                primerPago,
                montoAbono,
                tipoSeguro,
                aseguradora,
                inciso,
                paquete
            } = req.body;

            datosNuevaPoliza = {
                numeroPoliza: numeroPoliza || polizaAntigua.numeroPoliza,
                fechas: fechas || polizaAntigua.fechas,
                primaTotal: primaTotal || polizaAntigua.primaTotal,
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

        // HISTORIAL: Crear nueva póliza con los mismos datos del cliente
        const nuevaPoliza = new Poliza({
            empresaId,
            asesorId,
            clienteId: polizaAntigua.clienteId, // Mantener el mismo clienteId si existe
            ...datosNuevaPoliza,
            estado: 'Activa',
            proximoPago: datosNuevaPoliza.fechas?.inicio || new Date()
        });

        await nuevaPoliza.save();

        // ESTADO LEGACY: Actualizar póliza antigua a 'Renovada'
        polizaAntigua.estado = 'Renovada';
        await polizaAntigua.save();

        res.status(201).json({
            message: 'Póliza renovada exitosamente',
            polizaAntigua: {
                id: polizaAntigua._id,
                estado: polizaAntigua.estado
            },
            nuevaPoliza
        });
    } catch (error) {
        console.error('[renovarPoliza] Error:', error);

        // Manejo de error de llave duplicada
        if (error.code === 11000) {
            return res.status(400).json({
                error: 'Ya existe una póliza activa con este número en el sistema. Si la aseguradora mantuvo el mismo número para la renovación, por favor agrégale un sufijo (ej. -01) al número de póliza.'
            });
        }

        res.status(500).json({ error: 'Error al renovar póliza', details: error.message });
    }
};

module.exports = {
    crearPoliza,
    obtenerPolizas,
    obtenerPolizaPorId,
    actualizarPoliza,
    eliminarPoliza,
    obtenerPapelera,
    restaurarPoliza,
    eliminarDefinitivamente,
    registrarPago,
    enviarRecordatorioManual,
    obtenerMetricasSeguros,
    obtenerEventosAgenda,
    migrarFechasAgenda,
    renovarPago,
    eliminarPago,
    actualizarProximoPago,
    enviarRecordatorioCorreo,
    renovarPoliza
};
