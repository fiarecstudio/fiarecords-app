const Poliza = require('../models/Poliza');

const crearPoliza = async (req, res) => {
    try {
        const { numeroPoliza, cliente, tipoSeguro, aseguradora, fechas, primaTotal, documentoDriveId } = req.body;
        
        // Inyectar empresaId del usuario autenticado
        const empresaId = req.user.empresaId;
        
        const nuevaPoliza = new Poliza({
            empresaId,
            numeroPoliza,
            cliente,
            tipoSeguro,
            aseguradora,
            fechas,
            primaTotal,
            documentoDriveId
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
        
        // Filtrar estrictamente por empresaId (multi-tenant)
        const polizas = await Poliza.find({ empresaId });
        
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
        
        // Buscar y actualizar, asegurando que pertenezca al empresaId
        const poliza = await Poliza.findOneAndUpdate(
            { _id: id, empresaId },
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
        
        // Buscar y eliminar, asegurando que pertenezca al empresaId
        const poliza = await Poliza.findOneAndDelete({ _id: id, empresaId });
        
        if (!poliza) {
            return res.status(404).json({ error: 'Póliza no encontrada o no pertenece a tu empresa' });
        }
        
        res.json({ message: 'Póliza eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar póliza:', error);
        res.status(500).json({ error: 'Error al eliminar la póliza', details: error.message });
    }
};

module.exports = {
    crearPoliza,
    obtenerPolizas,
    actualizarPoliza,
    eliminarPoliza
};
