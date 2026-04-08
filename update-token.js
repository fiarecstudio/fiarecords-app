/**
 * Script para actualizar el GMAIL_REFRESH_TOKEN en el archivo .env
 * Uso: node update-token.js <nuevo_token>
 * Ejemplo: node update-token.js 1//04xkGbImyxGluCgYIARAAGAQSNwF...
 */

const fs = require('fs');
const path = require('path');

// Tomar el token desde argumentos de línea de comandos o variable de entorno
const NUEVO_REFRESH_TOKEN = process.argv[2] || process.env.NUEVO_REFRESH_TOKEN;

if (!NUEVO_REFRESH_TOKEN) {
    console.error('❌ Error: Debes proporcionar el nuevo token');
    console.log('');
    console.log('Uso:');
    console.log('  node update-token.js "1//04xkGbImyxGluCgYIARAAGAQSNwF-L9IrNWnCikr..."');
    console.log('');
    console.log('O establece la variable de entorno NUEVO_REFRESH_TOKEN');
    process.exit(1);
}

const envPath = path.join(__dirname, '.env');

try {
    // Leer el archivo .env actual
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Buscar y reemplazar la línea del refresh_token
    const lines = content.split('\n');
    let tokenActualizado = false;
    
    const newLines = lines.map(line => {
        if (line.startsWith('GMAIL_REFRESH_TOKEN=')) {
            tokenActualizado = true;
            return `GMAIL_REFRESH_TOKEN=${NUEVO_REFRESH_TOKEN}`;
        }
        return line;
    });
    
    // Si no encontró la línea, agregarla al final
    if (!tokenActualizado) {
        newLines.push(`GMAIL_REFRESH_TOKEN=${NUEVO_REFRESH_TOKEN}`);
    }
    
    // Guardar el archivo
    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
    
    console.log('✅ GMAIL_REFRESH_TOKEN actualizado correctamente');
    console.log('');
    console.log('⚠️  IMPORTANTE: Reinicia el servidor para aplicar los cambios');
    console.log('   Presiona Ctrl+C para detener, luego npm run dev');
    
} catch (error) {
    console.error('❌ Error actualizando .env:', error.message);
    console.log('');
    console.log('Por favor, actualiza manualmente tu archivo .env:');
    console.log('GMAIL_REFRESH_TOKEN=' + NUEVO_REFRESH_TOKEN);
}