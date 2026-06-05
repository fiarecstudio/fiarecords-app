// Script para actualizar empresa a modo seguros
// Ejecutar con: node scripts/actualizar_empresa_seguros.js

const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');

// Configuración de conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fiarecords';

async function actualizarEmpresa() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado a MongoDB');

        // Buscar la empresa por nombre o ID
        // CAMBIAR ESTO: Reemplaza con el nombre o ID de tu empresa
        const nombreEmpresa = 'NOMBRE_DE_TU_EMPRESA'; // O usa el ID: const empresaId = 'ID_DE_TU_EMPRESA';
        
        const empresa = await Empresa.findOne({ nombre: nombreEmpresa });
        
        if (!empresa) {
            console.log('No se encontró la empresa con nombre:', nombreEmpresa);
            console.log('Empresas disponibles:');
            const empresas = await Empresa.find({});
            empresas.forEach(e => console.log(`- ${e.nombre} (ID: ${e._id})`));
            process.exit(1);
        }

        console.log('Empresa encontrada:', empresa.nombre);
        console.log('Configuración actual:');
        console.log('- moduloSeguros:', empresa.moduloSeguros);
        console.log('- tipoDashboard:', empresa.tipoDashboard);

        // Actualizar configuración
        empresa.moduloSeguros = true;
        empresa.tipoDashboard = 'seguros';
        
        await empresa.save();
        
        console.log('Empresa actualizada exitosamente:');
        console.log('- moduloSeguros:', empresa.moduloSeguros);
        console.log('- tipoDashboard:', empresa.tipoDashboard);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

actualizarEmpresa();
