Ingresos = document.getElementById('kpi-ingresos-mes');
            const cardIngresos = kpiIngresos ? kpiIngresos.closest('.card') : null;
            const chartContainer = document.getElementById('incomeChart').parentElement.parentElement; 

            if (stats.showFinancials === false) {
                if(cardIngresos) cardIngresos.style.display = 'none';
                if(chartContainer) chartContainer.style.display = 'none';
            } else {
                if(cardIngresos) cardIngresos.style.display = 'block';
                if(chartContainer) chartContainer.style.display = 'block';
                
                kpiIngresos.textContent = `$${safeMoney(stats.ingresosMes)}`;
                
                const ctx = document.getElementById('incomeChart').getContext('2d'); 
                if (chartInstance) chartInstance.destroy(); 
                const labels =['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']; 
                const dataValues = stats.monthlyIncome || Array(12).fill(0); 
                chartInstance = new Chart(ctx, { 
                    type: 'line', 
                    data: { labels: labels, datasets:[{ label: 'Ingresos ($)', data: dataValues, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.2)', fill: true, tension: 0.4 }] }, 
                    options: { responsive: true, maintainAspectRatio: false } 
                });
            }
            document.getElementById('kpi-proyectos-activos').textContent = stats.proyectosActivos || 0; 
            document.getElementById('kpi-proyectos-por-cobrar').textContent = stats.proyectosPorCobrar || 0; 
        } catch (e) { console.error("Error cargando dashboard:", e); } 
    }

    // ==================================================================
    // 7. GESTIÓN DE PROYECTOS Y AGENDA
    // ==================================================================
    
    async function verificarDisponibilidad() {
        const fechaInput = document.getElementById('fechaProyecto');
        const horaSelect = document.getElementById('horaProyecto');
        const alertaDiv = document.getElementById('alerta-disponibilidad');

        let fecha = fechaInput.value;
        if(fechaInput._flatpickr && fechaInput._flatpickr.selectedDates[0]) {
             const d = fechaInput._flatpickr.selectedDates[0];
             const year = d.getFullYear();
             const month = String(d.getMonth() + 1).padStart(2, '0');
             const day = String(d.getDate()).padStart(2, '0');
             fecha = `${year}-${month}-${day}`;
        }

        if (!fecha) {
            horaSelect.innerHTML = '<option value="">← Primero elige una fecha</option>';
            horaSelect.disabled = true;
            return;
        }

        horaSelect.innerHTML = '<option value="">Buscando horarios...</option>';
        horaSelect.disabled = true;
        alertaDiv.style.display = 'none';

        try {
            const horariosDisponibles = await fetchAPI(`/api/proyectos/disponibilidad?fecha=${fecha}`);
            
            horaSelect.innerHTML = ''; 

            if (horariosDisponibles.length === 0) {
                horaSelect.innerHTML = '<option value="">No hay horarios / Día Cerrado</option>';
                alertaDiv.textContent = 'Lo sentimos, no hay cupo disponible o el estudio no abre este día.';
                alertaDiv.style.display = 'block';
            } else {
                const defaultOp = document.createElement('option');
                defaultOp.value = ""; defaultOp.textContent = "-- Selecciona Hora --";
                horaSelect.appendChild(defaultOp);

                horariosDisponibles.forEach(hora => {
                    const option = document.createElement('option');
                    option.value = hora;
                    option.textContent = `${hora} hrs - Disponible`;
                    horaSelect.appendChild(option);
                });
                horaSelect.disabled = false;
            }

        } catch (e) { 
            console.error("Error verificando disponibilidad", e); 
            horaSelect.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    async function cargarOpcionesParaSelect(url, selectId, valueField, textFieldFn, addPublicoGeneral = false, currentValue = null) { 
        const select = document.getElementById(selectId); 
        try { 
            const data = await fetchAPI(url); 
            select.innerHTML = ''; 
            if (addPublicoGeneral) { const op = document.createElement('option'); op.value = 'publico_general'; op.textContent = 'Público General'; select.appendChild(op); } 
            const user = getUserRoleAndId();
            data.forEach(item => { 
                if (selectId === 'proyectoServicio' && user.role === 'cliente') { if (item.visible === false) return; }
                const option = document.createElement('option'); option.value = item[valueField]; option.textContent = textFieldFn(item); option.dataset.precio = item.precio || 0; select.appendChild(option); 
            }); 
            if (selectId === 'proyectoArtista' && preseleccionArtistaId) { select.value = preseleccionArtistaId; preseleccionArtistaId = null; } 
            else if (currentValue) { select.value = currentValue; } 
        } catch (error) { select.innerHTML = `<option value="">Error al cargar datos</option>`; } 
    }

    const cargarOpcionesParaProyecto = () => {
        const userInfo = getUserRoleAndId();
        const esCliente = userInfo.role === 'cliente';
        const artistaSelectContainer = document.querySelector('#proyectoArtista').parentElement;
        const btnNuevoArtista = document.getElementById('btnNuevoArtista');
        const containerDescuento = document.getElementById('containerDescuento');
        const btnGenerarCotizacion = document.getElementById('btnGenerarCotizacion');

        if (esCliente) {
            artistaSelectContainer.style.display = 'none';
            if (btnNuevoArtista) btnNuevoArtista.style.display = 'none';
            if(containerDescuento) { containerDescuento.classList.remove('d-flex'); containerDescuento.classList.add('d-none'); }
            document.getElementById('proyectoDescuento').value = 0;
            if(btnGenerarCotizacion) { btnGenerarCotizacion.classList.add('d-none'); }
            const select = document.getElementById('proyectoArtista');
            select.innerHTML = `<option value="${userInfo.artistaId}" selected>${userInfo.username}</option>`;
            if (!document.getElementById('info-artista-cliente')) {
                 const infoArtistaEl = document.createElement('p'); infoArtistaEl.innerHTML = `Registrando proyecto para: <strong>${userInfo.username}</strong>`; infoArtistaEl.id = 'info-artista-cliente'; infoArtistaEl.className = 'alert alert-info py-2'; artistaSelectContainer.parentElement.insertBefore(infoArtistaEl, artistaSelectContainer);
            }
        } else {
            artistaSelectContainer.style.display = 'flex';
            if (btnNuevoArtista) btnNuevoArtista.style.display = 'block';
            if(containerDescuento) { containerDescuento.classList.remove('d-none'); containerDescuento.classList.add('d-flex'); }
            if(btnGenerarCotizacion) { btnGenerarCotizacion.classList.remove('d-none'); }
            if (document.getElementById('info-artista-cliente')) { document.getElementById('info-artista-cliente').remove(); }
            cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true);
        }
        cargarOpcionesParaSelect('/api/servicios', 'proyectoServicio', '_id', item => `${item.nombre} - $${item.precio.toFixed(2)}`); 
        
        const fp = flatpickr("#fechaProyecto", { 
            defaultDate: "today", 
            locale: "es",
            minDate: "today",
            onChange: function(selectedDates, dateStr, instance) {
                verificarDisponibilidad(); 
            }
        });
        
        const horaSelect = document.getElementById('horaProyecto');
        horaSelect.innerHTML = '<option value="">← Primero elige una fecha</option>';
        horaSelect.disabled = true;

        proyectoActual = {}; mostrarProyectoActual(); document.getElementById('formProyecto').reset();
    }

    function agregarAProyecto() { const select = document.getElementById('proyectoServicio'); if (!select.value) return; const id = `item-${select.value}-${Date.now()}`; proyectoActual[id] = { id, servicioId: select.value, nombre: select.options[select.selectedIndex].text.split(' - ')[0], unidades: parseInt(document.getElementById('proyectoUnidades').value) || 1, precioUnitario: parseFloat(select.options[select.selectedIndex].dataset.precio) }; mostrarProyectoActual(); }
    function quitarDeProyecto(id) { delete proyectoActual[id]; mostrarProyectoActual(); }
    function mostrarProyectoActual() { const lista = document.getElementById('listaProyectoActual'); let subtotal = 0; lista.innerHTML = Object.values(proyectoActual).map(item => { const itemTotal = item.precioUnitario * item.unidades; subtotal += itemTotal; return `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${item.unidades}x ${escapeHTML(item.nombre)}</span><span>$${itemTotal.toFixed(2)} <button class="btn btn-sm btn-outline-danger ms-2" style="padding:0.1rem 0.4rem;" onclick="app.quitarDeProyecto('${item.id}')"><i class="bi bi-x-lg"></i></button></span></li>`; }).join(''); const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0; const total = subtotal - descuento; document.getElementById('totalAPagar').textContent = `$${total.toFixed(2)}`; }

    async function guardarProyecto(procesoDestino) {
        const artistaSelect = document.getElementById('proyectoArtista'); 
        const artistaId = artistaSelect.value; 
        const fechaInput = document.getElementById('fechaProyecto')._flatpickr.selectedDates[0]; 
        const horaInput = document.getElementById('horaProyecto').value; 

        let fechaFinal = new Date(); 

        if (procesoDestino !== 'Cotizacion') {
            if (!fechaInput) { showToast('Selecciona una fecha', 'warning'); return null; }
            if (!horaInput || horaInput === "") { showToast('Selecciona una hora disponible', 'warning'); return null; }
            
            fechaFinal = new Date(fechaInput); 
            const [hours, minutes] = horaInput.split(':'); 
            fechaFinal.setHours(hours);
            fechaFinal.setMinutes(minutes);
        } else {
            if (fechaInput) {
                fechaFinal = new Date(fechaInput);
                if (horaInput) {
                    const [hours, minutes] = horaInput.split(':');
                    fechaFinal.setHours(hours);
                    fechaFinal.setMinutes(minutes);
                }
            }
        }
        
        if (Object.keys(proyectoActual).length === 0) { showToast('Debes agregar al menos un servicio.', 'error'); return null; }
        
        const items = Object.values(proyectoActual).map(i => ({ servicio: i.servicioId, nombre: i.nombre, unidades: i.unidades, precioUnitario: i.precioUnitario }));
        const subtotal = items.reduce((sum, item) => sum + (item.precioUnitario * item.unidades), 0);
        const descuento = parseFloat(document.getElementById('proyectoDescuento').value) || 0;
        const total = Math.max(0, subtotal - descuento);
        
        const procesoBD = procesoDestino === 'Cotizacion' ? 'Solicitud' : procesoDestino;

        const body = { 
            artista: artistaId === 'publico_general' ? null : artistaId, 
            nombreProyecto: document.getElementById('nombreProyecto').value, 
            items: items, 
            total: total, 
            descuento: descuento, 
            estatus: procesoDestino === 'Cotizacion' ? 'Cotizacion' : 'Pendiente de Pago', 
            metodoPago: 'Pendiente', 
            fecha: fechaFinal.toISOString(), 
            prioridad: 'Normal', 
            proceso: procesoBD, 
            esAlbum: document.getElementById('esAlbum').checked 
        };

        try { 
            return await fetchAPI('/api/proyectos', { method: 'POST', body: JSON.stringify(body) }); 
        } catch (error) { 
            showToast(`Error al guardar: ${error.message}`, 'error'); 
            return null; 
        }
    }

    async function generarCotizacion() { const nuevoProyecto = await guardarProyecto('Cotizacion'); if (nuevoProyecto) { showToast('Cotización guardada.', 'success'); await generarCotizacionPDF(nuevoProyecto._id || nuevoProyecto); cargarOpcionesParaProyecto(); mostrarSeccion('cotizaciones'); } }
    
    async function enviarAFlujoDirecto() { 
        const nuevoProyecto = await guardarProyecto('Agendado'); 
        if (nuevoProyecto) { 
            showToast('¡Proyecto agendado con éxito!', 'success'); 
            cargarOpcionesParaProyecto(); 
            const user = getUserRoleAndId();
            if (user.role === 'cliente') { mostrarSeccion('vista-artista'); } else { mostrarSeccion('flujo-trabajo'); }
        } 
    }

    async function registrarNuevoArtistaDesdeFormulario() { const nombreInput = document.getElementById('nombreNuevoArtista'); const nombre = nombreInput.value.trim(); if (!nombre) { showToast('Introduce un nombre.', 'error'); return; } try { const nuevoArtista = await fetchAPI('/api/artistas', { method: 'POST', body: JSON.stringify({ nombre: nombre, nombreArtistico: nombre }) }); showToast('Artista guardado', 'success'); await cargarOpcionesParaSelect('/api/artistas', 'proyectoArtista', '_id', item => item.nombreArtistico || item.nombre, true); document.getElementById('proyectoArtista').value = nuevoArtista._id; document.getElementById('nuevoArtistaContainer').style.display = 'none'; nombreInput.value = ''; } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }

    function openEventModal(info) { const props = info.event.extendedProps; document.getElementById('modal-event-id').value = info.event.id; document.getElementById('modal-event-title').textContent = info.event.title; document.getElementById('modal-event-date').textContent = info.event.start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); document.getElementById('modal-event-total').textContent = `$${safeMoney(props.total)}`; document.getElementById('modal-event-status').textContent = props.estatus; document.getElementById('modal-event-services').innerHTML = (props.servicios || '').split('\n').map(s => `<li>${escapeHTML(s)}</li>`).join(''); flatpickr("#edit-event-date", { defaultDate: info.event.start, locale: "es" }); const hours = String(info.event.start.getHours()).padStart(2, '0'); const minutes = String(info.event.start.getMinutes()).padStart(2, '0'); document.getElementById('edit-event-time').value = `${hours}:${minutes}`; new bootstrap.Modal(document.getElementById('event-modal')).show(); }
    async function cancelarCita(id) { Swal.fire({ title: '¿Cancelar esta cita?', text: "La fecha se liberará.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, cancelar', cancelButtonText: 'No', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}/estatus`, { method: 'PUT', body: JSON.stringify({ estatus: 'Cancelado' }) }); showToast('Cita cancelada.', 'info'); const el = document.getElementById('event-modal'); const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); if(document.getElementById('agenda').classList.contains('active')) cargarAgenda(); if (document.getElementById('flujo-trabajo').classList.contains('active')) cargarFlujoDeTrabajo(); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } } }); }
    async function actualizarHorarioProyecto() { const id = document.getElementById('modal-event-id').value; const newDateInput = document.getElementById('edit-event-date')._flatpickr.selectedDates[0]; const newTimeInput = document.getElementById('edit-event-time').value; if (!newDateInput) return showToast("Selecciona una nueva fecha", "error"); let finalDate = new Date(newDateInput); if (newTimeInput) { const [h, m] = newTimeInput.split(':'); finalDate.setHours(h); finalDate.setMinutes(m); } try { await cambiarAtributo(id, 'fecha', finalDate.toISOString()); showToast("Horario actualizado", "success"); const el = document.getElementById('event-modal'); const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); cargarAgenda(); } catch (e) { showToast("Error al actualizar", "error"); } }
    async function cargarAgenda() { const calendarEl = document.getElementById('calendario'); if (currentCalendar) { currentCalendar.destroy(); } try { const eventos = await fetchAPI('/api/proyectos/agenda'); const isMobile = window.innerWidth < 768; currentCalendar = new FullCalendar.Calendar(calendarEl, { locale: 'es', initialView: isMobile ? 'listWeek' : 'dayGridMonth', headerToolbar: { left: 'prev,next today', center: 'title', right: isMobile ? 'listWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,listWeek' }, height: 'auto', dayMaxEvents: isMobile ? 1 : true, buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' }, navLinks: true, editable: true, events: eventos, dateClick: (info) => { if (info.view.type.includes('Grid')) { mostrarSeccion('registrar-proyecto'); document.getElementById('fechaProyecto')._flatpickr.setDate(info.date); verificarDisponibilidad(); showToast(`Fecha preseleccionada`, 'info'); } }, eventClick: openEventModal, eventDrop: async (info) => { Swal.fire({ title: '¿Reagendar?', text: `Se moverá a: ${info.event.start.toLocaleDateString()}`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'Cancelar' }).then(async (result) => { if (result.isConfirmed) { try { await cambiarAtributo(info.event.id, 'fecha', info.event.start.toISOString()); showToast('Reagendado.', 'success'); cargarFlujoDeTrabajo(); } catch (error) { info.revert(); showToast('Error al reagendar', 'error'); } } else { info.revert(); } }); }, eventContent: (arg) => { return { html: `<div class="fc-event-main-frame"><div class="fc-event-title">${escapeHTML(arg.event.title)}</div></div>` }; }, eventDidMount: function(info) { let colorVar = `var(--proceso-${info.event.extendedProps.proceso.replace(/\s+/g, '')}, var(--primary-color))`; info.el.style.backgroundColor = colorVar; info.el.style.borderColor = colorVar; } }); currentCalendar.render(); } catch (error) { calendarEl.innerHTML = '<p class="text-center text-danger">Error al cargar la agenda.</p>'; } }
    async function cambiarAtributo(id, campo, valor) { try { await fetchAPI(`/api/proyectos/${id}/${campo}`, { method: 'PUT', body: JSON.stringify({ [campo]: valor }) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) { proyecto[campo] = valor; await localforage.setItem('cache_proyectos', localCache.proyectos); } if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active').textContent.trim(); filtrarFlujo(filtroActual); } } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }

    async function aprobarCotizacion(id) { 
        Swal.fire({ 
            title: 'Aprobar y Agendar', 
            html: `
                <p class="small text-muted mb-3">Selecciona el día y la hora para agendar este proyecto en el estudio:</p>
                <input type="date" id="swal-fecha" class="form-control mb-2" min="${new Date().toISOString().split('T')[0]}">
                <input type="time" id="swal-hora" class="form-control">
            `, 
            icon: 'calendar', 
            showCancelButton: true, 
            confirmButtonText: 'Sí, Agendar', 
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const fecha = document.getElementById('swal-fecha').value;
                const hora = document.getElementById('swal-hora').value;
                if (!fecha || !hora) {
                    Swal.showValidationMessage('Debes seleccionar fecha y hora');
                }
                return { fecha, hora };
            }
        }).then(async (result) => { 
            if(result.isConfirmed) { 
                showLoader();
                try { 
                    const { fecha, hora } = result.value;
                    let fechaFinal = new Date(fecha);
                    const [h, m] = hora.split(':');
                    fechaFinal.setHours(h);
                    fechaFinal.setMinutes(m);
                    fechaFinal.setSeconds(0);

                    await fetchAPI(`/api/proyectos/${id}/fecha`, { method: 'PUT', body: JSON.stringify({ fecha: fechaFinal.toISOString() }) });
                    await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify({ proceso: 'Agendado' }) }); 
                    
                    showToast('¡Cotización aprobada y agendada con éxito!', 'success'); 
                    mostrarSeccion('flujo-trabajo'); 
                } catch (error) { 
                    showToast(`Error al aprobar: ${error.message}`, 'error'); 
                } finally {
                    hideLoader();
                }
            } 
        }); 
    }

    async function compartirPorWhatsApp(proyectoId) { try { const proyecto = await fetchAPI(`/api/proyectos/${proyectoId}`); const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'cliente'; const mensaje = `¡Hola ${nombreCliente}! Aquí tienes el resumen de tu cotización en FiaRecords:\n\n*Servicios:*\n${proyecto.items.map(i => `- ${i.unidades}x ${i.nombre}`).join('\n')}\n\n*Total a Pagar: $${safeMoney(proyecto.total)} MXN*\n\nQuedamos a tus órdenes para confirmar y agendar tu proyecto.`; window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank'); } catch (error) { showToast('Error al obtener datos', 'error'); } }
    const procesos =['Solicitud', 'Agendado', 'Grabacion', 'Edicion', 'Mezcla', 'Mastering', 'Completo'];
    async function cargarFlujoDeTrabajo(filtroActivo = 'Todos') { const board = document.getElementById('kanbanBoard'); const filtros = document.getElementById('filtrosFlujo'); if (!filtros.innerHTML) { const botonesFiltro =['Todos', ...procesos.filter(p => p !== 'Completo' && p !== 'Solicitud')]; filtros.innerHTML = botonesFiltro.map(p => `<button class="btn btn-sm btn-outline-secondary" onclick="app.filtrarFlujo('${p}')">${p}</button>`).join(''); } board.innerHTML = procesos.filter(p => p !== 'Completo' && p !== 'Solicitud').map(p => `<div class="kanban-column" data-columna="${p}"><h3>${p}</h3><div id="columna-${p}" class="kanban-column-content"></div></div>`).join(''); try { await fetchAPI('/api/proyectos'); filtrarFlujo(filtroActivo); } catch (e) { console.error("Error cargando flujo:", e); } }
    function filtrarFlujo(filtro) { 
        document.querySelectorAll('#filtrosFlujo button').forEach(b => b.classList.remove('active', 'btn-primary')); 
        const activeBtn = Array.from(document.querySelectorAll('#filtrosFlujo button')).find(b => b.textContent === filtro); 
        if (activeBtn) { activeBtn.classList.add('active', 'btn-primary'); } 
        document.querySelectorAll('.kanban-column').forEach(c => c.style.display = (filtro === 'Todos' || c.dataset.columna === filtro) ? 'flex' : 'none'); 
        procesos.forEach(col => { if (document.getElementById(`columna-${col}`)) document.getElementById(`columna-${col}`).innerHTML = '' }); 
        
        if (localCache.proyectos) { 
            localCache.proyectos.filter(p => p.proceso !== 'Completo' && p.proceso !== 'Solicitud' && p.estatus !== 'Cancelado' && p.estatus !== 'Cotizacion' && !p.deleted).forEach(p => { 
                const colEl = document.getElementById(`columna-${p.proceso}`); if (!colEl) return; 
                const card = document.createElement('div'); card.className = `project-card`; card.dataset.id = p._id; 
                card.style.borderLeftColor = `var(--proceso-${(p.proceso || '').replace(/\s+/g, '')})`; 
                const serviciosHtml = (p.items && p.items.length > 0) ? p.items.map(i => `<li class="small">${escapeHTML(i.nombre)}</li>`).join('') : `<li>${escapeHTML(p.nombreProyecto || 'Sin servicios')}</li>`; 
                const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
                card.innerHTML = `<div class="project-card-header d-flex justify-content-between align-items-center mb-2"><strong class="text-primary ${p.artista ? 'clickable-artist' : ''}" ${p.artista ? `ondblclick="app.irAVistaArtista('${p.artista._id}', '${escapeHTML(p.artista.nombre)}', '')"` : ''}>${escapeHTML(p.nombreProyecto || artistaNombre)}</strong><select onchange="app.cambiarProceso('${p._id}', this.value)" class="form-select form-select-sm" style="width: auto;">${procesos.filter(pr => pr !== 'Solicitud').map(proc => `<option value="${proc}" ${p.proceso === proc ? 'selected' : ''}>${proc}</option>`).join('')}</select></div><div class="project-card-body"><div class="small text-muted mb-2">🗓️ ${safeDate(p.fecha)}</div><ul class="list-unstyled mb-0 small">${serviciosHtml}</ul></div><div class="project-card-footer"><strong class="text-success">$${safeMoney(p.total)}</strong><div class="btn-group"><button class="btn btn-sm btn-outline-primary" title="Pago" onclick="app.registrarPago('${p._id}')"><i class="bi bi-currency-dollar"></i></button><button class="btn btn-sm btn-outline-secondary" title="Editar" onclick="app.editarInfoProyecto('${p._id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" title="Borrar" onclick="app.eliminarProyecto('${p._id}')"><i class="bi bi-trash"></i></button></div></div>`; colEl.appendChild(card); 
            }); 
        } 
    }
    async function cambiarProceso(id, proceso) { try { const data = { proceso }; if (proceso === 'Completo') { const proyecto = localCache.proyectos.find(p => p._id === id); const restante = proyecto.total - (proyecto.montoPagado || 0); if (restante > 0) { const result = await Swal.fire({ title: 'Proyecto con Saldo Pendiente', text: `Este proyecto aún debe $${restante.toFixed(2)}. ¿Deseas completarlo?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, completar', cancelButtonText: 'Cancelar' }); if (!result.isConfirmed) { cargarFlujoDeTrabajo(); return; } } } await fetchAPI(`/api/proyectos/${id}/proceso`, { method: 'PUT', body: JSON.stringify(data) }); const proyecto = localCache.proyectos.find(p => p._id === id); if (proyecto) { proyecto.proceso = proceso; await localforage.setItem('cache_proyectos', localCache.proyectos); } if (proceso === 'Completo') { showToast('¡Proyecto completado y movido a historial!', 'success'); } const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; filtrarFlujo(filtroActual); } catch (e) { showToast(`Error: ${e.message}`, 'error'); } }
    
    // ==============================================================
    // CARGAR HISTORIAL (BOTÓN VISOR)
    // ==============================================================
    async function cargarHistorial() { 
        const tablaBody = document.getElementById('tablaHistorialBody'); 
        tablaBody.innerHTML = `<tr><td colspan="7">Cargando historial...</td></tr>`; 
        try { 
            historialCacheados = await fetchAPI('/api/proyectos/completos'); 
            tablePagination.historial.page = 1;
            renderHistorialTable();
        } catch (error) { 
            console.error(error);
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error al cargar historial.</td></tr>`; 
        } 
    }

    function renderHistorialTable() {
        const tablaBody = document.getElementById('tablaHistorialBody');
        const items = historialCacheados ||[];
        const { page, limit } = tablePagination.historial;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit);

        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">No hay proyectos.</td></tr>`; 
            renderTableControls('tablaHistorialBody', 'historial', 1, 0);
            return;
        }

        tablaBody.innerHTML = paginatedItems.map(p => { 
            const artistaNombre = p.artista ? (p.artista.nombreArtistico || p.artista.nombre) : 'Público General'; 
            const esCancelado = p.estatus === 'Cancelado';
            const estadoBadge = esCancelado ? `<span class="badge bg-secondary">Cancelado</span>` : `<span class="badge bg-success">Completado</span>`;
            const rowClass = esCancelado ? 'fila-cancelada' : '';

            const showPlayer = (p.archivos && p.archivos.length > 0) || (p.enlaceEntrega && p.enlaceEntrega.length > 0);

            return `
            <tr class="${rowClass}">
                <td data-label="Fecha">${safeDate(p.fecha)}</td>
                <td data-label="Artista" class="${p.artista ? 'clickable-artist' : ''}" ondblclick="app.irAVistaArtista('${p.artista ? p.artista._id : ''}', '${escapeHTML(artistaNombre)}', '')">${escapeHTML(artistaNombre)}</td>
                <td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Sin nombre')}</td>
                <td data-label="Total">$${safeMoney(p.total)}</td>
                <td data-label="Pagado">$${safeMoney(p.montoPagado)}</td>
                <td data-label="Estado">${estadoBadge}</td>
                <td data-label="Acciones" class="table-actions">
                    ${showPlayer ? `<button class="btn btn-sm btn-info text-white" title="Visor Multimedia" onclick="app.openPlayer('${p._id}')"><i class="bi bi-play-circle-fill"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-dark" title="Generar Contrato Legal" onclick="app.generarContratoPDF('${p._id}')"><i class="bi bi-file-earmark-text"></i></button>
                    <button class="btn btn-sm btn-outline-primary" title="Entrega / Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaNombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')"><i class="bi bi-cloud-arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline-info" onclick="app.registrarPago('${p._id}', true)" title="Pagos"><i class="bi bi-cash-stack"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${p._id}')" title="Mover a Papelera"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`; 
        }).join(''); 
        
        renderTableControls('tablaHistorialBody', 'historial', page, totalPages);
    }

    async function eliminarProyecto(id, desdeCotizaciones = false) { Swal.fire({ title: '¿Mover a papelera?', text: "El proyecto se ocultará.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33' }).then(async (result) => { if(result.isConfirmed) { try { await fetchAPI(`/api/proyectos/${id}`, { method: 'DELETE' }); showToast('Movido a papelera.', 'info'); if (desdeCotizaciones) { cargarCotizaciones(); } else if (document.getElementById('historial-proyectos').classList.contains('active')) { cargarHistorial(); } else if (document.getElementById('flujo-trabajo').classList.contains('active')) { const filtroActual = document.querySelector('#filtrosFlujo button.active')?.textContent.trim() || 'Todos'; cargarFlujoDeTrabajo(filtroActual); } } catch (error) { showToast(`Error: ${error.message}`, 'error'); } } }); }
    
    // ==================================================================
    // FUNCION DE NAVEGACION CON GUARDIA DE SEGURIDAD ANTI-FLASH
    // ==================================================================
    async function mostrarSeccion(id, updateHistory = true) { 
        const userInfo = getUserRoleAndId();
        const esCliente = (userInfo.role === 'cliente');

        const seccionesProhibidasParaCliente = [
            'dashboard', 'agenda', 'flujo-trabajo', 'cotizaciones',
            'historial-proyectos', 'gestion-artistas', 'gestion-servicios',
            'gestion-usuarios', 'configuracion', 'papelera-reciclaje', 'mis-deudas'
        ];

        if (esCliente && seccionesProhibidasParaCliente.includes(id)) {
            id = 'vista-artista'; 
        }

        document.querySelectorAll('main > section').forEach(sec => sec.classList.remove('active')); 
        document.querySelectorAll('.nav-link-sidebar').forEach(link => link.classList.remove('active')); 
        
        const seccionActiva = document.getElementById(id); 
        const linkActivo = document.querySelector(`.nav-link-sidebar[data-seccion="${id}"]`); 
        
        const btnBack = document.getElementById('btn-global-back'); 
        if (btnBack) { if (id === 'dashboard' || (id === 'vista-artista' && esCliente)) { btnBack.style.display = 'none'; } else { btnBack.style.display = 'inline-flex'; } } 
        
        if (seccionActiva) { 
            seccionActiva.classList.add('active'); 
            if(linkActivo) linkActivo.classList.add('active'); 
            if (updateHistory && `#${id}` !== window.location.hash) { history.pushState(null, null, `#${id}`); } 
            
            if(document.getElementById('globalSearchPC')) document.getElementById('globalSearchPC').value = ''; 
            if(document.getElementById('globalSearchMobile')) document.getElementById('globalSearchMobile').value = ''; 
            
            if(id === 'gestion-artistas') renderPaginatedList('artistas'); 
            if(id === 'gestion-servicios') renderPaginatedList('servicios'); 
            if(id === 'gestion-usuarios') renderPaginatedList('usuarios'); 
            
            const loadDataActions = { 
                'dashboard': cargarDashboard, 
                'agenda': cargarAgenda, 
                'cotizaciones': cargarCotizaciones, 
                'flujo-trabajo': cargarFlujoDeTrabajo, 
                'pagos': cargarPagos, 
                'registrar-proyecto': cargarOpcionesParaProyecto, 
                'historial-proyectos': cargarHistorial, 
                'papelera-reciclaje': cargarPapelera, 
                'configuracion': cargarConfiguracion,
                'mis-deudas': cargarDeudas,
                'vista-artista': () => { } 
            }; 
            if(loadDataActions[id]) await loadDataActions[id](); 
        } 
    }

    function irAlDashboard() { 
        const role = document.body.getAttribute('data-role'); 
        if (role === 'cliente') { mostrarSeccion('vista-artista'); } 
        else { mostrarSeccion('dashboard'); } 
    }
    
    // --- VISTA ARTISTA ---
    async function mostrarVistaArtista(artistaId, nombre, nombreArtistico) {
        const userInfo = getUserRoleAndId(); const isClientView = (userInfo.role === 'cliente');
        const contenido = document.getElementById('vista-artista-contenido');
        contenido.innerHTML = '<div class="text-center p-5"><div class="spinner-border" role="status"></div></div>';
        try {
            const [proyectos, artistaInfo] = await Promise.all([fetchAPI(`/api/proyectos/por-artista/${artistaId}`), fetchAPI(`/api/artistas/${artistaId}`)]);
            
            let html = `<div class="mb-3">${!isClientView ? `<button class="btn-back-inline" onclick="app.irAlDashboard()"><i class="bi bi-arrow-left"></i> Volver</button>` : ''}<h2 class="mb-0" id="vista-artista-nombre">${escapeHTML(nombreArtistico || nombre)}</h2></div>
                        <div class="card mb-4" style="background-color: var(--card-bg, inherit); color: var(--text-color, inherit);"><div class="card-body"><div class="d-flex justify-content-between align-items-start flex-wrap"><div><p class="mb-1"><strong>Nombre Real:</strong> ${escapeHTML(artistaInfo.nombre)}</p><p class="mb-1"><strong>Tel:</strong> ${escapeHTML(artistaInfo.telefono || 'N/A')}</p><p class="mb-0"><strong>Email:</strong> ${escapeHTML(artistaInfo.correo || 'N/A')}</p></div>`;
            
            if (!isClientView) { 
                html += `<div class="btn-group mt-2 mt-md-0">
                            <button class="btn btn-sm btn-outline-secondary" onclick="app.abrirModalEditarArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(artistaInfo.nombreArtistico || '')}', '${escapeHTML(artistaInfo.telefono || '')}', '${escapeHTML(artistaInfo.correo || '')}')"><i class="bi bi-pencil"></i> Editar</button>
                            <button class="btn btn-sm btn-info text-white" onclick="app.abrirModalProyectoDirecto('${artistaInfo._id}')"><i class="bi bi-archive"></i> Catálogo Antiguo</button>
                            <button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button>
                         </div>`; 
            } else { 
                html += `<div class="btn-group mt-2 mt-md-0"><button class="btn btn-sm btn-primary" onclick="app.nuevoProyectoParaArtista('${artistaInfo._id}', '${escapeHTML(artistaInfo.nombre)}')"><i class="bi bi-plus-circle"></i> Nuevo Proyecto</button></div>`; 
            }
            
            html += `</div></div></div><h3>Historial de Proyectos</h3>`;
            if (proyectos.length) { 
                html += '<div class="table-responsive"><table class="table table-hover"><thead><tr><th>Fecha</th><th>Proyecto</th><th>Total</th><th>Pagado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'; 
                proyectos.forEach(p => { 
                    let accionesHtml = `<button class="btn btn-sm btn-outline-secondary" title="Cotización PDF" onclick="app.generarCotizacionPDF('${p._id}')"><i class="bi bi-file-earmark-pdf"></i></button>`; 
                    
                    if ((p.archivos && p.archivos.length > 0) || (p.enlaceEntrega && p.enlaceEntrega.length > 0)) {
                        accionesHtml += `<button class="btn btn-sm btn-info ms-1 text-white" title="Visor Multimedia" onclick="app.openPlayer('${p._id}')"><i class="bi bi-play-circle-fill"></i></button>`;
                    }

                    if (p.enlaceEntrega) accionesHtml += `<a href="${p.enlaceEntrega}" target="_blank" class="btn btn-sm btn-success ms-1" title="Descargar Carpeta"><i class="bi bi-cloud-download"></i></a>`; 
                    if (!isClientView) { accionesHtml += `<button class="btn btn-sm btn-outline-dark ms-1" title="Contrato Legal" onclick="app.generarContratoPDF('${p._id}')"><i class="bi bi-file-earmark-text"></i></button><button class="btn btn-sm btn-outline-primary ms-1" title="Entrega/Drive" onclick="app.openDeliveryModal('${p._id}', '${escapeHTML(artistaInfo.nombre)}', '${escapeHTML(p.nombreProyecto || 'Proyecto')}')"><i class="bi bi-cloud-arrow-up"></i></button><button class="btn btn-sm btn-outline-danger ms-1" title="Borrar" onclick="app.eliminarProyecto('${p._id}')"><i class="bi bi-trash"></i></button>`; } 
                    
                    html += `<tr><td data-label="Fecha">${safeDate(p.fecha)}</td><td data-label="Proyecto">${escapeHTML(p.nombreProyecto || 'Proyecto sin nombre')}</td><td data-label="Total">$${safeMoney(p.total)}</td><td data-label="Pagado">$${safeMoney(p.montoPagado)}</td><td data-label="Estado"><span class="badge" style="background-color: var(--proceso-${(p.proceso || '').replace(/\s+/g, '')})">${p.proceso}</span></td><td data-label="Acciones" class="table-actions">${accionesHtml}</td></tr>`; 
                }); 
                html += '</tbody></table></div>'; 
            } else { html += '<p>Este artista aún no tiene proyectos registrados.</p>'; }
            
            contenido.innerHTML = html; mostrarSeccion('vista-artista', false); 
        } catch (e) { contenido.innerHTML = '<p class="text-danger text-center">Error al cargar el historial.</p>'; console.error(e); }
    }

    async function irAVistaAr