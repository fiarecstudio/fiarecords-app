const Cliente = require('../models/Cliente');
const Empresa = require('../models/Empresa');
const Poliza = require('../models/Poliza');

// Crear un nuevo cliente
const crearCliente = async (req, res) => {
    try {
        const { nombre, rfc, email, telefono, direccion } = req.body;
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Validar que la empresa tenga el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        // Validar campos requeridos
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
        }

        // Crear nuevo cliente
        const nuevoCliente = new Cliente({
            empresaId,
            asesorId,
            nombre,
            rfc: rfc || '',
            email: email || '',
            telefono: telefono || '',
            direccion: direccion || ''
        });

        await nuevoCliente.save();

        res.status(201).json({
            message: 'Cliente creado exitosamente',
            cliente: nuevoCliente
        });
    } catch (error) {
        console.error('[crearCliente] Error:', error);
        res.status(500).json({ error: 'Error al crear cliente', details: error.message });
    }
};

// Obtener todos los clientes con sus pólizas asociadas
const obtenerClientes = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Validar que la empresa tenga el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        // Construir filtro base
        const filtro = { empresaId, deletedAt: null };
        
        // RBAC: Si no es admin, filtrar por asesorId
        if (userRole !== 'admin') {
            filtro.asesorId = asesorId;
        }

        // Obtener clientes
        const clientes = await Cliente.find(filtro).sort({ nombre: 1 });

        // Para cada cliente, buscar sus pólizas asociadas
        const clientesConPolizas = await Promise.all(
            clientes.map(async (cliente) => {
                const polizas = await Poliza.find({
                    empresaId,
                    clienteId: cliente._id,
                    deletedAt: null
                }).sort({ 'fechas.vencimiento': -1 });

                return {
                    ...cliente.toObject(),
                    polizas: polizas
                };
            })
        );

        res.json({
            success: true,
            clientes: clientesConPolizas
        });
    } catch (error) {
        console.error('[obtenerClientes] Error:', error);
        res.status(500).json({ error: 'Error al obtener clientes', details: error.message });
    }
};

// Migración temporal: Vincular pólizas históricas con clientes
const migrarClientesHistoricos = async (req, res) => {
    try {
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Validar que la empresa tenga el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        // Buscar todas las pólizas de la empresa sin clienteId
        const polizasSinCliente = await Poliza.find({
            empresaId,
            deletedAt: null,
            $or: [
                { clienteId: { $exists: false } },
                { clienteId: null }
            ]
        });

        if (polizasSinCliente.length === 0) {
            return res.json({
                message: 'No hay pólizas pendientes de migración',
                clientesCreados: 0,
                polizasActualizadas: 0
            });
        }

        // Agrupar pólizas por nombre de cliente (campo texto)
        const polizasPorNombre = {};
        polizasSinCliente.forEach(poliza => {
            const nombreCliente = poliza.cliente;
            if (!nombreCliente) return;

            if (!polizasPorNombre[nombreCliente]) {
                polizasPorNombre[nombreCliente] = [];
            }
            polizasPorNombre[nombreCliente].push(poliza);
        });

        let clientesCreados = 0;
        let polizasActualizadas = 0;

        // Procesar cada grupo de pólizas por nombre
        for (const nombreCliente in polizasPorNombre) {
            const polizasGrupo = polizasPorNombre[nombreCliente];

            // Buscar si ya existe un Cliente con ese nombre en la empresa
            let cliente = await Cliente.findOne({
                empresaId,
                nombre: nombreCliente,
                deletedAt: null
            });

            // Si no existe, crear nuevo Cliente
            if (!cliente) {
                // Usar asesorId del admin o de la primera póliza del grupo
                const asesorAsignado = userRole === 'admin' ? asesorId : polizasGrupo[0].asesorId;

                cliente = new Cliente({
                    empresaId,
                    asesorId: asesorAsignado,
                    nombre: nombreCliente,
                    rfc: '',
                    email: '',
                    telefono: '',
                    direccion: ''
                });

                await cliente.save();
                clientesCreados++;
            }

            // Actualizar todas las pólizas del grupo con el clienteId
            await Poliza.updateMany(
                {
                    _id: { $in: polizasGrupo.map(p => p._id) }
                },
                {
                    $set: { clienteId: cliente._id }
                }
            );

            polizasActualizadas += polizasGrupo.length;
        }

        res.json({
            message: 'Migración completada exitosamente',
            clientesCreados,
            polizasActualizadas
        });
    } catch (error) {
        console.error('[migrarClientesHistoricos] Error:', error);
        res.status(500).json({ error: 'Error al migrar clientes históricos', details: error.message });
    }
};

// Actualizar un cliente existente
const actualizarCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, rfc, email, telefono, direccion } = req.body;
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Validar que la empresa tenga el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        // Buscar el cliente
        const cliente = await Cliente.findOne({ _id: id, empresaId, deletedAt: null });
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // RBAC: Si no es admin, verificar que el cliente pertenezca al asesor
        if (userRole !== 'admin' && cliente.asesorId.toString() !== asesorId.toString()) {
            return res.status(403).json({ error: 'No tienes permiso para editar este cliente' });
        }

        // Actualizar campos
        if (nombre) cliente.nombre = nombre;
        if (rfc !== undefined) cliente.rfc = rfc;
        if (email !== undefined) cliente.email = email;
        if (telefono !== undefined) cliente.telefono = telefono;
        if (direccion !== undefined) cliente.direccion = direccion;

        await cliente.save();

        res.json({
            message: 'Cliente actualizado exitosamente',
            cliente
        });
    } catch (error) {
        console.error('[actualizarCliente] Error:', error);
        res.status(500).json({ error: 'Error al actualizar cliente', details: error.message });
    }
};

// Eliminar un cliente (soft delete)
const eliminarCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = req.user.empresaId;
        const asesorId = req.user._id || req.user.id;
        const userRole = req.user.role;

        // Validar que la empresa tenga el módulo de seguros activado
        const empresa = await Empresa.findById(empresaId);
        if (!empresa) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        if (!empresa.moduloSeguros) {
            return res.status(403).json({ error: 'El módulo de seguros no está activado para esta empresa' });
        }

        // Buscar el cliente
        const cliente = await Cliente.findOne({ _id: id, empresaId, deletedAt: null });
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // RBAC: Si no es admin, verificar que el cliente pertenezca al asesor
        if (userRole !== 'admin' && cliente.asesorId.toString() !== asesorId.toString()) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar este cliente' });
        }

        // Soft delete
        cliente.deletedAt = new Date();
        await cliente.save();

        res.json({
            message: 'Cliente eliminado exitosamente'
        });
    } catch (error) {
        console.error('[eliminarCliente] Error:', error);
        res.status(500).json({ error: 'Error al eliminar cliente', details: error.message });
    }
};

module.exports = {
    crearCliente,
    obtenerClientes,
    migrarClientesHistoricos,
    actualizarCliente,
    eliminarCliente
};
