require('dotenv').config();
const mongoose = require('mongoose');
const Poliza = require('./models/Poliza');

const uri = process.env.MONGO_URI || process.env.DB_MONGO;

mongoose.connect(uri).then(async () => {
    console.log('Restableciendo los días de gracia de todas las pólizas a 30...');
    const resultado = await Poliza.updateMany({}, { $set: { diasGracia: 30 } });
    console.log(`Listo. Pólizas actualizadas: ${resultado.modifiedCount}.`);
    await mongoose.disconnect();
}).catch(async err => {
    console.error('Error al restablecer los días de gracia:', err);
    await mongoose.disconnect();
    process.exitCode = 1;
});
