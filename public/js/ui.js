/**
 * FIA RECORDS - Módulo de Interfaz de Usuario (UI)
 * FASE 8 PASO 8 FASE 3: Extracción de lógica de renderizado
 * 
 * Este módulo centraliza:
 * - Renderizado de tablas (historial, cotizaciones, pagos)
 * - Renderizado de listas paginadas (artistas, servicios)
 * - Controles de paginación
 * - Renderizado de sidebar
 * - Funciones de utilidad UI
 * 
 * REGLA CRÍTICA: Tiene acceso a:
 * - window.fetchAPI (desde api.js)
 * - window.DriveManager (desde drive.js)
 * - window.showToast, window.getUserRoleAndId (desde script.js)
 * - Swal (SweetAlert global)
 */

(function() {
    'use strict';

    // ==================================================================
    // 1. UTILIDADES DE FORMATEO (replicadas para independencia)
    // ==================================================================

    function safeDate(dateStr) {
        if (!dateStr) return 'Sin fecha';
        try { return new Date(dateStr).toLocaleDateString(); } catch (e) { return 'Fecha inválida'; }
    }

    function safeMoney(amount) {
        if (typeof amount !== 'number') return '0.00';
        return amount.toFixed(2);
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    // ==================================================================
    // 2. RENDERIZADO DE TABLAS
    // ==================================================================

    /**
     * Renderiza la tabla de historial de proyectos
     */
    function renderHistorialTable(items, pagination, tableBodyId = 'tablaHistorialBody') {
        const tablaBody = document.getElementById(tableBodyId);
        if (!tablaBody) return;

        const { page = 1, limit = 10 } = pagination || {};
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">No hay proyectos.</td></tr>`;
            renderTableControls(tableBodyId, 'historial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => {
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General';
            const esCancelado = p.estatus === 'Cancelado';
            const estadoBadge = esCancelado
                ? `<span class="badge bg-secondary">Cancelado</span>`
                : `<span class="badge bg-success">Completado</span>`;
            const rowClass = esCancelado ? 'fila-cancelada' : '';
            const showPlayer = (p.archivos && p.archivos.length > 0) || (p.enlaceEntrega && p.enlaceEntrega.length > 0);

            return `
            <tr class="${rowClass}">
                <td data-label="Fecha">${safeDate(p.fecha)}</td>
                <td data-label="Artista" class="${p.artista ? 'clickable-artist' : ''}" 
                    ondblclick="app.irAVistaArtista('${p.artista ? p.artista._id : ''}', '${escapeHTML(artistaNombre)}', '')">
                    ${escapeHTML(artistaNombre)}
                </td>
                <td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Sin nombre')}</td>
                <td data-label="Total">$${safeMoney(p.total)}</td>
                <td data-label="Pagado">$${safeMoney(p.montoPagado)}</td>
                <td data-label="Estado">${estadoBadge}</td>
                <td data-label="Acciones" class="table-actions">
                    ${showPlayer ? `<button class="btn btn-sm btn-info text-white" title="Visor Multimedia" onclick="app.openPlayer('${p._id}')"><i class="bi bi-play-circle-fill"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-primary" title="Entrega / Drive" 
                        onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')">
                        <i class="bi bi-cloud-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="app.registrarPago('${p._id}', true)" title="Pagos">
                        <i class="bi bi-cash-stack"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${p._id}')" title="Mover a Papelera">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        renderTableControls(tableBodyId, 'historial', page, totalPages);
    }

    /**
     * Renderiza la tabla de cotizaciones
     */
    function renderCotizacionesTable(items, pagination, tableBodyId = 'tablaCotizacionesBody') {
        const tablaBody = document.getElementById(tableBodyId);
        if (!tablaBody) return;

        const { page = 1, limit = 10 } = pagination || {};
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">No hay cotizaciones activas.</td></tr>`;
            renderTableControls(tableBodyId, 'cotizaciones', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => {
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General';
            const servicios = Array.isArray(p.items) ? p.items : [];
            const serviciosTexto = servicios.length > 0
                ? servicios.slice(0, 2).map(s => s.nombre || 'Servicio').join(', ') + (servicios.length > 2 ? '...' : '')
                : 'Sin servicios';

            return `
            <tr>
                <td data-label="Fecha">${safeDate(p.fecha)}</td>
                <td data-label="Artista">${escapeHTML(artistaNombre)}</td>
                <td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Sin nombre')}</td>
                <td data-label="Servicios">${escapeHTML(serviciosTexto)}</td>
                <td data-label="Total">$${safeMoney(p.total)}</td>
                <td data-label="Estado">
                    <span class="badge bg-${p.estatus === 'Por Confirmar' ? 'warning' : 'info'}">${p.estatus}</span>
                </td>
                <td data-label="Acciones" class="table-actions">
                    <button class="btn btn-sm btn-success text-white" onclick="app.aceptarCotizacion('${p._id}')" title="Aceptar">
                        <i class="bi bi-check-lg"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary" onclick="app.editarCotizacion('${p._id}')" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${p._id}', true)" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        renderTableControls(tableBodyId, 'cotizaciones', page, totalPages);
    }

    /**
     * Renderiza la tabla de pagos pendientes
     */
    function renderPagosPendientesTable(items, pagination, tableBodyId = 'tablaPendientesBody') {
        const tabla = document.getElementById(tableBodyId);
        if (!tabla) return;

        const userInfo = typeof window.getUserRoleAndId === 'function' ? window.getUserRoleAndId() : { role: 'admin' };
        const esCliente = userInfo.role === 'cliente';

        const { page = 1, limit = 10 } = pagination || {};
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (!items || items.length === 0) {
            tabla.innerHTML = `<tr><td colspan="5" class="text-center">No hay pagos pendientes.</td></tr>`;
            renderTableControls(tableBodyId, 'pagosPendientes', 1, 0);
            return;
        }

        tabla.innerHTML = paginatedItems.map(p => {
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'N/A';
            const restante = p.total - (p.montoPagado || 0);
            const proyectoInfo = `
                <div class="fw-bold">${escapeHTML(p.nombreProyecto || 'Sin nombre')}</div>
                <small class="text-muted">${escapeHTML(artistaNombre)}</small><br>
                <small class="text-muted">${safeDate(p.fecha)}</small>
            `;

            return `
            <tr>
                <td data-label="Proyecto">${proyectoInfo}</td>
                <td data-label="Total">$${safeMoney(p.total)}</td>
                <td data-label="Pagado">$${safeMoney(p.montoPagado || 0)}</td>
                <td data-label="Restante" class="text-danger fw-bold">$${safeMoney(restante)}</td>
                <td data-label="Acciones" class="table-actions">
                    ${!esCliente ? `
                    <button class="btn btn-sm btn-success text-white" onclick="app.registrarPago('${p._id}')" title="Registrar Pago">
                        <i class="bi bi-cash-stack"></i> Cobrar
                    </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline-info" onclick="app.registrarPago('${p._id}')" title="Ver Detalle / Cobrar">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        renderTableControls(tableBodyId, 'pagosPendientes', page, totalPages);
    }

    /**
     * Renderiza la tabla de historial de pagos
     */
    function renderPagosHistorialTable(items, pagination, tableBodyId = 'tablaPagosBody') {
        const tablaBody = document.getElementById(tableBodyId);
        if (!tablaBody) return;

        const { page = 1, limit = 10 } = pagination || {};
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (!items || items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay pagos registrados.</td></tr>`;
            renderTableControls(tableBodyId, 'pagosHistorial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => {
            const displayName = p.artista || 'N/A';

            return `
            <tr>
                <td data-label="Fecha">${safeDate(p.fecha)}</td>
                <td data-label="Proyecto/Artista">${escapeHTML(displayName)}</td>
                <td data-label="Monto Pagado">$${safeMoney(p.monto || 0)}</td>
                <td data-label="Método">
                    <span class="badge bg-${getMetodoBadgeColor(p.metodo)}">${p.metodo || 'N/A'}</span>
                </td>
                <td data-label="Acciones" class="table-actions">
                    <button class="btn btn-sm btn-outline-info" onclick="app.verDetallePago('${p.proyectoId}', '${p.pagoId}')" title="Ver Detalle">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary" onclick="app.descargarRecibo('${p.proyectoId}', '${p.pagoId}')" title="Descargar Recibo">
                        <i class="bi bi-download"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        renderTableControls(tableBodyId, 'pagosHistorial', page, totalPages);
    }

    function getMetodoBadgeColor(metodo) {
        const colores = {
            'Efectivo': 'success',
            'Transferencia': 'primary',
            'Tarjeta': 'info',
            'Depósito': 'warning',
            'Crédito': 'danger'
        };
        return colores[metodo] || 'secondary';
    }

    // ==================================================================
    // 3. CONTROLES DE PAGINACIÓN
    // ==================================================================

    /**
     * Renderiza los controles de paginación para tablas
     */
    function renderTableControls(tableBodyId, listKey, page, totalPages) {
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;

        const tableEl = tbody.closest('table');
        if (!tableEl) return;

        let controls = tableEl.parentNode.querySelector('.pagination-controls');
        if (controls) controls.remove();

        if (totalPages <= 1) return;

        controls = document.createElement('div');
        controls.className = 'pagination-controls d-flex justify-content-between align-items-center mt-3';

        const prevDisabled = page <= 1 ? 'disabled' : '';
        const nextDisabled = page >= totalPages ? 'disabled' : '';

        controls.innerHTML = `
            <button class="btn btn-sm btn-outline-secondary" ${prevDisabled} onclick="window.app.changeTablePage('${listKey}', -1)">
                <i class="bi bi-chevron-left"></i> Anterior
            </button>
            <span class="text-muted small">Página ${page} de ${totalPages}</span>
            <button class="btn btn-sm btn-outline-secondary" ${nextDisabled} onclick="window.app.changeTablePage('${listKey}', 1)">
                Siguiente <i class="bi bi-chevron-right"></i>
            </button>
        `;

        tableEl.parentNode.insertBefore(controls, tableEl.nextSibling);
    }

    /**
     * Cambia la página de una tabla paginada
     */
    function changePage(listKey, direction) {
        const pagination = window.tablePagination?.[listKey];
        if (!pagination) return;

        const newPage = pagination.page + direction;
        if (newPage < 1 || newPage > Math.ceil(pagination.total / pagination.limit)) return;

        pagination.page = newPage;

        // Disparar re-renderizado
        const renderers = {
            'historial': () => renderHistorialTable(window.historialCacheados || [], pagination),
            'cotizaciones': () => renderCotizacionesTable(window.cotizacionesCacheadas || [], pagination),
            'pagos': () => renderPagosHistorialTable(window.pagosHistorialCacheados || [], pagination),
            'pagosPendientes': () => renderPagosPendientesTable(window.pagosPendientesCacheados || [], pagination),
            'pagosHistorial': () => renderPagosHistorialTable(window.pagosHistorialCacheados || [], pagination)
        };

        if (renderers[listKey]) {
            renderers[listKey]();
        }
    }

    // ==================================================================
    // 4. RENDERIZADO DE LISTAS PAGINADAS (Artistas, Servicios)
    // ==================================================================

    /**
     * Renderiza una lista paginada (artistas, servicios, usuarios)
     */
    async function renderPaginatedList(endpoint, filterText = null, page = 1, limit = 10) {
        const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        const listEl = document.getElementById(listId);
        if (!listEl) return;

        // Mostrar loading
        listEl.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando...</div>';

        try {
            let url = `/api/${endpoint}?page=${page}&limit=${limit}`;
            if (filterText) url += `&search=${encodeURIComponent(filterText)}`;

            const data = await window.fetchAPI(url);
            const items = data.items || data;
            const totalPages = data.totalPages || Math.ceil(data.length / limit);

            if (items.length === 0) {
                listEl.innerHTML = `<div class="text-center text-muted p-3">No hay ${endpoint} registrados.</div>`;
                return;
            }

            // Renderizar según el endpoint
            const renderers = {
                'artistas': renderArtistasList,
                'servicios': renderServiciosList,
                'usuarios': renderUsuariosList
            };

            if (renderers[endpoint]) {
                renderers[endpoint](items, listEl);
            }

            // Agregar controles de paginación
            renderPaginationControls(listEl, endpoint, page, totalPages, filterText);

        } catch (error) {
            listEl.innerHTML = `<div class="alert alert-danger">Error cargando ${endpoint}.</div>`;
        }
    }

    function renderArtistasList(artistas, container) {
        container.innerHTML = artistas.map(a => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${escapeHTML(a.nombreArtistico || a.nombre)}</strong>
                    <div class="small text-muted">${escapeHTML(a.nombre)} • ${a.telefono || 'Sin teléfono'}</div>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="app.abrirModalEditarArtista('${a._id}', '${escapeHTML(a.nombre)}', '${escapeHTML(a.nombreArtistico || '')}', '${a.telefono || ''}', '${a.correo || ''}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="app.eliminarArtista('${a._id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderServiciosList(servicios, container) {
        container.innerHTML = servicios.map(s => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${escapeHTML(s.nombre)}</strong>
                    <div class="small text-muted">$${safeMoney(s.precioBase || s.precio)} ${s.visible ? '' : '(Oculto)'}</div>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="app.abrirModalEditarServicio('${s._id}', '${escapeHTML(s.nombre)}', ${s.precioBase || s.precio}, ${s.visible || false})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="app.eliminarServicio('${s._id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderUsuariosList(usuarios, container) {
        container.innerHTML = usuarios.map(u => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${escapeHTML(u.username)}</strong>
                    <span class="badge bg-${u.role === 'admin' ? 'danger' : u.role === 'cliente' ? 'success' : 'primary'} ms-2">${u.role}</span>
                    <div class="small text-muted">${u.email || 'Sin email'}</div>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="app.abrirModalEditarUsuario('${u._id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="app.eliminarUsuario('${u._id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Renderiza controles de paginación para listas
     */
    function renderPaginationControls(container, endpoint, currentPage, totalPages, filterText = null) {
        let controls = container.parentNode.querySelector('.pagination-controls');
        if (controls) controls.remove();

        if (totalPages <= 1) return;

        controls = document.createElement('div');
        controls.className = 'pagination-controls d-flex justify-content-center align-items-center gap-2 mt-3';

        const prevDisabled = currentPage <= 1 ? 'disabled' : '';
        const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

        controls.innerHTML = `
            <button class="btn btn-sm btn-outline-secondary" ${prevDisabled} onclick="window.app.changePage('${endpoint}', -1)">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="text-muted small">${currentPage} / ${totalPages}</span>
            <button class="btn btn-sm btn-outline-secondary" ${nextDisabled} onclick="window.app.changePage('${endpoint}', 1)">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;

        container.parentNode.insertBefore(controls, container.nextSibling);
    }

    // ==================================================================
    // 5. RENDERIZADO DE SIDEBAR
    // ==================================================================

    /**
     * Renderiza el sidebar de navegación según el rol del usuario
     */
    function renderSidebar(user) {
        const navContainer = document.getElementById('sidebar-nav-container');
        if (!navContainer) return;

        const p = user.permisos || [];
        const role = user.role ? user.role.toLowerCase() : 'cliente';
        const isSuperAdmin = role === 'superadmin' || role === 'admin';

        let html = '';

        // Sección Principal
        html += `<div class="nav-group">
                    <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Principal</div>
                    ${isSuperAdmin || p.includes('dashboard') ? `<a class="nav-link-sidebar" data-seccion="dashboard"><i class="bi bi-speedometer2"></i> Dashboard</a>` : ''}
                    ${isSuperAdmin || p.includes('agenda') ? `<a class="nav-link-sidebar" data-seccion="agenda"><i class="bi bi-calendar-week"></i> Agenda</a>` : ''}
                    ${isSuperAdmin || p.includes('flujo-trabajo') ? `<a class="nav-link-sidebar" data-seccion="flujo-trabajo"><i class="bi bi-kanban"></i> Flujo de Trabajo</a>` : ''}
                 </div>`;

        // Sección Gestión
        if (isSuperAdmin || p.includes('gestion-artistas') || p.includes('gestion-servicios') || p.includes('cotizaciones')) {
            html += `<div class="nav-group">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Gestión</div>
                        ${isSuperAdmin || p.includes('cotizaciones') ? `<a class="nav-link-sidebar" data-seccion="cotizaciones"><i class="bi bi-file-text"></i> Cotizaciones</a>` : ''}
                        ${isSuperAdmin || p.includes('pagos') ? `<a class="nav-link-sidebar" data-seccion="pagos"><i class="bi bi-cash-stack"></i> Pagos</a>` : ''}
                        ${isSuperAdmin || p.includes('gestion-artistas') ? `<a class="nav-link-sidebar" data-seccion="gestion-artistas"><i class="bi bi-people"></i> Artistas</a>` : ''}
                        ${isSuperAdmin || p.includes('gestion-servicios') ? `<a class="nav-link-sidebar" data-seccion="gestion-servicios"><i class="bi bi-music-note-beamed"></i> Servicios</a>` : ''}
                     </div>`;
        }

        // Sección Administrador
        if (isSuperAdmin) {
            html += `<div class="nav-group">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Administrador</div>
                        <a class="nav-link-sidebar text-danger" data-seccion="mis-deudas"><i class="bi bi-wallet2"></i> Mis Deudas</a>
                        <a class="nav-link-sidebar" data-seccion="configuracion"><i class="bi bi-gear"></i> Configuración</a>
                        <a class="nav-link-sidebar" data-seccion="papelera-reciclaje"><i class="bi bi-trash"></i> Papelera</a>
                     </div>`;
        }

        navContainer.innerHTML = html;

        // Agregar event listeners
        document.querySelectorAll('.nav-link-sidebar').forEach(link => {
            link.addEventListener('click', (e) => {
                if (!e.currentTarget.onclick) {
                    e.preventDefault();
                    if (typeof window.app?.mostrarSeccion === 'function') {
                        window.app.mostrarSeccion(e.currentTarget.dataset.seccion);
                    }
                }
            });
        });
    }

    // ==================================================================
    // 6. API PÚBLICA DEL MÓDULO
    // ==================================================================

    const UIManager = {
        // Utilidades
        safeDate,
        safeMoney,
        escapeHTML,

        // Tablas
        renderHistorialTable,
        renderCotizacionesTable,
        renderPagosPendientesTable,
        renderPagosHistorialTable,

        // Paginación
        renderTableControls,
        changePage,

        // Listas
        renderPaginatedList,
        renderPaginationControls,

        // Sidebar
        renderSidebar
    };

    // Exponer globalmente
    window.UIManager = UIManager;

    // También exponer funciones individuales para compatibilidad
    window.renderHistorialTable = renderHistorialTable;
    window.renderCotizacionesTable = renderCotizacionesTable;
    window.renderPagosPendientesTable = renderPagosPendientesTable;
    window.renderPagosHistorialTable = renderPagosHistorialTable;
    window.renderTableControls = renderTableControls;
    window.renderPaginatedList = renderPaginatedList;
    window.renderPaginationControls = renderPaginationControls;
    window.renderSidebar = renderSidebar;

    // Alias para compatibilidad con código legacy que usa changeTablePage
    window.changeTablePage = changePage;
    window.changePage = changePage;

    console.log('[UIManager] Módulo cargado y listo');

})();
