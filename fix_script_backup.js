const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// Buscar y reemplazar el código corrupto
const corruptPattern = /\/\/ ==========================================\r?\n    \/\/ FUNCIONES PARA GESTIÓN DE BACKUPS\r?\n    \/\/ ==========================================\r?\n            tablePagination\.cotizaciones\.page = 1;\r?\n            renderCotizacionesTable\(\);\r?\n        \} catch \(e\) \{ \r?\n            tablaBody\.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar\.<\/td><\/tr>`; \r?\n        \} \r?\n    \}/;

if (corruptPattern.test(content)) {
    console.log('Patrón corrupto encontrado. Reparando...');
    
    const replacement = `// ==========================================
    // FUNCIONES PARA GESTIÓN DE BACKUPS
    // ==========================================
    
    async function cargarBackups() {
        const tablaBody = document.getElementById('tabla-backups-body');
        tablaBody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>';
        
        try {
            const data = await fetchAPI('/api/backups');
            
            if (!data.backups || data.backups.length === 0) {
                tablaBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay backups disponibles. Crea uno primero.</td></tr>';
                return;
            }
            
            // Agrupar backups por fecha
            const backupsPorFecha = {};
            data.backups.forEach(b => {
                if (!backupsPorFecha[b.fecha]) backupsPorFecha[b.fecha] = [];
                backupsPorFecha[b.fecha].push(b);
            });
            
            // Ordenar fechas de más reciente a más antigua
            const fechas = Object.keys(backupsPorFecha).sort().reverse();
            
            tablaBody.innerHTML = fechas.map(fecha => {
                const backups = backupsPorFecha[fecha];
                const fechaFormateada = fecha.replace(/_/g, ' ').replace(/-/g, '/');
                
                return backups.map(b => \`
                    <tr>
                        <td><span class="badge bg-info">\${b.coleccion}</span></td>
                        <td><small>\${fechaFormateada}</small></td>
                        <td><small>\${b.tamano}</small></td>
                        <td class="text-end">
                            <a href="/api/backups/descargar/\${b.nombre}" 
                               class="btn btn-sm btn-outline-success" 
                               download="\${b.nombre}">
                                <i class="bi bi-download"></i> Descargar
                            </a>
                        </td>
                    </tr>
                \`).join('');
            }).join('');
            
            showToast(\`\${data.total} backups cargados\`, 'success');
            
        } catch (e) {
            tablaBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar backups</td></tr>';
            showToast('Error al cargar backups', 'error');
        }
    }
    
    async function crearBackupManual() {
        try {
            const btn = document.querySelector('button[onclick="app.crearBackupManual()"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Creando...';
            btn.disabled = true;
            
            await fetchAPI('/api/backups/crear', { method: 'POST' });
            
            showToast('Backup creado exitosamente', 'success');
            await cargarBackups(); // Recargar la lista
            
        } catch (e) {
            showToast('Error al crear backup', 'error');
        } finally {
            const btn = document.querySelector('button[onclick="app.crearBackupManual()"]');
            if (btn) {
                btn.innerHTML = '<i class="bi bi-plus-circle"></i> Crear Backup Ahora';
                btn.disabled = false;
            }
        }
    }
    
    // ==========================================
    // FIN FUNCIONES BACKUPS
    // ==========================================
    
    async function cargarCotizaciones() { 
        const tablaBody = document.getElementById('tablaCotizacionesBody'); 
        tablaBody.innerHTML = \`<tr><td colspan="4">Cargando cotizaciones...</td></tr>\`; 
        try { 
            cotizacionesCacheadas = await fetchAPI('/api/proyectos/cotizaciones'); 
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        } catch (e) { 
            tablaBody.innerHTML = \`<tr><td colspan="4" class="text-center text-danger">Error al cargar.</td></tr>\`; 
        } 
    }`;
    
    content = content.replace(corruptPattern, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Reparación aplicada exitosamente.');
} else {
    console.log('Patrón no encontrado.');
}
