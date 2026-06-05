const Poliza = require('../models/Poliza');

const crearPoliza = async (req, res) => {
    try {
        const { numeroPoliza, cliente, clienteEmail, clienteTelefono, tipoPago, tipoSeguro, aseguradora, fechas, primaTotal, documentoDriveId, inciso, paquete, montoAbono, primerPago, diasAnticipacionAviso } = req.body;
        
        // Inyectar empresaId del usuario autenticado
        const empresaId = req.user.empresaId;
        
        const nuevaPoliza = new Poliza({
            empresaId,
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
            saldoRestante: primaTotal // Inicializar saldoRestante con la prima total
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
        
        // Filtrar estrictamente por empresaId y solo pólizas no eliminadas (deletedAt: null)
        const polizas = await Poliza.find({ empresaId, deletedAt: null });
        
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
        const empresaId = req.user.empresaId;
        
        // Devolver solo pólizas eliminadas (deletedAt != null)
        const polizasEliminadas = await Poliza.find({ 
            empresaId, 
            deletedAt: { $ne: null } 
        }).sort({ deletedAt: -1 });
        
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
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        // 1. Pólizas Activas
        const activas = await Poliza.countDocuments({ empresaId, deletedAt: null });

        // 2. Pólizas Próximas a Vencer (dentro de los próximos 30 días)
        const unMesDespues = new Date(hoy);
        unMesDespues.setDate(unMesDespues.getDate() + 30);
        const porVencer = await Poliza.countDocuments({
            empresaId,
            deletedAt: null,
            "fechas.vencimiento": { $gte: hoy, $lte: unMesDespues }
        });

        // 3. Pagos Pendientes / Atrasados
        const pagosPendientes = await Poliza.countDocuments({
            empresaId,
            deletedAt: null,
            proximoPago: { $lt: hoy }
        });

        // 4. Monto Total Recaudado (Suma de todos los pagos registrados)
        const polizasConPagos = await Poliza.find({ empresaId, deletedAt: null });
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
    renovarPago,
    eliminarPago,
    actualizarProximoPago,
    enviarRecordatorioCorreo
};
