const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// Encontrar la línea que contiene el patrón roto
const lines = content.split(/\r?\n/);
let foundLine = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'if (items.length === 0) {' && 
        lines[i + 1] && 
        lines[i + 1].includes('async function reimprimirRecibo')) {
        foundLine = i;
        console.log('Encontrado en línea:', i + 1);
        console.log('Línea actual:', lines[i]);
        console.log('Siguiente línea (inicio):', lines[i + 1].substring(0, 80) + '...');
        break;
    }
}

if (foundLine >= 0) {
    console.log('\nReparando archivo...');
    
    // Crear el reemplazo
    const newCode = `if (items.length === 0) {
            tablaBody.innerHTML = \`<tr><td colspan="5" class="text-center">No hay pagos registrados en el historial.</td></tr>\`;
            renderTableControls('tablaPagosBody', 'pagosHistorial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => {
            let buttons = \`<button class="btn btn-sm btn-outline-secondary" title="Reimprimir Recibo" onclick="app.reimprimirRecibo('\${p.proyectoId}', '\${p.pagoId}')"><i class="bi bi-file-earmark-pdf"></i></button>\`;
            buttons += \`<button class="btn btn-sm btn-outline-success" title="Enviar por WhatsApp" onclick="app.enviarReciboWhatsApp('\${p.proyectoId}', '\${p.pagoId}')"><i class="bi bi-whatsapp"></i></button>\`;
            buttons += \`<button class="btn btn-sm btn-outline-primary" title="Enviar por Correo" onclick="app.enviarReciboCorreo('\${p.proyectoId}', '\${p.pagoId}')"><i class="bi bi-envelope"></i></button>\`;
            if (!isClient) {
                buttons += \`<button class="btn btn-sm btn-outline-danger" title="Eliminar Pago" onclick="app.eliminarPago('\${p.proyectoId}', '\${p.pagoId}')"><i class="bi bi-trash"></i></button>\`;
            }
            return \`<tr><td data-label="Fecha">\${safeDate(p.fecha)}</td><td data-label="Proyecto">\${escapeHTML(p.artista)}</td><td data-label="Monto">$\${safeMoney(p.monto)}</td><td data-label="Método">\${escapeHTML(p.metodo)}</td><td data-label="Acciones" class="table-actions">\${buttons}</td></tr>\`;
        }).join('');

        renderTableControls('tablaPagosBody', 'pagosHistorial', page, totalPages);
    }

    async function reimprimirRecibo`;
    
    // Reemplazar
    const oldPattern = lines[foundLine] + '\n' + lines[foundLine + 1];
    content = content.replace(oldPattern, newCode);
    
    fs.writeFileSync(path, content, 'utf8');
    console.log('Archivo reparado exitosamente!');
} else {
    console.log('No se encontró el patrón. Verificando archivo...');
}
