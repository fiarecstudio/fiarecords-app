const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// Agregar enviarReciboWhatsApp y enviarReciboCorreo después de reimprimirRecibo en window.app
const oldPattern = /reimprimirRecibo, compartirRecordatorioPago, eliminarPago,/;
const newPattern = 'reimprimirRecibo, enviarReciboWhatsApp, enviarReciboCorreo, compartirRecordatorioPago, eliminarPago,';

if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newPattern);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Funciones enviarReciboWhatsApp y enviarReciboCorreo agregadas a window.app');
} else {
    console.log('No se encontró el patrón de exportación');
}
