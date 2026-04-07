const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// Buscar y reemplazar el patrón roto
const searchPattern = /        if \(items\.length === 0\) \{\r?\n    async function reimprimirRecibo/g;

if (searchPattern.test(content)) {
    console.log('Patrón encontrado! Reemplazando...');
    
    const replacement = `        if (items.length === 0) {
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
    
    content = content.replace(searchPattern, replacement);
    
    fs.writeFileSync(path, content, 'utf8');
    console.log('Archivo reparado exitosamente!');
} else {
    console.log('Patrón no encontrado.');
}
