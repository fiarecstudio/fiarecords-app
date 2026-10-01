require('dotenv').config();
const mongoose = require('mongoose');
const Poliza = require('../models/Poliza');

async function runMigration() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        const indexes = await Poliza.collection.indexes();
        const uniqueReceiptIndex = indexes.find(index =>
            index.unique && index.key['recibos.numeroRecibo']
        );

        if (uniqueReceiptIndex) {
            await Poliza.collection.dropIndex(uniqueReceiptIndex.name);
            console.log(`[MIGRATION] Índice único ${uniqueReceiptIndex.name} eliminado.`);
        } else {
            console.log('[MIGRATION] No existe índice único global de número de recibo.');
        }
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    runMigration().catch(error => {
        console.error('[MIGRATION] Error al actualizar índice de recibos:', error);
        process.exitCode = 1;
    });
}

module.exports = { runMigration };