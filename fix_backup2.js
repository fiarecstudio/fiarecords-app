const fs = require('fs');
const path = 'c:/Users/recep/Documents/FiaRecords_Servidor_NUEVA VERSION 27 MZO/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_NUEVA VERSION/FiaRecords_Servidor_Final/script.js';

let content = fs.readFileSync(path, 'utf8');

// El código corrupto - buscar el patrón específico
const corruptPattern = /async function cargarBackups\(\) \{\r?\n        const tablaBody = document\.getElementById\('tabla-backups-body'\);\r?\n        tablaBody\.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"><\/div> Cargando\.\.\.<\/td><\/tr>';\r?\n            const originalText = btn\.innerHTML;\r?\n            btn\.innerHTML = '<i class="bi bi-hourglass-split"><\/i> Creando\.\.\.';\r?\n            btn\.disabled = true;\r?\n            \r?\n            await fetchAPI\('\/api\/backups\/crear', \{ method: 'POST' \}\);\r?\n            \r?\n            showToast\('Backup creado exitosamente', 'success'\);\r?\n            await cargarBackups\(\); \/\/ Recargar la lista\r?\n            \r?\n        \} catch \(e\) \{\r?\n            showToast\('Error al crear backup', 'error'\);\r?\n        \} finally \{\r?\n            const btn = document\.querySelector\('button\[onclick="app\.crearBackupManual\(\)"\]'\);\r?\n            if \(btn\) \{\r?\n                btn\.innerHTML = '<i class="bi bi-plus-circle"><\/i> Crear Backup Ahora';\r?\n                btn\.disabled = false;\r?\n            \}\r?\n        \}\r?\n    \}/;

if (corruptPattern.test(content)) {
    console.log('Patrón corrupto encontrado. Reparando...');
    
    const replacement = `async function cargarBackups() {
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
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="app.descargarBackup('\${b.nombre}')">
                                <i class="bi bi-download"></i> Descargar
                            </button>
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
    }`;
    
    content = content.replace(corruptPattern, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Reparación aplicada exitosamente.');
} else {
    console.log('Patrón no encontrado.');
}
