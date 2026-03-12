l || ''; document.getElementById('editUsuarioRole').value = item.role; document.getElementById('editUsuarioPass').value = ''; const selectArtista = document.getElementById('editUsuarioArtista'); if (selectArtista) { selectArtista.innerHTML = '<option value="">Cargando...</option>'; try { let artistas = localCache.artistas; if (!artistas || artistas.length === 0) { artistas = await fetchAPI('/api/artistas'); localCache.artistas = artistas; } let opts = '<option value="">-- Ninguno / Sin Vínculo --</option>'; artistas.forEach(a => { const selected = (item.artistaId === a._id) ? 'selected' : ''; opts += `<option value="${a._id}" ${selected}>${escapeHTML(a.nombreArtistico || a.nombre)}</option>`; }); selectArtista.innerHTML = opts; } catch (e) { selectArtista.innerHTML = '<option value="">Error al cargar</option>'; } } document.querySelectorAll('#editUsuarioPermisosContainer input').forEach(chk => chk.checked = false); if (item.permisos && Array.isArray(item.permisos)) { item.permisos.forEach(p => { const chk = document.querySelector(`#editUsuarioPermisosContainer input[value="${p}"]`); if(chk) chk.checked = true; }); } new bootstrap.Modal(document.getElementById('modalEditarUsuario')).show(); }
    async function guardarEdicionUsuario(e) { e.preventDefault(); const id = document.getElementById('editUsuarioId').value; const pass = document.getElementById('editUsuarioPass').value; const artistaSelect = document.getElementById('editUsuarioArtista'); const artistaId = artistaSelect ? artistaSelect.value : null; const checkboxes = document.querySelectorAll('#editUsuarioPermisosContainer input:checked'); const permisos = Array.from(checkboxes).map(c => c.value); const body = { username: document.getElementById('editUsuarioName').value, email: document.getElementById('editUsuarioEmail').value, role: document.getElementById('editUsuarioRole').value, permisos: permisos, artistaId: artistaId }; if(pass) body.password = pass; try { await fetchAPI(`/api/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Usuario actualizado y vinculado.', 'success'); bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuario')).hide(); localCache.usuarios =[]; renderPaginatedList('usuarios'); } catch (e) { showToast(e.message, 'error'); } }
    function editarInfoProyecto(id) { let proyecto = localCache.proyectos.find(p => p._id === id); if(!proyecto) proyecto = historialCacheados.find(p => p._id === id); if (!proyecto) return showToast('Proyecto no encontrado', 'error'); Swal.fire({ title: 'Editar Información', html: `<input id="swal-nombre" class="swal2-input" placeholder="Nombre del Proyecto" value="${escapeHTML(proyecto.nombreProyecto || '')}"><input id="swal-total" type="number" class="swal2-input" placeholder="Precio Total ($)" value="${proyecto.total || 0}">`, focusConfirm: false, preConfirm: () => { return[ document.getElementById('swal-nombre').value, document.getElementById('swal-total').value ] } }).then(async (result) => { if (result.isConfirmed) { const [nuevoNombre, nuevoTotalStr] = result.value; const nuevoTotal = parseFloat(nuevoTotalStr); try { if (nuevoNombre.trim() !== proyecto.nombreProyecto) { await fetchAPI(`/api/proyectos/${id}/nombre`, { method: 'PUT', body: JSON.stringify({ nombreProyecto: nuevoNombre.trim() }) }); proyecto.nombreProyecto = nuevoNombre.trim(); } if (!isNaN(nuevoTotal) && nuevoTotal !== proyecto.total) { await fetchAPI(`/api/proyectos/${id}`, { method: 'PUT', body: JSON.stringify({ total: nuevoTotal }) }); proyecto.total = nuevoTotal; } showToast('Proyecto actualizado.', 'success'); if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtro = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; cargarFlujoDeTrabajo(filtro); } else if (document.getElementById('vista-artista').classList.contains('active')) { const nombreActual = document.getElementById('vista-artista-nombre').textContent; const art = localCache.artistas.find(a => a.nombre === nombreActual || a.nombreArtistico === nombreActual); if (art) mostrarVistaArtista(art._id, nombreActual, ''); } } catch (e) { showToast(`Error al editar`, 'error'); } } }); }
    async function registrarPago(proyectoId, desdeHistorial = false) { let proyecto; try { proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); } catch(e) { return showToast('Proyecto no encontrado.', 'error'); } const restante = proyecto.total - (proyecto.montoPagado || 0); Swal.fire({ title: 'Registrar Pago', html: `<p>Saldo Restante: <strong class="text-danger">$${safeMoney(restante)}</strong></p>` + '<input id="swal-monto" type="number" class="swal2-input" placeholder="Monto a pagar" value="' + (restante > 0 ? restante.toFixed(2) : '0.00') + '">' + '<select id="swal-metodo" class="swal2-select"><option value="Transferencia">Transferencia</option><option value="Efectivo">Efectivo</option><option value="Tarjeta">Tarjeta</option></select>', focusConfirm: false, preConfirm: () => { return[ document.getElementById('swal-monto').value, document.getElementById('swal-metodo').value ] } }).then(async (result) => { if (result.value) { const [montoStr, metodo] = result.value; const monto = parseFloat(montoStr); if (isNaN(monto) || monto <= 0) return showToast('Monto inválido.', 'error'); try { const proyectoActualizado = await fetchAPI(`/api/proyectos/${proyectoId}/pagos`, { method: 'POST', body: JSON.stringify({ monto, metodo }) }); showToast(proyectoActualizado.offline ? 'Pago registrado en cola offline.' : '¡Pago registrado exitosamente!', proyectoActualizado.offline ? 'info' : 'success'); const ultimoPago = proyectoActualizado.pagos[proyectoActualizado.pagos.length - 1]; await generarReciboPDF(proyectoActualizado, ultimoPago); if (document.getElementById('pagos').classList.contains('active')) { cargarPagos(); } else if (desdeHistorial) { cargarHistorial(); } else { cargarFlujoDeTrabajo(); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    async function cargarPagos() { document.querySelector('#pagos .btn-group button.active')?.classList.remove('active'); const btnPendientes = document.querySelector('#pagos .btn-group button'); if (btnPendientes) btnPendientes.classList.add('active'); mostrarSeccionPagos('pendientes', btnPendientes); }
    function mostrarSeccionPagos(vista, btn) { document.querySelectorAll('#pagos .btn-group button').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); if (vista === 'pendientes') { document.getElementById('vista-pagos-pendientes').style.display = 'block'; document.getElementById('vista-pagos-historial').style.display = 'none'; cargarPagosPendientes(); } else { document.getElementById('vista-pagos-pendientes').style.display = 'none'; document.getElementById('vista-pagos-historial').style.display = 'block'; cargarHistorialPagos(); } }
    
    async function cargarPagosPendientes() { 
        const tabla = document.getElementById('tablaPendientesBody'); 
        tabla.innerHTML = '<tr><td colspan="5">Calculando saldos pendientes...</td></tr>'; 
        await fetchAPI('/api/proyectos'); 
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 
        pagosPendientesCacheados = localCache.proyectos.filter(p => { 
            if (isClient && (!p.artista || p.artista._id !== userInfo.artistaId)) return false; 
            const pagado = p.montoPagado || 0; 
            return (p.total > pagado) && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion' && !p.deleted; 
        }); 
        tablePagination.pagosPendientes.page = 1;
        renderPagosPendientesTable();
    }
    
    function renderPagosPendientesTable() {
        const tabla = document.getElementById('tablaPendientesBody');
        let items = pagosPendientesCacheados ||[];
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 

        const filterText = tablePagination.pagosPendientes.filter || '';
        if(filterText) {
            items = items.filter(p => {
                const artista = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General';
                const proyecto = p.nombreProyecto || 'Proyecto sin nombre';
                return `${artista} ${proyecto}`.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.pagosPendientes;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;

        if (items.length === 0) { 
            tabla.innerHTML = '<tr><td colspan="5" class="text-center">¡Todo al día! No hay pagos pendientes.</td></tr>'; 
            renderTableControls('tablaPendientesBody', 'pagosPendientes', 1, 0);
            return; 
        } 
        
        tabla.innerHTML = paginatedItems.map(p => { 
            const deuda = p.total - (p.montoPagado || 0); 
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Cliente General'; 
            const proyectoNombre = p.nombreProyecto || 'Proyecto sin nombre'; 
            let buttons = ''; 
            if (!isClient) { 
                buttons = `<button class="btn btn-sm btn-success" onclick="app.registrarPago('${p._id}')">Cobrar <i class="bi bi-cash"></i></button><button class="btn btn-sm btn-outline-primary" onclick="app.compartirRecordatorioPago('${p._id}')">Recordar <i class="bi bi-whatsapp"></i></button>`; 
            } 
            return `<tr><td data-label="Proyecto"><div style="font-weight:bold;">${escapeHTML(proyectoNombre)}</div><div style="font-size:0.85em; color:var(--text-color-light);">${escapeHTML(artistaNombre)}</div></td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Restante" style="color:var(--danger-color); font-weight:700;">$${safeMoney(deuda)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; 
        }).join('');
        
        renderTableControls('tablaPendientesBody', 'pagosPendientes', page, totalPages);
    }

    async function cargarHistorialPagos() { 
        const tablaBody = document.getElementById('tablaPagosBody'); 
        tablaBody.innerHTML = `<tr><td colspan="5">Cargando historial de pagos...</td></tr>`; 
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 
        try { 
            const proyectosFresh = await fetchAPI('/api/proyectos'); 
            let pagos =[]; 
            if (isClient) { 
                const misProyectos = proyectosFresh.filter(p => p.artista && p.artista._id === userInfo.artistaId); 
                misProyectos.forEach(proj => { 
                    if (proj.pagos && proj.pagos.length > 0) { 
                        proj.pagos.forEach(pago => { 
                            pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.nombreProyecto || 'Proyecto', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); 
                        }); 
                    } 
                }); 
            } else { 
                proyectosFresh.forEach(proj => { 
                    if (proj.pagos && proj.pagos.length > 0) { 
                        proj.pagos.forEach(pago => { 
                            pagos.push({ fecha: pago.fecha || new Date().toISOString(), artista: proj.artista ? (proj.artista.nombreArtistico || proj.artista.nombre) : 'Público General', monto: pago.monto, metodo: pago.metodo, proyectoId: proj._id, pagoId: pago._id }); 
                        }); 
                    } 
                }); 
            } 
            pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
            pagosHistorialCacheados = pagos;
            tablePagination.pagosHistorial.page = 1;
            renderPagosHistorialTable();
        } catch (e) { 
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error al cargar el historial de pagos.</td></tr>`; 
        } 
    }
    
    function renderPagosHistorialTable() {
        const tablaBody = document.getElementById('tablaPagosBody');
        let items = pagosHistorialCacheados ||[];
        const userInfo = getUserRoleAndId(); 
        const isClient = userInfo.role === 'cliente'; 

        const filterText = tablePagination.pagosHistorial.filter || '';
        if (filterText) {
            items = items.filter(p => {
                return p.artista.toLowerCase().includes(filterText) || p.metodo.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.pagosHistorial;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="5" class="text-center">No hay pagos registrados en el historial.</td></tr>`; 
            renderTableControls('tablaPagosBody', 'pagosHistorial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => { 
            let buttons = `<button class="btn btn-sm btn-outline-secondary" title="Reimprimir Recibo" onclick="app.reimprimirRecibo('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-file-earmark-pdf"></i></button>`; 
            if (!isClient) { 
                buttons += `<button class="btn btn-sm btn-outline-danger" title="Eliminar Pago" onclick="app.eliminarPago('${p.proyectoId}', '${p.pagoId}')"><i class="bi bi-trash"></i></button>`; 
            } 
            return `<tr><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Proyecto">${escapeHTML(p.artista)}</td><td data-label="Monto">$${safeMoney(p.monto)}</td><td data-label="Método">${escapeHTML(p.metodo)}</td><td data-label="Acciones" class="table-actions">${buttons}</td></tr>`; 
        }).join('');

        renderTableControls('tablaPagosBody', 'pagosHistorial', page, totalPages);
    }

    async function reimprimirRecibo(proyectoId, pagoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const pago = proyecto.pagos.find(p => p._id === pagoId); if (!pago) return showToast('Pago no encontrado en el proyecto.', 'error'); await generarReciboPDF(proyecto, pago); } catch (e) { showToast('Error al generar recibo.', 'error'); } }
    async function compartirRecordatorioPago(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'cliente'; const restante = proyecto.total - (proyecto.montoPagado || 0); const mensaje = `¡Hola ${nombreCliente}! Te enviamos un recordatorio de FiaRecords sobre tu proyecto "${proyecto.nombreProyecto || 'General'}".\n\nEl saldo pendiente es de: *$${safeMoney(restante)} MXN*.\n\nQuedamos a tus órdenes.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch(e) { showToast('Error al obtener datos del proyecto', 'error'); } }
    async function eliminarPago(proyectoId, pagoId) { Swal.fire({ title: '¿Eliminar este pago?', text: "Esta acción afectará el saldo del proyecto.", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed){ try { await fetchAPI(`/api/proyectos/${proyectoId}/pagos/${pagoId}`, { method: 'DELETE' }); showToast('Pago eliminado.', 'success'); cargarPagos(); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    function cerrarSesionConfirmacion() { Swal.fire({ title: '¿Salir?', text: "Cerrarás tu sesión actual", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Salir', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then((result) => { if (result.isConfirmed) showLogin(); }); }
    function toggleAuth(view) {['login-view', 'register-view', 'recover-view', 'reset-password-view'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; }); const active = document.getElementById(`${view}-view`); if(active) active.style.display = 'block'; document.getElementById('login-error').textContent = ''; }
    function showResetPasswordView(token) { document.body.classList.add('auth-visible'); DOMElements.appWrapper.style.display = 'none'; DOMElements.loginContainer.style.display = 'flex'; document.getElementById('reset-token').value = token; toggleAuth('reset'); }
    async function resetPassword(e) { e.preventDefault(); const token = document.getElementById('reset-token').value; const password = document.getElementById('new-password').value; try { const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Contraseña actualizada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function registerUser(e) { e.preventDefault(); const username = document.getElementById('reg-username').value; const email = document.getElementById('reg-email').value; const password = document.getElementById('reg-password').value; const nombreArtistico = document.getElementById('reg-artistname').value; try { const res = await fetch(`${API_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password, role: 'Cliente', nombre: nombreArtistico, createArtist: true }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('¡Cuenta creada!', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    async function recoverPassword(e) { e.preventDefault(); const email = document.getElementById('rec-email').value; try { const res = await fetch(`${API_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); showToast('Correo enviado.', 'success'); toggleAuth('login'); } catch (err) { document.getElementById('login-error').textContent = err.message; } }
    
    function toggleInputsHorario(index) {
        const isChecked = document.getElementById(`dia-activo-${index}`).checked;
        document.getElementById(`dia-inicio-${index}`).disabled = !isChecked;
        document.getElementById(`dia-fin-${index}`).disabled = !isChecked;
    }

    async function guardarHorariosConfig(e) {
        e.preventDefault();
        const horarioLaboral = {};
        for (let i = 0; i < 7; i++) {
            horarioLaboral[i.toString()] = {
                activo: document.getElementById(`dia-activo-${i}`).checked,
                inicio: document.getElementById(`dia-inicio-${i}`).value,
                fin: document.getElementById(`dia-fin-${i}`).value
            };
        }
        try {
            const res = await fetchAPI('/api/configuracion/horarios', {
                method: 'PUT',
                body: JSON.stringify({ horarioLaboral })
            });
            configCache.horarioLaboral = res.horarioLaboral; 
            showToast('Horarios actualizados correctamente', 'success');
        } catch (err) {
            showToast('Error al guardar horarios', 'error');
        }
    }
    
    function initAppEventListeners(payload) { 
        window.addEventListener('hashchange', () => { const section = location.hash.replace('#', ''); if (section) mostrarSeccion(section, false); }); 
        ['Servicios', 'Artistas', 'Usuarios'].forEach(type => { const form = document.getElementById(`form${type}`); if(form) form.addEventListener('submit', (e) => saveItem(e, type.toLowerCase())); }); 
        document.getElementById('formEditarArtista').addEventListener('submit', guardarEdicionArtista); 
        document.getElementById('formEditarServicio').addEventListener('submit', guardarEdicionServicio); 
        document.getElementById('formEditarUsuario').addEventListener('submit', guardarEdicionUsuario); 
        document.getElementById('firma-input').addEventListener('change', subirFirma); 
        document.getElementById('proyectoDescuento').addEventListener('input', mostrarProyectoActual); 
        const modalDatosBancarios = document.getElementById('modalDatosBancarios'); 
        if (modalDatosBancarios) { modalDatosBancarios.addEventListener('show.bs.modal', function () { cargarDatosBancariosEnModal(); }); } 
        setupMobileMenu(); 
        if (DOMElements.logoutButton) { DOMElements.logoutButton.onclick = cerrarSesionConfirmacion; } 
        window.addEventListener('online', OfflineManager.updateIndicator); 
        window.addEventListener('offline', OfflineManager.updateIndicator); 
        OfflineManager.updateIndicator(); 
        
        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                toggleTheme(e.target.checked);
            });
        });
    }
    
    function setupCustomization(payload) { 
        if (payload.role === 'admin') { 
            const appLogo = document.getElementById('app-logo');
            const logoInput = document.getElementById('logo-input');
            const faviconInput = document.getElementById('favicon-input');
            
            if (appLogo && logoInput) { 
                appLogo.style.cursor = 'pointer'; 
                appLogo.title = 'Haz clic para cambiar el logo'; 
                
                appLogo.onclick = () => {
                    logoInput.click();
                }; 
                
                logoInput.onchange = async (event) => { 
                    const file = event.target.files[0]; 
                    if (!file) return; 
                    const formData = new FormData(); 
                    formData.append('logoFile', file); 
                    try { 
                        const res = await fetchAPI('/api/configuracion/upload-logo', { method: 'POST', body: formData, isFormData: true }); 
                        showToast('Logo actualizado!', 'success'); 
                        
                        if(res && res.logoBase64) { 
                            appLogo.src = res.logoBase64; 
                            if (document.getElementById('login-logo')) document.getElementById('login-logo').src = res.logoBase64;
                            logoBase64 = res.logoBase64;
                            await localforage.setItem('cached_logo_path', res.logoBase64);
                        } else {
                            await loadInitialConfig(); 
                            if(configCache && configCache.logoBase64) { 
                                appLogo.src = configCache.logoBase64; 
                                if (document.getElementById('login-logo')) document.getElementById('login-logo').src = configCache.logoBase64;
                                logoBase64 = configCache.logoBase64;
                            } 
                        }
                    } catch (e) { 
                        showToast(`Error al subir logo`, 'error'); 
                    } 
                }; 
            } 

            if (faviconInput) {
                faviconInput.onchange = async (event) => {
                    const file = event.target.files[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('faviconFile', file);
                    try {
                        const res = await fetchAPI('/api/configuracion/upload-favicon', { method: 'POST', body: formData, isFormData: true });
                        showToast('Favicon actualizado!', 'success');
                        
                        let faviconUrl = res.faviconBase64;
                        if (!faviconUrl) {
                            await loadInitialConfig();
                            faviconUrl = configCache && configCache.faviconBase64 ? configCache.faviconBase64 : '';
                        }
                        if (faviconUrl) {
                            let link = document.querySelector("link[rel~='icon']");
                            if (!link) {
                                link = document.createElement('link');
                                link.rel = 'icon';
                                document.head.appendChild(link);
                            }
                            link.href = faviconUrl;
                            await localforage.setItem('cached_favicon_path', faviconUrl);
                        }
                    } catch (e) {
                        showToast(`Error al subir favicon`, 'error');
                    }
                };
            }
        } 
    }
    
    function renderSidebar(user) { 
        const navContainer = document.getElementById('sidebar-nav-container'); 
        let p = user.permisos ||[]; 
        const role = user.role ? user.role.toLowerCase() : 'cliente'; 
        let html = ''; 
        if (role === 'cliente') { 
            html = `<div class="nav-group mb-3"><div class="text-uppercase text-muted small fw-bold px-3 mb-2">Mi Espacio</div><a class="nav-link-sidebar active" data-seccion="vista-artista" onclick="app.irAVistaArtista()"><i class="bi music-note-beamed"></i> Mis Proyectos</a><a class="nav-link-sidebar" data-seccion="pagos"><i class="bi cash-stack"></i> Mis Pagos</a></div>`; 
        } else { 
            const isSuperAdmin = role === 'admin'; 
            const canAccess = (permKey) => isSuperAdmin || p.includes(permKey); 
            
            html = `<div class="nav-group mb-3">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Proyectos</div>
                        ${canAccess('dashboard') ? '<a class="nav-link-sidebar" data-seccion="dashboard"><i class="bi speedometer2"></i> Dashboard</a>' : ''}
                        ${canAccess('agenda') ? '<a class="nav-link-sidebar" data-seccion="agenda"><i class="bi calendar-event"></i> Agenda</a>' : ''}
                        ${canAccess('flujo-trabajo') ? '<a class="nav-link-sidebar" data-seccion="flujo-trabajo"><i class="bi kanban"></i> Flujo de Trabajo</a>' : ''}
                        ${canAccess('cotizaciones') ? '<a class="nav-link-sidebar" data-seccion="cotizaciones"><i class="bi file-earmark-text"></i> Cotizaciones</a>' : ''}
                        ${canAccess('historial-proyectos') ? '<a class="nav-link-sidebar" data-seccion="historial-proyectos"><i class="bi clock-history"></i> Historial</a>' : ''}
                        ${canAccess('pagos') ? '<a class="nav-link-sidebar" data-seccion="pagos"><i class="bi cash-stack"></i> Gestión de Pagos</a>' : ''}
                    </div>
                    <div class="nav-group mb-3">
                        <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Gestión</div>
                        ${canAccess('gestion-artistas') ? '<a class="nav-link-sidebar" data-seccion="gestion-artistas"><i class="bi people"></i> Artistas</a>' : ''}
                        ${canAccess('gestion-servicios') ? '<a class="nav-link-sidebar" data-seccion="gestion-servicios"><i class="bi tags"></i> Servicios</a>' : ''}
                        ${canAccess('gestion-usuarios') ? '<a class="nav-link-sidebar" data-seccion="gestion-usuarios"><i class="bi person-badge"></i> Usuarios</a>' : ''}
                    </div>`;

            if (isSuperAdmin) {
                html += `<div class="nav-group">
                            <div class="text-uppercase text-muted small fw-bold px-3 mb-2">Administrador</div>
                            <a class="nav-link-sidebar text-danger" data-seccion="mis-deudas"><i class="bi wallet2"></i> Mis Deudas</a>
                            <a class="nav-link-sidebar" data-seccion="configuracion"><i class="bi gear"></i> Configuración</a>
                            <a class="nav-link-sidebar" data-seccion="papelera-reciclaje"><i class="bi trash"></i> Papelera</a>
                         </div>`;
            }
        } 
        navContainer.innerHTML = html; 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => { link.addEventListener('click', (e) => { if(!e.currentTarget.onclick) { e.preventDefault(); mostrarSeccion(e.currentTarget.dataset.seccion); } }); }); 
    }

    // ==================================================================
    // MODULO DE DEUDAS PERSONALES (ADMIN)
    // ==================================================================
    async function cargarDeudas() {
        const tabla = document.getElementById('tablaDeudasBody');
        if(!tabla) return;
        tabla.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
        try {
            const data = await fetchAPI('/api/deudas');
            localCache.deudas = data;
            renderDeudas();
        } catch (error) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-danger">Error al cargar o acceso denegado.</td></tr>';
        }
    }

    function renderDeudas() {
        const tabla = document.getElementById('tablaDeudasBody');
        if(!tabla) return;
        let totalGlobal = 0;

        if (!localCache.deudas || localCache.deudas.length === 0) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-center">No hay deudas registradas. ¡Excelente!</td></tr>';
            document.getElementById('total-deuda-global').textContent = '$0.00';
            return;
        }

        tabla.innerHTML = localCache.deudas.map(d => {
            const restante = d.total - d.montoPagado;
            totalGlobal += restante;

            const badge = d.estatus === 'Liquidada' 
                ? '<span class="badge bg-success">Liquidada</span>' 
                : '<span class="badge bg-danger">Pendiente</span>';
            
            let btnPagar = d.estatus !== 'Liquidada' 
                ? `<button class="btn btn-sm btn-success text-white" title="Abonar" onclick="app.abonarDeuda('${d._id}', ${restante})"><i class="bi bi-cash"></i></button>`
                : '';

            return `
            <tr class="${d.estatus === 'Liquidada' ? 'fila-cancelada' : ''}">
                <td data-label="Concepto"><strong>${escapeHTML(d.concepto)}</strong></td>
                <td data-label="Total">$${safeMoney(d.total)}</td>
                <td data-label="Abonado">$${safeMoney(d.montoPagado)}</td>
                <td data-label="Restante" class="text-danger fw-bold">$${safeMoney(restante)}</td>
                <td data-label="Estatus">${badge}</td>
                <td data-label="Acciones" class="table-actions">
                    ${btnPagar}
                    <button class="btn btn-sm btn-outline-info" title="Historial" onclick="app.verHistorialDeuda('${d._id}')"><i class="bi bi-clock-history"></i></button>
                    <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="app.eliminarDeuda('${d._id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('total-deuda-global').textContent = `$${safeMoney(totalGlobal)}`;
    }

    function abrirModalNuevaDeuda() {
        Swal.fire({
            title: 'Registrar Deuda',
            html: `
                <input id="deuda-concepto" class="swal2-input" placeholder="¿Qué se debe? (Ej: Micro, Banco)">
                <input id="deuda-total" type="number" class="swal2-input" placeholder="Monto total ($)" step="0.01" min="0">
            `,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const c = document.getElementById('deuda-concepto').value;
                const t = document.getElementById('deuda-total').value;
                if (!c || !t) {
                    Swal.showValidationMessage('Llena todos los campos');
                    return false;
                }
                return { concepto: c, total: t };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI('/api/deudas', { method: 'POST', body: JSON.stringify(result.value) });
                    showToast('Deuda registrada', 'success');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    function abonarDeuda(id, maxRestante) {
        Swal.fire({
            title: 'Registrar Abono',
            html: `
                <p>Restante: <strong class="text-danger">$${safeMoney(maxRestante)}</strong></p>
                <input id="abono-monto" type="number" class="swal2-input" placeholder="Monto a abonar" value="${maxRestante}" step="0.01" min="0.01" max="${maxRestante}">
                <input id="abono-nota" class="swal2-input" placeholder="Nota (Opcional)">
            `,
            showCancelButton: true,
            confirmButtonText: 'Abonar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const m = document.getElementById('abono-monto').value;
                const n = document.getElementById('abono-nota').value;
                if (!m || m <= 0) {
                    Swal.showValidationMessage('Monto inválido');
                    return false;
                }
                return { monto: m, nota: n };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI(`/api/deudas/${id}/pagos`, { method: 'POST', body: JSON.stringify(result.value) });
                    showToast('Abono registrado', 'success');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    function verHistorialDeuda(id) {
        const deuda = localCache.deudas.find(d => d._id === id);
        if(!deuda || !deuda.pagos || deuda.pagos.length === 0) {
            return Swal.fire('Historial', 'No hay abonos registrados en esta deuda.', 'info');
        }
        
        let htmlLista = deuda.pagos.map(p => `
            <div class="d-flex justify-content-between border-bottom p-2 small text-start">
                <span>${safeDate(p.fecha)} ${p.nota ? `(<i class="text-muted">${escapeHTML(p.nota)}</i>)` : ''}</span>
                <strong class="text-success">+$${safeMoney(p.monto)}</strong>
            </div>
        `).join('');

        Swal.fire({
            title: `Abonos: ${escapeHTML(deuda.concepto)}`,
            html: `<div style="max-height: 250px; overflow-y:auto;">${htmlLista}</div>`,
            confirmButtonText: 'Cerrar'
        });
    }

    function eliminarDeuda(id) {
        Swal.fire({
            title: '¿Borrar deuda?',
            text: 'Se eliminará de tu lista visible.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, borrar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await fetchAPI(`/api/deudas/${id}`, { method: 'DELETE' });
                    showToast('Deuda eliminada', 'info');
                    cargarDeudas();
                } catch (e) { showToast(e.message, 'error'); }
            }
        });
    }

    // ==================================================================
    // INITIALIZATION & EVENT LISTENERS
    // ==================================================================
    (async function init() {
        // 1. CARGAR DB LOCAL PRIMERO
        await cargarCacheDesdeIndexedDB();

        // 2. CARGAR ASSETS LOCALES
        const cachedLogo = await localforage.getItem('cached_logo_path');
        if(cachedLogo) {
            if(DOMElements.appLogo) DOMElements.appLogo.src = cachedLogo; 
            if(DOMElements.loginLogo) DOMElements.loginLogo.src = cachedLogo;
            logoBase64 = cachedLogo;
        }

        const cachedFavicon = await localforage.getItem('cached_favicon_path');
        if (cachedFavicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = cachedFavicon;
        }

        setupFooterYear();

        document.querySelectorAll('.theme-switch-checkbox').forEach(chk => {
            chk.addEventListener('change', (e) => {
                toggleTheme(e.target.checked);
            });
        });

        await fetchPublicLogo();
        await loadInitialConfig();
        setTimeout(preloadLogoForPDF, 2000);
        
        const savedTheme = localStorage.getItem('theme') === 'dark'; 
        toggleTheme(savedTheme);
        
        setupAuthListeners();

        const path = window.location.pathname;
        if (path.startsWith('/reset-password/')) {
             const token = path.split('/').pop();
             if(token) showResetPasswordView(token);
             return;
        }

        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (navigator.onLine && payload.exp * 1000 < Date.now()) return showLogin();
                await showApp(payload);
            } catch (e) { showLogin(); }
        } else { showLogin(); }
    })();

    // --- EXPORTS ---
    window.app = {
        eliminarItem, restaurarItem, eliminarPermanente, cambiarProceso, filtrarFlujo, eliminarProyecto,
        quitarDeProyecto, agregarAProyecto, cambiarAtributo, aprobarCotizacion, generarCotizacionPDF,
        compartirPorWhatsApp, registrarPago, reimprimirRecibo, compartirRecordatorioPago, eliminarPago,
        mostrarVistaArtista, irAVistaArtista, guardarDatosBancarios, generarDatosBancariosPDF,
        compartirDatosBancariosWhatsApp, openDeliveryModal, saveDeliveryLink, editarInfoProyecto,
        filtrarTablas, actualizarHorarioProyecto, cargarAgenda, cancelarCita, subirADrive,
        syncNow: OfflineManager.syncNow, mostrarSeccion, mostrarSeccionPagos, cargarPagos,
        nuevoProyectoParaArtista, abrirModalEditarArtista, abrirModalEditarServicio, abrirModalEditarUsuario,
        guardarEdicionArtista, guardarEdicionServicio, guardarEdicionUsuario, generarReciboPDF,
        cerrarSesionConfirmacion, registrarNuevoArtistaDesdeFormulario, generarCotizacion,
        enviarAFlujoDirecto, toggleAuth, registerUser, recoverPassword, resetPassword,
        showResetPasswordView, changePage, irAlDashboard, verificarDisponibilidad,
        toggleInputsHorario, guardarHorariosConfig, changeTrashPage, changeTablePage,
        toggleTheme, openPlayer, playMedia, sincronizarArchivosDrive,
        cargarDeudas, abrirModalNuevaDeuda, abonarDeuda, verHistorialDeuda, eliminarDeuda,
        abrirModalProyectoDirecto, guardarProyectoDirecto,
       // --- NUEVAS EXPORTACIONES PARA PLANTILLAS ---
        guardarPlantillasConfig, 
        generarContratoPDF
    };
});

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', function () { 
        navigator.serviceWorker.register('sw.js').then(function (registration) { 
            console.log('ServiceWorker OK: ', registration.scope); 
        }, function (err) { 
            console.log('ServiceWorker Falló: ', err); 
        }); 
    });