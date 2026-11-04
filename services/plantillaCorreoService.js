const sanitizeHtml = require('sanitize-html');

const HTML_OPTIONS = {
    allowedTags: [
        'a', 'b', 'blockquote', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'hr',
        'i', 'li', 'ol', 'p', 'span', 'strong', 'u', 'ul'
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        '*': ['style']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
    }
};

function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caracter]);
}

function obtenerMesAnterior() {
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() - 1);
    const mesAnterior = fecha.toLocaleString('es-MX', { month: 'long' });
    return mesAnterior.charAt(0).toUpperCase() + mesAnterior.slice(1);
}

function interpolar(texto, valores, escaparValores) {
    return String(texto || '').replace(
        /{{\s*(CLIENTE|POLIZA|MONTO|ASEGURADORA|MES_ANTERIOR)\s*}}/gi,
        (coincidencia, clave) => {
            const valor = clave.toUpperCase() === 'MES_ANTERIOR'
                ? (valores.MES_ANTERIOR ?? obtenerMesAnterior())
                : (valores[clave.toUpperCase()] ?? '');
            return escaparValores ? escaparHtml(valor) : String(valor);
        }
    );
}

function renderizarPlantillaCorreo(plantilla, valores = {}) {
    return {
        asunto: interpolar(plantilla?.asunto, valores, false).replace(/[\r\n]+/g, ' ').trim(),
        cuerpo: sanitizeHtml(interpolar(plantilla?.cuerpo, valores, true), HTML_OPTIONS)
    };
}

function sanitizarCuerpoCorreo(cuerpo) {
    return sanitizeHtml(String(cuerpo || ''), HTML_OPTIONS);
}

module.exports = {
    renderizarPlantillaCorreo,
    sanitizarCuerpoCorreo
};
