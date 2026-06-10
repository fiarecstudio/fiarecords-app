const mongoose = require('mongoose');
const Poliza = require('../models/Poliza');
const Cliente = require('../models/Cliente');
require('dotenv').config();

async function migrarContactos() {
    try {
        console.log('[Migración] Conectando a MongoDB...');
        const mongooseOptions = {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10
        };
        await mongoose.connect(process.env.MONGO_URI, mongooseOptions);
        console.log('[Migración] Conectado a MongoDB');

        console.log('[Migración] Buscando pólizas con clienteId y datos de contacto...');
        const polizas = await Poliza.find({
            clienteId: { $exists: true, $ne: null },
            $or: [
                { clienteEmail: { $exists: true, $ne: null, $ne: '' } },
                { clienteTelefono: { $exists: true, $ne: null, $ne: '' } }
            ]
        });

        console.log(`[Migración] Se encontraron ${polizas.length} pólizas con datos de contacto`);

        let actualizados = 0;
        let sinCambios = 0;

        for (const poliza of polizas) {
            const cliente = await Cliente.findById(poliza.clienteId);
            
            if (!cliente) {
                console.log(`[Migración] Cliente no encontrado para póliza ${poliza.numeroPoliza}`);
                continue;
            }

            let necesitaActualizacion = false;

            // Migrar email si el cliente no tiene y la póliza sí
            if (!cliente.email && poliza.clienteEmail) {
                cliente.email = poliza.clienteEmail;
                necesitaActualizacion = true;
                console.log(`[Migración] Migrando email para cliente ${cliente.nombre}: ${poliza.clienteEmail}`);
            }

            // Migrar teléfono si el cliente no tiene y la póliza sí
            if (!cliente.telefono && poliza.clienteTelefono) {
                cliente.telefono = poliza.clienteTelefono;
                necesitaActualizacion = true;
                console.log(`[Migración] Migrando teléfono para cliente ${cliente.nombre}: ${poliza.clienteTelefono}`);
            }

            if (necesitaActualizacion) {
                await cliente.save();
                actualizados++;
                console.log(`[Migración] Cliente ${cliente.nombre} actualizado correctamente`);
            } else {
                sinCambios++;
                console.log(`[Migración] Cliente ${cliente.nombre} ya tiene datos de contacto, no se actualizó`);
            }
        }

        console.log('[Migración] ========================================');
        console.log(`[Migración] Migración completada:`);
        console.log(`[Migración] - Clientes actualizados: ${actualizados}`);
        console.log(`[Migración] - Sin cambios: ${sinCambios}`);
        console.log('[Migración] ========================================');

        process.exit(0);
    } catch (error) {
        console.error('[Migración] Error:', error);
        process.exit(1);
    }
}

migrarContactos();
