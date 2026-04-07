const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// Buscar el patrón corrupto donde las funciones están mezcladas
const patronCorrupto = /window\.open\(`https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(mensaje\)\}`, '_blank'\);\r?\n                return Swal\.fire/;

if (patronCorrupto.test(content)) {
    console.log('Patrón corrupto encontrado. Reparando...');
    
    const reemplazo = `window.open(\`https://wa.me/?text=\${encodeURIComponent(mensaje)}\`, '_blank');
        } catch (e) {
            alert('Error al abrir WhatsApp.');
        }
    }
    
    async function enviarReciboCorreo(proyectoId, pagoId) {
        try {
            const proyecto = await fetchAPI(\`/api/proyectos/\${proyectoId}\`);
            const pago = proyecto.pagos.find(p => p._id === pagoId);
            if (!pago) {
                return Swal.fire({ icon: 'error', title: 'Error', text: 'Pago no encontrado.' });
            }`;
    
    content = content.replace(patronCorrupto, reemplazo);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Reparación aplicada.');
} else {
    console.log('Patrón no encontrado. Verificando...');
}
