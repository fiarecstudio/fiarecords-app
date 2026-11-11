require('dotenv').config();

const mongoose = require('mongoose');
const Poliza = require('../models/Poliza');
const { encrypt, isEncrypted } = require('../utils/cryptoHelper');

async function migratePolizaCardReferences() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI debe configurarse antes de ejecutar la migración.');
    }

    encrypt('encryption-key-check');
    await mongoose.connect(process.env.MONGO_URI);

    let migrated = 0;
    let alreadyEncrypted = 0;
    const cursor = Poliza.find({
        datosTarjeta: { $exists: true, $nin: ['', null] }
    }).select('+datosTarjeta').lean().cursor();

    try {
        for await (const poliza of cursor) {
            if (isEncrypted(poliza.datosTarjeta)) {
                alreadyEncrypted++;
                continue;
            }

            const encryptedReference = encrypt(poliza.datosTarjeta);
            const result = await Poliza.updateOne(
                { _id: poliza._id, datosTarjeta: poliza.datosTarjeta },
                { $set: { datosTarjeta: encryptedReference } }
            );
            if (result.modifiedCount === 1) migrated++;
        }
    } finally {
        await cursor.close();
        await mongoose.disconnect();
    }

    console.info(`[Migración referencias] Cifradas: ${migrated}; ya cifradas: ${alreadyEncrypted}.`);
}

migratePolizaCardReferences().catch(error => {
    console.error('[Migración referencias] Falló:', error.message);
    process.exitCode = 1;
});
