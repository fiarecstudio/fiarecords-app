const Pago = require('../models/Pago');
const Poliza = require('../models/Poliza');

// ==========================================
// CRUD BÁSICO DE PAGOS
// ==========================================

const obtenerPagos = async (req, res) => {
    try {
        const filtroEmpresa = req.tenantFilter || {};
        const filtroPagos = {
            ...filtroEmpresa,
            deletedAt: null
        };

        const pagos = await Pago.find(filtroPagos)
            .populate('polizaId', 'numeroPoliza cliente aseguradora')
            .sort({ fechaPago: -1 });

        res.json(pagos);
    } catch (error) {
        console.error('Error al obtener pagos:', error);
        res.status(500).json({ error: 'Error al obtener pagos', details: error.message });
    }
};

const obtenerPagoPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const filtroEmpresa = req.tenantFilter || {};

        const pago = await Pago.findOne({ 
            _id: id, 
            ...filtroEmpresa, 
            deletedAt: null 
        }).populate('polizaId', 'numeroPoliza cliente aseguradora');

        if (!pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        res.json(pago);
    } catch (error) {
        console.error('Error al obtener pago:', error);
        res.status(500).json({ error: 'Error al obtener pago', details: error.message });
    }
};

const crearPago = async (req, res) => {
    try {
        const { polizaId, monto, fechaPago, metodoPago, nota, estado } = req.body;
        const empresaId = req.user.empresaId;

        // Verificar que la póliza existe y pertenece a la empresa
        const poliza = await Poliza.findOne({ 
            _id: polizaId, 
            empresaId, 
            deletedAt: null 
        });

        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }

        // Crear nuevo pago
        const nuevoPago = new Pago({
            empresaId,
            polizaId,
            monto: parseFloat(monto),
            fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
            metodoPago: metodoPago || 'efectivo',
            nota: nota || '',
            estado: estado || 'pagado'
        });

        await nuevoPago.save();

        // Actualizar campos financieros de la póliza
        if (!poliza.saldoRestante || poliza.saldoRestante === 0) {
            poliza.saldoRestante = poliza.primaTotal;
        }

        poliza.saldoRestante -= parseFloat(monto);

        if (poliza.saldoRestante <= 0) {
            poliza.estadoPago = 'pagado_completo';
            poliza.saldoRestante = 0;
        } else {
            poliza.estadoPago = 'al_corriente';
        }

        await poliza.save();

        res.status(201).json({ message: 'Pago creado correctamente', pago: nuevoPago });
    } catch (error) {
        console.error('Error al crear pago:', error);
        res.status(500).json({ error: 'Error al crear pago', details: error.message });
    }
};

const actualizarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, fechaPago, metodoPago, nota, estado } = req.body;
        const empresaId = req.user.empresaId;

        const pago = await Pago.findOne({ 
            _id: id, 
            empresaId, 
            deletedAt: null 
        });

        if (!pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Actualizar campos
        if (monto !== undefined) pago.monto = parseFloat(monto);
        if (fechaPago !== undefined) pago.fechaPago = new Date(fechaPago);
        if (metodoPago !== undefined) pago.metodoPago = metodoPago;
        if (nota !== undefined) pago.nota = nota;
        if (estado !== undefined) pago.estado = estado;

        await pago.save();

        res.json({ message: 'Pago actualizado correctamente', pago });
    } catch (error) {
        console.error('Error al actualizar pago:', error);
        res.status(500).json({ error: 'Error al actualizar pago', details: error.message });
    }
};

const eliminarPago = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;

        const pago = await Pago.findOne({ 
            _id: id, 
            empresaId, 
            deletedAt: null 
        });

        if (!pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Soft delete
        pago.deletedAt = new Date();
        await pago.save();

        res.json({ message: 'Pago eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar pago:', error);
        res.status(500).json({ error: 'Error al eliminar pago', details: error.message });
    }
};

const obtenerPagosPorPoliza = async (req, res) => {
    try {
        const { polizaId } = req.params;
        const filtroEmpresa = req.tenantFilter || {};

        const pagos = await Pago.find({ 
            polizaId, 
            ...filtroEmpresa, 
            deletedAt: null 
        }).sort({ fechaPago: -1 });

        res.json(pagos);
    } catch (error) {
        console.error('Error al obtener pagos de póliza:', error);
        res.status(500).json({ error: 'Error al obtener pagos de póliza', details: error.message });
    }
};

module.exports = {
    obtenerPagos,
    obtenerPagoPorId,
    crearPago,
    actualizarPago,
    eliminarPago,
    obtenerPagosPorPoliza
};
