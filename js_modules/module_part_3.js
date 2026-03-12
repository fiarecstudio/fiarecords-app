tista(artistaId, artistaNombre, nombreArtistico) { const userInfo = getUserRoleAndId(); if (!artistaId) { if (userInfo.role === 'cliente' && userInfo.artistaId) { artistaId = userInfo.artistaId; if (!artistaNombre) artistaNombre = userInfo.username; } else { const artistas = await fetchAPI('/api/artistas'); const artista = artistas.find(a => a.nombre === artistaNombre || a.nombreArtistico === artistaNombre); if (artista) artistaId = artista._id; else return; } } mostrarVistaArtista(artistaId, artistaNombre, nombreArtistico); }
    function nuevoProyectoParaArtista(idArtista, nombreArtista) { preseleccionArtistaId = idArtista; mostrarSeccion('registrar-proyecto'); showToast(`Iniciando proyecto para: ${nombreArtista}`, 'info'); }
    
    // --- LÓGICA PARA AÑADIR PROYECTO DIRECTO AL HISTORIAL ---
    function abrirModalProyectoDirecto(artistaId) {
        document.getElementById('directoArtistaId').value = artistaId;
        document.getElementById('directoNombreProyecto').value = '';
        document.getElementById('directoEnlace').value = '';
        new bootstrap.Modal(document.getElementById('modalProyectoDirecto')).show();
    }

    async function guardarProyectoDirecto(e) {
        e.preventDefault();
        const artistaId = document.getElementById('directoArtistaId').value;
        const nombreProyecto = document.getElementById('directoNombreProyecto').value;
        const enlaceEntrega = document.getElementById('directoEnlace').value;

        showLoader();
        try {
            await fetchAPI('/api/proyectos/directo', {
                method: 'POST',
                body: JSON.stringify({ artistaId, nombreProyecto, enlaceEntrega })
            });

            showToast('Proyecto anterior añadido al catálogo.', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalProyectoDirecto')).hide();
            
            // Recargar la vista del artista para ver el nuevo proyecto en la tabla
            const nombreArtisticoActual = document.getElementById('vista-artista-nombre').textContent;
            mostrarVistaArtista(artistaId, nombreArtisticoActual, '');

        } catch (error) {
            showToast('Error al añadir proyecto: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }

    // =========================================================
    // NUEVAS FUNCIONES PARA PLANTILLAS DE DOCUMENTOS
    // =========================================================
    function procesarVariablesComunes(texto, proyecto) {
        if(!texto) return '';
        const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General';
        const nombreProyecto = proyecto.nombreProyecto || 'Sin Nombre';
        return texto
            .replace(/\{\{CLIENTE\}\}/g, nombreCliente)
            .replace(/\{\{PROYECTO\}\}/g, nombreProyecto)
            .replace(/\{\{TOTAL\}\}/g, `$${safeMoney(proyecto.total)}`)
            .replace(/\{\{PAGADO\}\}/g, `$${safeMoney(proyecto.montoPagado || 0)}`)
            .replace(/\{\{RESTANTE\}\}/g, `$${safeMoney(proyecto.total - (proyecto.montoPagado || 0))}`)
            .replace(/\{\{FECHA\}\}/g, new Date().toLocaleDateString());
    }

    // Función de PDF Básica (Logo y Firma)
    function dibujarLogoEnPDF(pdf, logoData) { 
        if (!logoData) return; 
        const imgProps = pdf.getImageProperties(logoData); 
        const originalWidth = imgProps.width; 
        const originalHeight = imgProps.height; 
        const maxBoxWidth = 50; 
        const maxBoxHeight = 25; 
        let finalWidth = maxBoxWidth; 
        let finalHeight = (originalHeight * maxBoxWidth) / originalWidth; 
        if (finalHeight > maxBoxHeight) { finalHeight = maxBoxHeight; finalWidth = (originalWidth * maxBoxHeight) / originalHeight; } 
        pdf.addImage(logoData, 'PNG', 14, 15, finalWidth, finalHeight); 
    }

    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto) { let firmaSrc = null; if (configCache) { if (configCache.firmaBase64) firmaSrc = configCache.firmaBase64; else if (configCache.firmaPath) firmaSrc = configCache.firmaPath; } try { if (firmaSrc) { let base64data = firmaSrc; if (!firmaSrc.startsWith('data:image')) { const response = await fetch(firmaSrc); if (!response.ok) throw new Error('No se pudo cargar la firma.'); const firmaImg = await response.blob(); const reader = new FileReader(); const promise = new Promise((resolve) => { reader.onloadend = () => { resolve(reader.result); }; reader.readAsDataURL(firmaImg); }); base64data = await promise; } const pos = {x: PDF_DIMENSIONS.WIDTH - 64, y: PDF_DIMENSIONS.HEIGHT - 44, w: 50, h: 20}; pdf.addImage(base64data, 'PNG', pos.x, pos.y, pos.w, pos.h); pdf.line(pos.x, pos.y + pos.h + 2, pos.x + pos.w, pos.y + pos.h + 2); pdf.text("Erick Resendiz", pos.x, pos.y + pos.h + 7, { align: 'left' }); pdf.text("Representante FIA Records", pos.x, pos.y + pos.h + 12, { align: 'left' }); } pdf.save(finalFileName); } catch (e) { console.error("Error firma PDF:", e); pdf.save(finalFileName); } }
    
    // =========================================================
    // GENERADORES DE PDF ACTUALIZADOS
    // =========================================================
    async function generarCotizacionPDF(proyectoIdOrObject) { 
        try { 
            const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; 
            const { jsPDF } = window.jspdf; 
            const pdf = new jsPDF(); 
            
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64); 
            
            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 
            
            pdf.setFontSize(11); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General'}`, 14, 50); 
            pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 50, { align: 'right' }); 
            
            const body = proyecto.items.map(item =>[`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); 
            if (proyecto.descuento && proyecto.descuento > 0) { body.push(['Descuento', `-$${proyecto.descuento.toFixed(2)}`]); } 
            
            pdf.autoTable({ startY: 70, head: [['Servicio', 'Subtotal']], body: body, theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor:[0, 0, 0] } }); 
            
            let finalY = pdf.lastAutoTable.finalY + 10; 
            pdf.setFontSize(12); 
            pdf.setFont(undefined, 'bold'); 
            pdf.text(`Total: $${safeMoney(proyecto.total)} MXN`, 196, finalY, { align: 'right' }); 

            const terminosTextBruto = pDoc.terminosCotizacion !== undefined ? pDoc.terminosCotizacion : "Este presupuesto tiene una vigencia de 15 días.";
            if(terminosTextBruto) {
                finalY += 15;
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'normal');
                const terminosText = procesarVariablesComunes(terminosTextBruto, proyecto);
                const splitText = pdf.splitTextToSize(terminosText, 180);
                pdf.text(splitText, 14, finalY);
            }

            const fileName = `Cotizacion-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto); 
        } catch (error) { showToast("Error al generar PDF", 'error'); console.error(error); } 
    }

    async function generarReciboPDF(proyecto, pagoEspecifico) { 
        try { 
            const { jsPDF } = window.jspdf; 
            const pdf = new jsPDF(); 
            const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : { monto: proyecto.montoPagado || 0, metodo: 'Varios' }); 
            if (!pago) return showToast('No hay pagos.', 'error'); 
            
            const saldoRestante = proyecto.total - proyecto.montoPagado; 
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64); 
            
            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 

            pdf.setFontSize(16); 
            pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); 
            
            pdf.setFontSize(11); 
            pdf.setFont(undefined, 'normal'); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'General'}`, 14, 60); 
            
            pdf.autoTable({ startY: 70, theme: 'striped', body: [['Total del Proyecto:', `$${safeMoney(proyecto.total)}`],['Monto de este Recibo:', `$${safeMoney(pago.monto)} (${pago.metodo})`],['Saldo Restante:', `$${safeMoney(saldoRestante)}`]] }); 
            
            let finalY = pdf.lastAutoTable.finalY + 15;
            
            const notaTextBruto = pDoc.terminosRecibo !== undefined ? pDoc.terminosRecibo : "¡Gracias por tu confianza, {{CLIENTE}}!";
            if(notaTextBruto) {
                pdf.setFontSize(10);
                const notaText = procesarVariablesComunes(notaTextBruto, proyecto);
                const splitNota = pdf.splitTextToSize(notaText, 180);
                pdf.text(splitNota, 14, finalY);
            }

            const fileName = `Recibo_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); 
        } catch (error) { showToast('Error al generar recibo.', 'error'); console.error(error); } 
    }

    async function generarContratoPDF(proyectoId) {
        try {
            const proyecto = typeof proyectoId === 'string' ? await fetchAPI(`/api/proyectos/${proyectoId}`) : proyectoId;
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            
            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64);
            
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 

            const plantilla = pDoc.plantillaContrato || "CONTRATO DE SERVICIOS\n\nPor favor, configura tu plantilla legal en la sección de Configuración.";
            const textoFinal = procesarVariablesComunes(plantilla, proyecto);
            
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "normal");
            
            // Envuelve el texto largo en líneas que quepan en la hoja (180mm de ancho)
            const lineas = pdf.splitTextToSize(textoFinal, 180);
            
            let y = 45; // Posición de inicio en el eje Y
            const altoHoja = pdf.internal.pageSize.height;
            
            // Dibuja línea por línea. Si se acaba la hoja, crea una nueva.
            for(let i=0; i<lineas.length; i++) {
                if (y > altoHoja - 30) {
                    pdf.addPage();
                    y = 20; // Reinicia Y al inicio de la nueva página
                }
                pdf.text(lineas[i], 14, y);
                y += 6; // Espacio entre renglones
            }
            
            const fileName = `Contrato_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`;
            await addFirmaToPdf(pdf, 'contrato', fileName, proyecto);
            showToast('Contrato Generado', 'success');
        } catch (error) {
            showToast("Error al generar Contrato", 'error');
            console.error(error);
        }
    }

    function setupMobileMenu() { const hamburger = document.getElementById('hamburger-menu'); const sidebar = document.querySelector('.sidebar'); const overlay = document.getElementById('sidebar-overlay'); const toggleMenu = () => { sidebar.classList.toggle('show'); overlay.classList.toggle('show'); }; if (hamburger) hamburger.addEventListener('click', toggleMenu); if (overlay) overlay.addEventListener('click', toggleMenu); document.querySelectorAll('.nav-link-sidebar, #btn-nuevo-proyecto-sidebar').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768) { sidebar.classList.remove('show'); overlay.classList.remove('show'); } }); }); }
    
    // ==================================================================
    // AUTH & INIT CON REDIRECCION ESTRICTA
    // ==================================================================
    function showLogin() {
        document.body.classList.add('auth-visible');
        localStorage.removeItem('token');
        history.pushState("", document.title, window.location.pathname);
        DOMElements.loginContainer.style.display = 'flex'; 
        DOMElements.appWrapper.style.display = 'none';
        toggleAuth('login');
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
        fetchPublicLogo();
    }
    
    async function showApp(payload) {
        document.body.classList.remove('auth-visible');
        const role = payload.role ? payload.role.toLowerCase() : 'cliente';
        document.body.setAttribute('data-role', role); 
        renderSidebar(payload); 
        
        if (!configCache) await loadInitialConfig();
        if(DOMElements.welcomeUser) DOMElements.welcomeUser.textContent = `Hola, ${escapeHTML(payload.username)}`;
        
        const datosBancariosBtn = document.querySelector('[data-bs-target="#modalDatosBancarios"]');
        if (datosBancariosBtn) {
            if (role === 'cliente') { datosBancariosBtn.style.display = 'none'; } 
            else { datosBancariosBtn.style.display = 'block'; }
        }

        if (!isInitialized) { initAppEventListeners(payload); isInitialized = true; }
        DOMElements.loginContainer.style.display = 'none'; 
        DOMElements.appWrapper.style.display = 'flex'; 
        
        setupCustomization(payload);

        if (role === 'cliente') {
             if(payload.artistaId) {
                 await mostrarVistaArtista(payload.artistaId, payload.username, payload.nombre || payload.username);
                 mostrarSeccion('vista-artista', false); 
             } else {
                 document.getElementById('vista-artista-contenido').innerHTML = '<div class="alert alert-warning">No se encontró un perfil de artista vinculado. Contacta a soporte.</div>';
                 mostrarSeccion('vista-artista', false);
             }
        } else { 
            const hashSection = location.hash.replace('#', '');
            mostrarSeccion(hashSection || 'dashboard', false); 
        }
        
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
    }

    function setupAuthListeners() {
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!navigator.onLine) { return showToast('Se requiere internet.', 'error'); }
            showLoader();
            try {
                const userVal = document.getElementById('username').value;
                const passVal = document.getElementById('password').value;
                const res = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: userVal, password: passVal })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                localStorage.setItem('token', data.token);
                await showApp(JSON.parse(atob(data.token.split('.')[1])));
            } catch (error) { document.getElementById('login-error').textContent = error.message; } finally { hideLoader(); }
        });
        
        document.getElementById('toggle-password').addEventListener('click', () => {
             const passwordInput = document.getElementById('password');
             passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
        document.getElementById('toggle-password-reg').addEventListener('click', () => {
            const passwordInput = document.getElementById('reg-password');
            passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
    }

    // ==================================================================
    // FUNCIONES DE PAGINACIÓN DE TABLAS Y BUSCADOR INTELIGENTE
    // ==================================================================
    function renderTableControls(tableBodyId, listKey, page, totalPages) {
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;
        const tableEl = tbody.closest('table');
        const wrapper = tableEl.parentNode;
        let controls = wrapper.querySelector('.table-pagination-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'table-pagination-controls d-flex justify-content-between align-items-center mt-3';
            wrapper.appendChild(controls);
        }
        if (totalPages > 1) {
            controls.innerHTML = `
                <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', -1)">Anterior</button>
                <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', 1)">Siguiente</button>
            `;
        } else {
            controls.innerHTML = '';
        }
    }

    function changeTablePage(listKey, delta) {
        tablePagination[listKey].page += delta;
        if (listKey === 'historial') renderHistorialTable();
        if (listKey === 'cotizaciones') renderCotizacionesTable();
        if (listKey === 'pagosPendientes') renderPagosPendientesTable();
        if (listKey === 'pagosHistorial') renderPagosHistorialTable();
    }

    function filtrarTablas(query) { 
        query = query.toLowerCase(); 
        const inputPC = document.getElementById('globalSearchPC'); 
        const inputMobile = document.getElementById('globalSearchMobile'); 
        if(document.activeElement === inputPC && inputMobile) inputMobile.value = query; 
        if(document.activeElement === inputMobile && inputPC) inputPC.value = query; 

        const activeSection = document.querySelector('section.active');
        if (!activeSection) return;
        const sectionId = activeSection.id;

        if (sectionId === 'gestion-artistas') renderPaginatedList('artistas', query); 
        else if (sectionId === 'gestion-servicios') renderPaginatedList('servicios', query); 
        else if (sectionId === 'gestion-usuarios') renderPaginatedList('usuarios', query); 
        
        else if (sectionId === 'historial-proyectos') {
            tablePagination.historial.filter = query;
            tablePagination.historial.page = 1;
            renderHistorialTable();
        }
        else if (sectionId === 'cotizaciones') {
            tablePagination.cotizaciones.filter = query;
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        }
        else if (sectionId === 'pagos') {
            if (document.getElementById('vista-pagos-pendientes').style.display !== 'none') {
                tablePagination.pagosPendientes.filter = query;
                tablePagination.pagosPendientes.page = 1;
                renderPagosPendientesTable();
            } else {
                tablePagination.pagosHistorial.filter = query;
                tablePagination.pagosHistorial.page = 1;
                renderPagosHistorialTable();
            }
        }
        else if (sectionId === 'flujo-trabajo') {
            document.querySelectorAll('.project-card').forEach(card => { 
                const text = card.innerText.toLowerCase(); 
                card.style.display = text.includes(query) ? 'flex' : 'none'; 
            }); 
        }
        else if (sectionId === 'mis-deudas') {
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else if (sectionId === 'papelera-reciclaje') {
            activeSection.querySelectorAll('.list-group-item').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else {
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
    }

    async function guardarDatosBancarios() { const datos = { banco: document.getElementById('banco').value, titular: document.getElementById('titular').value, tarjeta: document.getElementById('tarjeta').value, clabe: document.getElementById('clabe').value }; try { await fetchAPI('/api/configuracion/datos-bancarios', { method: 'PUT', body: JSON.stringify({ datosBancarios: datos }) }); configCache.datosBancarios = datos; bootstrap.Modal.getInstance(document.getElementById('modalDatosBancarios')).hide(); Swal.fire({ icon: 'success', title: 'Datos bancarios guardados', timer: 1500, showConfirmButton: false }); } catch (e) { showToast('Error al guardar', 'error'); } }
    async function cargarDatosBancariosEnModal() { try { if (!configCache || !configCache.datosBancarios) { await loadInitialConfig(); } const db = configCache.datosBancarios || {}; document.getElementById('banco').value = db.banco || ''; document.getElementById('titular').value = db.titular || ''; document.getElementById('tarjeta').value = db.tarjeta || ''; document.getElementById('clabe').value = db.clabe || ''; } catch (error) { console.error("Error al cargar datos bancarios:", error); } }
    function generarDatosBancariosPDF() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(18).setFont(undefined, 'bold').text("DATOS BANCARIOS", 105, 45, { align: 'center' }); const data = [['Banco:', db.banco || ''],['Titular:', db.titular || ''],['Número de Tarjeta:', db.tarjeta || ''],['CLABE Interbancaria:', db.clabe || '']]; pdf.autoTable({ startY: 60, body: data, theme: 'striped', styles: { fontSize: 14, cellPadding: 3 } }); pdf.save("FiaRecords_DatosBancarios.pdf"); }
    function compartirDatosBancariosWhatsApp() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const msg = `*Datos Bancarios FiaRecords*\n\n*Banco:* ${db.banco}\n*Titular:* ${db.titular}\n*Tarjeta:* ${db.tarjeta}\n*CLABE:* ${db.clabe}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }
    async function subirFirma(event) { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file); try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); const newSrc = data.firmaBase64; document.getElementById('firma-preview-img').src = newSrc; if (configCache) configCache.firmaBase64 = data.firmaBase64; } catch (e) { showToast(`Error al subir la firma`, 'error'); } }
    
    // --- ACTUALIZADO PARA LLENAR PLANTILLAS AL ABRIR ---
    async function cargarConfiguracion() { 
        try { 
            if (!configCache) await loadInitialConfig();
            
            const firmaPreview = document.getElementById('firma-preview-img');
            let firmaSrc = 'https://placehold.co/150x60?text=Subir+Firma';
            if (configCache && configCache.firmaBase64) firmaSrc = configCache.firmaBase64; 
            firmaPreview.src = firmaSrc; 
            
            const db = configCache.datosBancarios || {}; 
            document.getElementById('banco').value = db.banco || ''; 
            document.getElementById('titular').value = db.titular || ''; 
            document.getElementById('tarjeta').value = db.tarjeta || ''; 
            document.getElementById('clabe').value = db.clabe || ''; 

            const tbody = document.getElementById('tabla-horarios-body');
            tbody.innerHTML = '';
            
            const horarios = configCache.horarioLaboral || {};
            
            DIAS_SEMANA.forEach((nombreDia, index) => {
                const h = horarios[index.toString()] || { activo: (index !== 0), inicio: "10:00", fin: "20:00" };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${nombreDia}</strong></td>
                    <td>
                        <div class="form-check form-switch">
                            <input class="form-check-input check-dia-activo" type="checkbox" 
                                   id="dia-activo-${index}" ${h.activo ? 'checked' : ''} 
                                   onchange="app.toggleInputsHorario(${index})">
                            <label class="form-check-label" for="dia-activo-${index}">Abierto</label>
                        </div>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-inicio-${index}" 
                               value="${h.inicio}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-fin-${index}" 
                               value="${h.fin}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Cargar Plantillas de Documentos
            const p = configCache.plantillasDoc || {};
            document.getElementById('plantilla-enc1').value = p.encabezado1 || 'FiaRecords Studio';
            document.getElementById('plantilla-enc2').value = p.encabezado2 || 'Juárez N.L.';
            document.getElementById('plantilla-term-cotiz').value = p.terminosCotizacion || 'Este presupuesto tiene una vigencia de 15 días.';
            document.getElementById('plantilla-term-recibo').value = p.terminosRecibo || '¡Gracias por tu pago!';
            document.getElementById('plantilla-contrato').value = p.plantillaContrato || 'CONTRATO DE PRESTACIÓN DE SERVICIOS\n\nEntre FiaRecords y {{CLIENTE}} para el proyecto {{PROYECTO}}...\n\n(Edita esto en configuración)';

        } catch (e) { showToast('Error al cargar configuración.', 'error'); } 
    }

    async function cargarCotizaciones() { 
        const tablaBody = document.getElementById('tablaCotizacionesBody'); 
        tablaBody.innerHTML = `<tr><td colspan="4">Cargando cotizaciones...</td></tr>`; 
        try { 
            cotizacionesCacheadas = await fetchAPI('/api/proyectos/cotizaciones'); 
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        } catch (e) { 
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar.</td></tr>`; 
        } 
    }
    
    function renderCotizacionesTable() {
        const tablaBody = document.getElementById('tablaCotizacionesBody');
        let items = cotizacionesCacheadas ||[];

        const filterText = tablePagination.cotizaciones.filter || '';
        if (filterText) {
            items = items.filter(c => {
                const artista = c.artista ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General';
                return artista.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.cotizaciones;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;
        
        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center">No hay cotizaciones pendientes.</td></tr>`;
            renderTableControls('tablaCotizacionesBody', 'cotizaciones', 1, 0);
            return;
        }
        
        tablaBody.innerHTML = paginatedItems.map(c => { 
            const esArtistaRegistrado = c.artista && c.artista._id; 
            const nombreArtista = esArtistaRegistrado ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General'; 
            return `<tr><td data-label="Artista" class="${esArtistaRegistrado ? 'clickable-artist' : ''}" ${esArtistaRegistrado ? `ondblclick="app.irAVistaArtista('${c.artista._id}', '${escapeHTML(c.artista.nombre)}', '${escapeHTML(c.artista.nombreArtistico || '')}')"` : ''}>${escapeHTML(nombreArtista)}</td><td data-label="Total">$${safeMoney(c.total)}</td><td data-label="Fecha">${safeDate(c.createdAt)}</td><td data-label="Acciones" class="table-actions"><button class="btn btn-sm btn-success" onclick="app.aprobarCotizacion('${c._id}')" title="Aprobar"><i class="bi bi-check-lg"></i></button><button class="btn btn-sm btn-outline-secondary" title="Generar PDF" onclick="app.generarCotizacionPDF('${c._id}')"><i class="bi bi-file-earmark-pdf"></i></button><button class="btn btn-sm btn-outline-success" title="WhatsApp" onclick="app.compartirPorWhatsApp('${c._id}')"><i class="bi bi-whatsapp"></i></button><button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${c._id}', true)" title="Borrar"><i class="bi bi-trash"></i></button></td></tr>`; 
        }).join('');
        
        renderTableControls('tablaCotizacionesBody', 'cotizaciones', page, totalPages);
    }
    
    // ==================================================================
    // LÓGICA DE PAPELERA PAGINADA
    // ==================================================================
    async function cargarPapelera() {
        const endpoints =['servicios', 'artistas', 'usuarios', 'proyectos'];
        for (const endpoint of endpoints) {
            try {
                const data = await fetchAPI(`/api/${endpoint}/papelera/all`);
                localCache.trash[endpoint] = data; 
                trashPagination[endpoint].page = 1; 
                renderTrashList(endpoint); 
            } catch (e) {
                console.error(`Error loading trash for ${endpoint}:`, e);
                const listEl = document.getElementById(`papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`);
                if(listEl) listEl.innerHTML = `<li class="list-group-item text-danger small">Error cargando.</li>`;
            }
        }
    }

    function renderTrashList(endpoint) {
        const listId = `papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        const listEl = document.getElementById(listId);
        const controlsEl = document.getElementById(`${listId}Controls`);
        if (!listEl) return;

        const items = localCache.trash[endpoint] ||[];
        const { page, limit } = trashPagination[endpoint];
        
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedItems = items.slice(start, end);
        const totalPages = Math.ceil(items.length / limit);

        if (paginatedItems.length === 0) {
            listEl.innerHTML = `<li class="list-group-item text-muted small">Papelera vacía.</li>`;
            if(controlsEl) controlsEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = paginatedItems.map(item => {
            let displayName = 'Item sin nombre';
            if (endpoint === 'proyectos') {
                const nombreArt = item.artista ? (item.artista.nombreArtistico || item.artista.nombre) : 'Sin Artista';
                const nombreProj = item.nombreProyecto || 'Proyecto General';
                displayName = `${nombreProj} - ${nombreArt} (${safeDate(item.fecha)})`;
            } else {
                displayName = item.nombre || item.username || item.nombreArtistico || item.nombreProyecto || 'Item sin nombre';
                if (endpoint === 'servicios' && item.precio) displayName += ` ($${item.precio})`;
                if (endpoint === 'usuarios') displayName += ` (${item.role})`;
            }
            return `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span class="text-truncate" style="max-width: 70%;">${escapeHTML(displayName)}</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-success" onclick="app.restaurarItem('${item._id}', '${endpoint}')" title="Restaurar"><i class="bi bi-arrow-counterclockwise"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="app.eliminarPermanente('${item._id}', '${endpoint}')" title="Eliminar Permanente"><i class="bi bi-x-octagon-fill"></i></button>
                </div>
            </li>`;
        }).join('');

        if (controlsEl) {
            if (totalPages > 1) {
                controlsEl.innerHTML = `
                    <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', -1)">Anterior</button>
                    <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                    <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', 1)">Siguiente</button>
                `;
            } else {
                controlsEl.innerHTML = ''; 
            }
        }
    }

    function changeTrashPage(endpoint, delta) {
        trashPagination[endpoint].page += delta;
        renderTrashList(endpoint);
    }
    
    // ==================================================================
    // LISTAS NORMALES (ARTISTAS, SERVICIOS)
    // ==================================================================
    async function renderPaginatedList(endpoint, filterText = null) { 
        const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
        const listEl = document.getElementById(listId); 
        if(!listEl) return; 
        
        const userInfo = getUserRoleAndId(); 
        const isClient = (userInfo.role === 'cliente'); 
        
        if (navigator.onLine && filterText === null) {
            try { 
                localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); 
                await localforage.setItem(`cache_${endpoint}`, localCache[endpoint]);
            } catch(e) { console.error("Error fetching " + endpoint); }
        } else if (!localCache[endpoint] || localCache[endpoint].length === 0) {
            try { localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); } catch(e) {}
        }
        
        let data = localCache[endpoint] ||[];
        
        if (filterText !== null) { 
            paginationState[endpoint].filter = filterText.toLowerCase(); 
            paginationState[endpoint].page = 1; 
        } 
        
        const currentFilter = paginationState[endpoint].filter; 
        let filteredData = data; 
        
        if (currentFilter) { 
            filteredData = data.filter(item => { 
                const name = item.nombre || item.username || item.nombreArtistico || ''; 
                return name.toLowerCase().includes(currentFilter); 
            }); 
        } 
        
        const page = paginationState[endpoint].page; 
        const limit = paginationState[endpoint].limit; 
        const start = (page - 1) * limit; 
        const end = start + limit; 
        const paginatedItems = filteredData.slice(start, end); 
        const totalPages = Math.ceil(filteredData.length / limit) || 1; 
        
        listEl.innerHTML = paginatedItems.length ? paginatedItems.map(item => { 
            let displayName, editAction; 
            let viewButton = ''; 

            if (endpoint === 'artistas') { 
                displayName = `${item.nombreArtistico || item.nombre}`; 
                editAction = `app.abrirModalEditarArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}', '${escapeHTML(item.telefono || '')}', '${escapeHTML(item.correo || '')}')`;
                viewButton = `<button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')" title="Ver Perfil"><i class="bi bi-eye"></i></button>`;
            } else if (endpoint === 'usuarios') { 
                displayName = `${item.username} (${item.role})`; 
                editAction = `app.abrirModalEditarUsuario('${escapeHTML(JSON.stringify(item))}')`; 
            } else { 
                const vis = item.visible !== false; 
                displayName = `${item.nombre} - $${item.precio.toFixed(2)} ${vis ? '' : '<span class="badge bg-warning text-dark ms-2">Oculto</span>'}`; 
                editAction = `app.abrirModalEditarServicio('${item._id}', '${escapeHTML(item.nombre)}', '${item.precio}', ${vis})`; 
            } 
            
            const clickHandler = (endpoint === 'artistas') ? `ondblclick="app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')"` : ''; 
            const listItemClass = `list-group-item d-flex justify-content-between align-items-center ${endpoint === 'artistas' ? 'list-group-item-action' : ''}`; 
            let buttonsHtml = ''; 
            
            if (!isClient) { 
                buttonsHtml = `<div class="btn-group">${viewButton}<button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); ${editAction}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')"><i class="bi bi-trash"></i></button></div>`; 
            } 
            
            return `<li class="${listItemClass}" ${clickHandler} style="${endpoint === 'artistas' ? 'cursor:pointer;' : ''}"><span>${displayName}</span>${buttonsHtml}</li>`; 
        }).join('') : `<li class="list-group-item">No hay resultados.</li>`; 
        
        renderPaginationControls(listEl, endpoint, page, totalPages); 
    }
    
    function renderPaginationControls(container, endpoint, currentPage, totalPages) { let controls = container.parentNode.querySelector('.pagination-controls'); if(controls) controls.remove(); if (totalPages <= 1) return; controls = document.createElement('div'); controls.className = 'pagination-controls'; controls.innerHTML = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="app.changePage('${endpoint}', -1)">Anterior</button><span class="pagination-info">Página ${currentPage} de ${totalPages}</span><button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.changePage('${endpoint}', 1)">Siguiente</button>`; container.parentNode.appendChild(controls); }
    function changePage(endpoint, delta) { paginationState[endpoint].page += delta; renderPaginatedList(endpoint, null); }
    function limpiarForm(formId) { const f = document.getElementById(formId); if(f) f.reset(); }
    async function saveItem(e, type) { e.preventDefault(); const form = e.target; let body; if (type === 'servicios') { const vis = document.getElementById('visibleServicio'); body = { nombre: form.nombreServicio.value, precio: parseFloat(form.precioServicio.value), visible: vis ? vis.checked : true }; } else if (type === 'artistas') { body = { nombre: form.nombreArtista.value, nombreArtistico: form.nombreArtisticoArtista.value, telefono: form.telefonoArtista.value, correo: form.correoArtista.value }; } else if (type === 'usuarios') { const userVal = document.getElementById('usernameUsuario').value; const emailVal = document.getElementById('emailUsuario').value; const roleVal = document.getElementById('roleUsuario').value; const passVal = document.getElementById('passwordUsuario').value; const checkboxes = document.querySelectorAll('#formUsuarios input[name="user_permisos"]:checked'); const permisos = Array.from(checkboxes).map(c => c.value); body = { username: userVal, email: emailVal, role: roleVal, permisos: permisos, password: passVal }; if (!passVal) { showToast('La contraseña es requerida para crear un usuario', 'error'); return; } } try { await fetchAPI(`/api/${type}`, { method: 'POST', body: JSON.stringify(body) }); showToast('Creado exitosamente', 'success'); limpiarForm(form.id); localCache[type] =[]; renderPaginatedList(type); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarItem(id, endpoint) { Swal.fire({ title: '¿Mover a papelera?', text: "Podrás restaurarlo después.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); showToast('Movido a papelera', 'info'); localCache[endpoint] =[]; renderPaginatedList(endpoint); } catch (e) { showToast(e.message, 'error'); } } }); }
    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Elemento restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } }
    async function eliminarPermanente(id, endpoint) { Swal.fire({ title: '¿Eliminar Permanente?', text: "¡Acción irreversible!", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado permanentemente.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } } }); }
    function abrirModalEditarArtista(id, nombre, artistico, tel, mail) { document.getElementById('editArtistId').value = id; document.getElementById('editArtistNombre').value = nombre; document.getElementById('editArtistNombreArtístico').value = artistico; document.getElementById('editArtistTelefono').value = tel; document.getElementById('editArtistCorreo').value = mail; new bootstrap.Modal(document.getElementById('edit-artist-modal')).show(); }
    async function guardarEdicionArtista(e) { e.preventDefault(); const id = document.getElementById('editArtistId').value; const body = { nombre: document.getElementById('editArtistNombre').value, nombreArtistico: document.getElementById('editArtistNombreArtístico').value, telefono: document.getElementById('editArtistTelefono').value, correo: document.getElementById('editArtistCorreo').value }; try { await fetchAPI(`/api/artistas/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Artista actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('edit-artist-modal')).hide(); if(document.getElementById('vista-artista').classList.contains('active')) mostrarVistaArtista(id, body.nombre, body.nombreArtistico); localCache.artistas =[]; renderPaginatedList('artistas'); } catch (e) { showToast(e.message, 'error'); } }
    function abrirModalEditarServicio(id, nombre, precio, visible) { document.getElementById('editServicioId').value = id; document.getElementById('editServicioNombre').value = nombre; document.getElementById('editServicioPrecio').value = precio; document.getElementById('editServicioVisible').checked = (visible === true || visible === 'true'); new bootstrap.Modal(document.getElementById('modalEditarServicio')).show(); }
    async function guardarEdicionServicio(e) { e.preventDefault(); const id = document.getElementById('editServicioId').value; const body = { nombre: document.getElementById('editServicioNombre').value, precio: parseFloat(document.getElementById('editServicioPrecio').value), visible: document.getElementById('editServicioVisible').checked }; try { await fetchAPI(`/api/servicios/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Servicio actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('modalEditarServicio')).hide(); localCache.servicios =[]; renderPaginatedList('servicios'); } catch (e) { showToast(e.message, 'error'); } }
    async function abrirModalEditarUsuario(itemStr) { const item = JSON.parse(itemStr.replace(/&apos;/g, "'").replace(/&quot;/g, '"')); document.getElementById('editUsuarioId').value = item._id; document.getElementById('editUsuarioName').value = item.username; document.getElementById('editUsuarioEmail').value = item.emai--- START OF FILE module_part_3.js ---

tista(artistaId, artistaNombre, nombreArtistico) { const userInfo = getUserRoleAndId(); if (!artistaId) { if (userInfo.role === 'cliente' && userInfo.artistaId) { artistaId = userInfo.artistaId; if (!artistaNombre) artistaNombre = userInfo.username; } else { const artistas = await fetchAPI('/api/artistas'); const artista = artistas.find(a => a.nombre === artistaNombre || a.nombreArtistico === artistaNombre); if (artista) artistaId = artista._id; else return; } } mostrarVistaArtista(artistaId, artistaNombre, nombreArtistico); }
    function nuevoProyectoParaArtista(idArtista, nombreArtista) { preseleccionArtistaId = idArtista; mostrarSeccion('registrar-proyecto'); showToast(`Iniciando proyecto para: ${nombreArtista}`, 'info'); }
    
    // --- LÓGICA PARA AÑADIR PROYECTO DIRECTO AL HISTORIAL ---
    function abrirModalProyectoDirecto(artistaId) {
        document.getElementById('directoArtistaId').value = artistaId;
        document.getElementById('directoNombreProyecto').value = '';
        document.getElementById('directoEnlace').value = '';
        new bootstrap.Modal(document.getElementById('modalProyectoDirecto')).show();
    }

    async function guardarProyectoDirecto(e) {
        e.preventDefault();
        const artistaId = document.getElementById('directoArtistaId').value;
        const nombreProyecto = document.getElementById('directoNombreProyecto').value;
        const enlaceEntrega = document.getElementById('directoEnlace').value;

        showLoader();
        try {
            await fetchAPI('/api/proyectos/directo', {
                method: 'POST',
                body: JSON.stringify({ artistaId, nombreProyecto, enlaceEntrega })
            });

            showToast('Proyecto anterior añadido al catálogo.', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalProyectoDirecto')).hide();
            
            // Recargar la vista del artista para ver el nuevo proyecto en la tabla
            const nombreArtisticoActual = document.getElementById('vista-artista-nombre').textContent;
            mostrarVistaArtista(artistaId, nombreArtisticoActual, '');

        } catch (error) {
            showToast('Error al añadir proyecto: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }

    // =========================================================
    // NUEVAS FUNCIONES PARA PLANTILLAS DE DOCUMENTOS
    // =========================================================
    function procesarVariablesComunes(texto, proyecto) {
        if(!texto) return '';
        const nombreCliente = proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General';
        const nombreProyecto = proyecto.nombreProyecto || 'Sin Nombre';
        return texto
            .replace(/\{\{CLIENTE\}\}/g, nombreCliente)
            .replace(/\{\{PROYECTO\}\}/g, nombreProyecto)
            .replace(/\{\{TOTAL\}\}/g, `$${safeMoney(proyecto.total)}`)
            .replace(/\{\{PAGADO\}\}/g, `$${safeMoney(proyecto.montoPagado || 0)}`)
            .replace(/\{\{RESTANTE\}\}/g, `$${safeMoney(proyecto.total - (proyecto.montoPagado || 0))}`)
            .replace(/\{\{FECHA\}\}/g, new Date().toLocaleDateString());
    }

    // Función de PDF Básica (Logo y Firma)
    function dibujarLogoEnPDF(pdf, logoData) { 
        if (!logoData) return; 
        const imgProps = pdf.getImageProperties(logoData); 
        const originalWidth = imgProps.width; 
        const originalHeight = imgProps.height; 
        const maxBoxWidth = 50; 
        const maxBoxHeight = 25; 
        let finalWidth = maxBoxWidth; 
        let finalHeight = (originalHeight * maxBoxWidth) / originalWidth; 
        if (finalHeight > maxBoxHeight) { finalHeight = maxBoxHeight; finalWidth = (originalWidth * maxBoxHeight) / originalHeight; } 
        pdf.addImage(logoData, 'PNG', 14, 15, finalWidth, finalHeight); 
    }

    async function addFirmaToPdf(pdf, docType, finalFileName, proyecto) { let firmaSrc = null; if (configCache) { if (configCache.firmaBase64) firmaSrc = configCache.firmaBase64; else if (configCache.firmaPath) firmaSrc = configCache.firmaPath; } try { if (firmaSrc) { let base64data = firmaSrc; if (!firmaSrc.startsWith('data:image')) { const response = await fetch(firmaSrc); if (!response.ok) throw new Error('No se pudo cargar la firma.'); const firmaImg = await response.blob(); const reader = new FileReader(); const promise = new Promise((resolve) => { reader.onloadend = () => { resolve(reader.result); }; reader.readAsDataURL(firmaImg); }); base64data = await promise; } const pos = {x: PDF_DIMENSIONS.WIDTH - 64, y: PDF_DIMENSIONS.HEIGHT - 44, w: 50, h: 20}; pdf.addImage(base64data, 'PNG', pos.x, pos.y, pos.w, pos.h); pdf.line(pos.x, pos.y + pos.h + 2, pos.x + pos.w, pos.y + pos.h + 2); pdf.text("Erick Resendiz", pos.x, pos.y + pos.h + 7, { align: 'left' }); pdf.text("Representante FIA Records", pos.x, pos.y + pos.h + 12, { align: 'left' }); } pdf.save(finalFileName); } catch (e) { console.error("Error firma PDF:", e); pdf.save(finalFileName); } }
    
    // =========================================================
    // GENERADORES DE PDF ACTUALIZADOS
    // =========================================================
    async function generarCotizacionPDF(proyectoIdOrObject) { 
        try { 
            const proyecto = typeof proyectoIdOrObject === 'string' ? await fetchAPI(`/api/proyectos/${proyectoIdOrObject}`) : proyectoIdOrObject; 
            const { jsPDF } = window.jspdf; 
            const pdf = new jsPDF(); 
            
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64); 
            
            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 
            
            pdf.setFontSize(11); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'Público General'}`, 14, 50); 
            pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 196, 50, { align: 'right' }); 
            
            const body = proyecto.items.map(item =>[`${item.unidades}x ${item.nombre}`, `$${(item.precioUnitario * item.unidades).toFixed(2)}`]); 
            if (proyecto.descuento && proyecto.descuento > 0) { body.push(['Descuento', `-$${proyecto.descuento.toFixed(2)}`]); } 
            
            pdf.autoTable({ startY: 70, head: [['Servicio', 'Subtotal']], body: body, theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor:[0, 0, 0] } }); 
            
            let finalY = pdf.lastAutoTable.finalY + 10; 
            pdf.setFontSize(12); 
            pdf.setFont(undefined, 'bold'); 
            pdf.text(`Total: $${safeMoney(proyecto.total)} MXN`, 196, finalY, { align: 'right' }); 

            const terminosTextBruto = pDoc.terminosCotizacion !== undefined ? pDoc.terminosCotizacion : "Este presupuesto tiene una vigencia de 15 días.";
            if(terminosTextBruto) {
                finalY += 15;
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'normal');
                const terminosText = procesarVariablesComunes(terminosTextBruto, proyecto);
                const splitText = pdf.splitTextToSize(terminosText, 180);
                pdf.text(splitText, 14, finalY);
            }

            const fileName = `Cotizacion-${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'cotizacion', fileName, proyecto); 
        } catch (error) { showToast("Error al generar PDF", 'error'); console.error(error); } 
    }

    async function generarReciboPDF(proyecto, pagoEspecifico) { 
        try { 
            const { jsPDF } = window.jspdf; 
            const pdf = new jsPDF(); 
            const pago = pagoEspecifico || (proyecto.pagos && proyecto.pagos.length > 0 ? proyecto.pagos[proyecto.pagos.length - 1] : { monto: proyecto.montoPagado || 0, metodo: 'Varios' }); 
            if (!pago) return showToast('No hay pagos.', 'error'); 
            
            const saldoRestante = proyecto.total - proyecto.montoPagado; 
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64); 
            
            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 

            pdf.setFontSize(16); 
            pdf.setFont(undefined, 'bold').text(`RECIBO DE PAGO`, 105, 45, { align: 'center' }); 
            
            pdf.setFontSize(11); 
            pdf.setFont(undefined, 'normal'); 
            pdf.text(`Cliente: ${proyecto.artista ? (proyecto.artista.nombreArtistico || proyecto.artista.nombre) : 'General'}`, 14, 60); 
            
            pdf.autoTable({ startY: 70, theme: 'striped', body: [['Total del Proyecto:', `$${safeMoney(proyecto.total)}`],['Monto de este Recibo:', `$${safeMoney(pago.monto)} (${pago.metodo})`],['Saldo Restante:', `$${safeMoney(saldoRestante)}`]] }); 
            
            let finalY = pdf.lastAutoTable.finalY + 15;
            
            const notaTextBruto = pDoc.terminosRecibo !== undefined ? pDoc.terminosRecibo : "¡Gracias por tu confianza, {{CLIENTE}}!";
            if(notaTextBruto) {
                pdf.setFontSize(10);
                const notaText = procesarVariablesComunes(notaTextBruto, proyecto);
                const splitNota = pdf.splitTextToSize(notaText, 180);
                pdf.text(splitNota, 14, finalY);
            }

            const fileName = `Recibo_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`; 
            await addFirmaToPdf(pdf, 'recibo', fileName, proyecto); 
        } catch (error) { showToast('Error al generar recibo.', 'error'); console.error(error); } 
    }

    async function generarContratoPDF(proyectoId) {
        try {
            const proyecto = typeof proyectoId === 'string' ? await fetchAPI(`/api/proyectos/${proyectoId}`) : proyectoId;
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            
            if (logoBase64) dibujarLogoEnPDF(pdf, logoBase64);
            
            const pDoc = (configCache && configCache.plantillasDoc) ? configCache.plantillasDoc : {};
            const enc1 = pDoc.encabezado1 !== undefined ? pDoc.encabezado1 : "FiaRecords Studio";
            const enc2 = pDoc.encabezado2 !== undefined ? pDoc.encabezado2 : "Juárez N.L.";

            pdf.setFontSize(9); 
            pdf.text(enc1, 196, 20, { align: 'right' }); 
            pdf.text(enc2, 196, 25, { align: 'right' }); 

            const plantilla = pDoc.plantillaContrato || "CONTRATO DE SERVICIOS\n\nPor favor, configura tu plantilla legal en la sección de Configuración.";
            const textoFinal = procesarVariablesComunes(plantilla, proyecto);
            
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "normal");
            
            // Envuelve el texto largo en líneas que quepan en la hoja (180mm de ancho)
            const lineas = pdf.splitTextToSize(textoFinal, 180);
            
            let y = 45; // Posición de inicio en el eje Y
            const altoHoja = pdf.internal.pageSize.height;
            
            // Dibuja línea por línea. Si se acaba la hoja, crea una nueva.
            for(let i=0; i<lineas.length; i++) {
                if (y > altoHoja - 30) {
                    pdf.addPage();
                    y = 20; // Reinicia Y al inicio de la nueva página
                }
                pdf.text(lineas[i], 14, y);
                y += 6; // Espacio entre renglones
            }
            
            const fileName = `Contrato_${proyecto.artista ? proyecto.artista.nombre.replace(/\s/g, '_') : 'General'}.pdf`;
            await addFirmaToPdf(pdf, 'contrato', fileName, proyecto);
            showToast('Contrato Generado', 'success');
        } catch (error) {
            showToast("Error al generar Contrato", 'error');
            console.error(error);
        }
    }

    function setupMobileMenu() { const hamburger = document.getElementById('hamburger-menu'); const sidebar = document.querySelector('.sidebar'); const overlay = document.getElementById('sidebar-overlay'); const toggleMenu = () => { sidebar.classList.toggle('show'); overlay.classList.toggle('show'); }; if (hamburger) hamburger.addEventListener('click', toggleMenu); if (overlay) overlay.addEventListener('click', toggleMenu); document.querySelectorAll('.nav-link-sidebar, #btn-nuevo-proyecto-sidebar').forEach(link => { link.addEventListener('click', () => { if (window.innerWidth <= 768) { sidebar.classList.remove('show'); overlay.classList.remove('show'); } }); }); }
    
    // ==================================================================
    // AUTH & INIT CON REDIRECCION ESTRICTA
    // ==================================================================
    function showLogin() {
        document.body.classList.add('auth-visible');
        localStorage.removeItem('token');
        history.pushState("", document.title, window.location.pathname);
        DOMElements.loginContainer.style.display = 'flex'; 
        DOMElements.appWrapper.style.display = 'none';
        toggleAuth('login');
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
        fetchPublicLogo();
    }
    
    async function showApp(payload) {
        document.body.classList.remove('auth-visible');
        const role = payload.role ? payload.role.toLowerCase() : 'cliente';
        document.body.setAttribute('data-role', role); 
        renderSidebar(payload); 
        
        if (!configCache) await loadInitialConfig();
        if(DOMElements.welcomeUser) DOMElements.welcomeUser.textContent = `Hola, ${escapeHTML(payload.username)}`;
        
        const datosBancariosBtn = document.querySelector('[data-bs-target="#modalDatosBancarios"]');
        if (datosBancariosBtn) {
            if (role === 'cliente') { datosBancariosBtn.style.display = 'none'; } 
            else { datosBancariosBtn.style.display = 'block'; }
        }

        if (!isInitialized) { initAppEventListeners(payload); isInitialized = true; }
        DOMElements.loginContainer.style.display = 'none'; 
        DOMElements.appWrapper.style.display = 'flex'; 
        
        setupCustomization(payload);

        if (role === 'cliente') {
             if(payload.artistaId) {
                 await mostrarVistaArtista(payload.artistaId, payload.username, payload.nombre || payload.username);
                 mostrarSeccion('vista-artista', false); 
             } else {
                 document.getElementById('vista-artista-contenido').innerHTML = '<div class="alert alert-warning">No se encontró un perfil de artista vinculado. Contacta a soporte.</div>';
                 mostrarSeccion('vista-artista', false);
             }
        } else { 
            const hashSection = location.hash.replace('#', '');
            mostrarSeccion(hashSection || 'dashboard', false); 
        }
        
        document.body.style.opacity = '1'; document.body.style.visibility = 'visible';
    }

    function setupAuthListeners() {
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!navigator.onLine) { return showToast('Se requiere internet.', 'error'); }
            showLoader();
            try {
                const userVal = document.getElementById('username').value;
                const passVal = document.getElementById('password').value;
                const res = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: userVal, password: passVal })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                localStorage.setItem('token', data.token);
                await showApp(JSON.parse(atob(data.token.split('.')[1])));
            } catch (error) { document.getElementById('login-error').textContent = error.message; } finally { hideLoader(); }
        });
        
        document.getElementById('toggle-password').addEventListener('click', () => {
             const passwordInput = document.getElementById('password');
             passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
        document.getElementById('toggle-password-reg').addEventListener('click', () => {
            const passwordInput = document.getElementById('reg-password');
            passwordInput.setAttribute('type', passwordInput.getAttribute('type') === 'password' ? 'text' : 'password');
        });
    }

    // ==================================================================
    // FUNCIONES DE PAGINACIÓN DE TABLAS Y BUSCADOR INTELIGENTE
    // ==================================================================
    function renderTableControls(tableBodyId, listKey, page, totalPages) {
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;
        const tableEl = tbody.closest('table');
        const wrapper = tableEl.parentNode;
        let controls = wrapper.querySelector('.table-pagination-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'table-pagination-controls d-flex justify-content-between align-items-center mt-3';
            wrapper.appendChild(controls);
        }
        if (totalPages > 1) {
            controls.innerHTML = `
                <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', -1)">Anterior</button>
                <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTablePage('${listKey}', 1)">Siguiente</button>
            `;
        } else {
            controls.innerHTML = '';
        }
    }

    function changeTablePage(listKey, delta) {
        tablePagination[listKey].page += delta;
        if (listKey === 'historial') renderHistorialTable();
        if (listKey === 'cotizaciones') renderCotizacionesTable();
        if (listKey === 'pagosPendientes') renderPagosPendientesTable();
        if (listKey === 'pagosHistorial') renderPagosHistorialTable();
    }

    function filtrarTablas(query) { 
        query = query.toLowerCase(); 
        const inputPC = document.getElementById('globalSearchPC'); 
        const inputMobile = document.getElementById('globalSearchMobile'); 
        if(document.activeElement === inputPC && inputMobile) inputMobile.value = query; 
        if(document.activeElement === inputMobile && inputPC) inputPC.value = query; 

        const activeSection = document.querySelector('section.active');
        if (!activeSection) return;
        const sectionId = activeSection.id;

        if (sectionId === 'gestion-artistas') renderPaginatedList('artistas', query); 
        else if (sectionId === 'gestion-servicios') renderPaginatedList('servicios', query); 
        else if (sectionId === 'gestion-usuarios') renderPaginatedList('usuarios', query); 
        
        else if (sectionId === 'historial-proyectos') {
            tablePagination.historial.filter = query;
            tablePagination.historial.page = 1;
            renderHistorialTable();
        }
        else if (sectionId === 'cotizaciones') {
            tablePagination.cotizaciones.filter = query;
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        }
        else if (sectionId === 'pagos') {
            if (document.getElementById('vista-pagos-pendientes').style.display !== 'none') {
                tablePagination.pagosPendientes.filter = query;
                tablePagination.pagosPendientes.page = 1;
                renderPagosPendientesTable();
            } else {
                tablePagination.pagosHistorial.filter = query;
                tablePagination.pagosHistorial.page = 1;
                renderPagosHistorialTable();
            }
        }
        else if (sectionId === 'flujo-trabajo') {
            document.querySelectorAll('.project-card').forEach(card => { 
                const text = card.innerText.toLowerCase(); 
                card.style.display = text.includes(query) ? 'flex' : 'none'; 
            }); 
        }
        else if (sectionId === 'mis-deudas') {
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else if (sectionId === 'papelera-reciclaje') {
            activeSection.querySelectorAll('.list-group-item').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
        else {
            activeSection.querySelectorAll('tbody tr').forEach(row => { 
                const text = row.innerText.toLowerCase(); 
                row.style.display = text.includes(query) ? '' : 'none'; 
            });
        }
    }

    async function guardarDatosBancarios() { const datos = { banco: document.getElementById('banco').value, titular: document.getElementById('titular').value, tarjeta: document.getElementById('tarjeta').value, clabe: document.getElementById('clabe').value }; try { await fetchAPI('/api/configuracion/datos-bancarios', { method: 'PUT', body: JSON.stringify({ datosBancarios: datos }) }); configCache.datosBancarios = datos; bootstrap.Modal.getInstance(document.getElementById('modalDatosBancarios')).hide(); Swal.fire({ icon: 'success', title: 'Datos bancarios guardados', timer: 1500, showConfirmButton: false }); } catch (e) { showToast('Error al guardar', 'error'); } }
    async function cargarDatosBancariosEnModal() { try { if (!configCache || !configCache.datosBancarios) { await loadInitialConfig(); } const db = configCache.datosBancarios || {}; document.getElementById('banco').value = db.banco || ''; document.getElementById('titular').value = db.titular || ''; document.getElementById('tarjeta').value = db.tarjeta || ''; document.getElementById('clabe').value = db.clabe || ''; } catch (error) { console.error("Error al cargar datos bancarios:", error); } }
    function generarDatosBancariosPDF() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const { jsPDF } = window.jspdf; const pdf = new jsPDF(); if (logoBase64) { dibujarLogoEnPDF(pdf, logoBase64); } pdf.setFontSize(18).setFont(undefined, 'bold').text("DATOS BANCARIOS", 105, 45, { align: 'center' }); const data = [['Banco:', db.banco || ''],['Titular:', db.titular || ''],['Número de Tarjeta:', db.tarjeta || ''],['CLABE Interbancaria:', db.clabe || '']]; pdf.autoTable({ startY: 60, body: data, theme: 'striped', styles: { fontSize: 14, cellPadding: 3 } }); pdf.save("FiaRecords_DatosBancarios.pdf"); }
    function compartirDatosBancariosWhatsApp() { if (!configCache || !configCache.datosBancarios) return showToast('Guarda los datos primero', 'warning'); const db = configCache.datosBancarios; const msg = `*Datos Bancarios FiaRecords*\n\n*Banco:* ${db.banco}\n*Titular:* ${db.titular}\n*Tarjeta:* ${db.tarjeta}\n*CLABE:* ${db.clabe}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'); }
    async function subirFirma(event) { const file = event.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('firmaFile', file); try { const data = await fetchAPI('/api/configuracion/upload-firma', { method: 'POST', body: formData, isFormData: true }); showToast('¡Firma subida!', 'success'); const newSrc = data.firmaBase64; document.getElementById('firma-preview-img').src = newSrc; if (configCache) configCache.firmaBase64 = data.firmaBase64; } catch (e) { showToast(`Error al subir la firma`, 'error'); } }
    
    // --- ACTUALIZADO PARA LLENAR PLANTILLAS AL ABRIR ---
    async function cargarConfiguracion() { 
        try { 
            if (!configCache) await loadInitialConfig();
            
            const firmaPreview = document.getElementById('firma-preview-img');
            let firmaSrc = 'https://placehold.co/150x60?text=Subir+Firma';
            if (configCache && configCache.firmaBase64) firmaSrc = configCache.firmaBase64; 
            firmaPreview.src = firmaSrc; 
            
            const db = configCache.datosBancarios || {}; 
            document.getElementById('banco').value = db.banco || ''; 
            document.getElementById('titular').value = db.titular || ''; 
            document.getElementById('tarjeta').value = db.tarjeta || ''; 
            document.getElementById('clabe').value = db.clabe || ''; 

            const tbody = document.getElementById('tabla-horarios-body');
            tbody.innerHTML = '';
            
            const horarios = configCache.horarioLaboral || {};
            
            DIAS_SEMANA.forEach((nombreDia, index) => {
                const h = horarios[index.toString()] || { activo: (index !== 0), inicio: "10:00", fin: "20:00" };
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${nombreDia}</strong></td>
                    <td>
                        <div class="form-check form-switch">
                            <input class="form-check-input check-dia-activo" type="checkbox" 
                                   id="dia-activo-${index}" ${h.activo ? 'checked' : ''} 
                                   onchange="app.toggleInputsHorario(${index})">
                            <label class="form-check-label" for="dia-activo-${index}">Abierto</label>
                        </div>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-inicio-${index}" 
                               value="${h.inicio}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                    <td>
                        <input type="time" class="form-control input-hora" id="dia-fin-${index}" 
                               value="${h.fin}" ${!h.activo ? 'disabled' : ''}>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Cargar Plantillas de Documentos
            const p = configCache.plantillasDoc || {};
            document.getElementById('plantilla-enc1').value = p.encabezado1 || 'FiaRecords Studio';
            document.getElementById('plantilla-enc2').value = p.encabezado2 || 'Juárez N.L.';
            document.getElementById('plantilla-term-cotiz').value = p.terminosCotizacion || 'Este presupuesto tiene una vigencia de 15 días.';
            document.getElementById('plantilla-term-recibo').value = p.terminosRecibo || '¡Gracias por tu pago!';
            document.getElementById('plantilla-contrato').value = p.plantillaContrato || 'CONTRATO DE PRESTACIÓN DE SERVICIOS\n\nEntre FiaRecords y {{CLIENTE}} para el proyecto {{PROYECTO}}...\n\n(Edita esto en configuración)';

        } catch (e) { showToast('Error al cargar configuración.', 'error'); } 
    }

    async function cargarCotizaciones() { 
        const tablaBody = document.getElementById('tablaCotizacionesBody'); 
        tablaBody.innerHTML = `<tr><td colspan="4">Cargando cotizaciones...</td></tr>`; 
        try { 
            cotizacionesCacheadas = await fetchAPI('/api/proyectos/cotizaciones'); 
            tablePagination.cotizaciones.page = 1;
            renderCotizacionesTable();
        } catch (e) { 
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar.</td></tr>`; 
        } 
    }
    
    function renderCotizacionesTable() {
        const tablaBody = document.getElementById('tablaCotizacionesBody');
        let items = cotizacionesCacheadas ||[];

        const filterText = tablePagination.cotizaciones.filter || '';
        if (filterText) {
            items = items.filter(c => {
                const artista = c.artista ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General';
                return artista.toLowerCase().includes(filterText);
            });
        }

        const { page, limit } = tablePagination.cotizaciones;
        const start = (page - 1) * limit;
        const paginatedItems = items.slice(start, start + limit);
        const totalPages = Math.ceil(items.length / limit) || 1;
        
        if (items.length === 0) {
            tablaBody.innerHTML = `<tr><td colspan="4" class="text-center">No hay cotizaciones pendientes.</td></tr>`;
            renderTableControls('tablaCotizacionesBody', 'cotizaciones', 1, 0);
            return;
        }
        
        tablaBody.innerHTML = paginatedItems.map(c => { 
            const esArtistaRegistrado = c.artista && c.artista._id; 
            const nombreArtista = esArtistaRegistrado ? (c.artista.nombreArtistico || c.artista.nombre) : 'Público General'; 
            return `<tr><td data-label="Artista" class="${esArtistaRegistrado ? 'clickable-artist' : ''}" ${esArtistaRegistrado ? `ondblclick="app.irAVistaArtista('${c.artista._id}', '${escapeHTML(c.artista.nombre)}', '${escapeHTML(c.artista.nombreArtistico || '')}')"` : ''}>${escapeHTML(nombreArtista)}</td><td data-label="Total">$${safeMoney(c.total)}</td><td data-label="Fecha">${safeDate(c.createdAt)}</td><td data-label="Acciones" class="table-actions"><button class="btn btn-sm btn-success" onclick="app.aprobarCotizacion('${c._id}')" title="Aprobar"><i class="bi bi-check-lg"></i></button><button class="btn btn-sm btn-outline-secondary" title="Generar PDF" onclick="app.generarCotizacionPDF('${c._id}')"><i class="bi bi-file-earmark-pdf"></i></button><button class="btn btn-sm btn-outline-success" title="WhatsApp" onclick="app.compartirPorWhatsApp('${c._id}')"><i class="bi bi-whatsapp"></i></button><button class="btn btn-sm btn-outline-danger" onclick="app.eliminarProyecto('${c._id}', true)" title="Borrar"><i class="bi bi-trash"></i></button></td></tr>`; 
        }).join('');
        
        renderTableControls('tablaCotizacionesBody', 'cotizaciones', page, totalPages);
    }
    
    // ==================================================================
    // LÓGICA DE PAPELERA PAGINADA
    // ==================================================================
    async function cargarPapelera() {
        const endpoints =['servicios', 'artistas', 'usuarios', 'proyectos'];
        for (const endpoint of endpoints) {
            try {
                const data = await fetchAPI(`/api/${endpoint}/papelera/all`);
                localCache.trash[endpoint] = data; 
                trashPagination[endpoint].page = 1; 
                renderTrashList(endpoint); 
            } catch (e) {
                console.error(`Error loading trash for ${endpoint}:`, e);
                const listEl = document.getElementById(`papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`);
                if(listEl) listEl.innerHTML = `<li class="list-group-item text-danger small">Error cargando.</li>`;
            }
        }
    }

    function renderTrashList(endpoint) {
        const listId = `papelera${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`;
        const listEl = document.getElementById(listId);
        const controlsEl = document.getElementById(`${listId}Controls`);
        if (!listEl) return;

        const items = localCache.trash[endpoint] ||[];
        const { page, limit } = trashPagination[endpoint];
        
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedItems = items.slice(start, end);
        const totalPages = Math.ceil(items.length / limit);

        if (paginatedItems.length === 0) {
            listEl.innerHTML = `<li class="list-group-item text-muted small">Papelera vacía.</li>`;
            if(controlsEl) controlsEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = paginatedItems.map(item => {
            let displayName = 'Item sin nombre';
            if (endpoint === 'proyectos') {
                const nombreArt = item.artista ? (item.artista.nombreArtistico || item.artista.nombre) : 'Sin Artista';
                const nombreProj = item.nombreProyecto || 'Proyecto General';
                displayName = `${nombreProj} - ${nombreArt} (${safeDate(item.fecha)})`;
            } else {
                displayName = item.nombre || item.username || item.nombreArtistico || item.nombreProyecto || 'Item sin nombre';
                if (endpoint === 'servicios' && item.precio) displayName += ` ($${item.precio})`;
                if (endpoint === 'usuarios') displayName += ` (${item.role})`;
            }
            return `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span class="text-truncate" style="max-width: 70%;">${escapeHTML(displayName)}</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-success" onclick="app.restaurarItem('${item._id}', '${endpoint}')" title="Restaurar"><i class="bi bi-arrow-counterclockwise"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="app.eliminarPermanente('${item._id}', '${endpoint}')" title="Eliminar Permanente"><i class="bi bi-x-octagon-fill"></i></button>
                </div>
            </li>`;
        }).join('');

        if (controlsEl) {
            if (totalPages > 1) {
                controlsEl.innerHTML = `
                    <button class="btn btn-sm btn-outline-secondary" ${page === 1 ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', -1)">Anterior</button>
                    <span class="small text-muted fw-bold">Pág ${page} de ${totalPages}</span>
                    <button class="btn btn-sm btn-outline-secondary" ${page === totalPages ? 'disabled' : ''} onclick="app.changeTrashPage('${endpoint}', 1)">Siguiente</button>
                `;
            } else {
                controlsEl.innerHTML = ''; 
            }
        }
    }

    function changeTrashPage(endpoint, delta) {
        trashPagination[endpoint].page += delta;
        renderTrashList(endpoint);
    }
    
    // ==================================================================
    // LISTAS NORMALES (ARTISTAS, SERVICIOS)
    // ==================================================================
    async function renderPaginatedList(endpoint, filterText = null) { 
        const listId = `lista${endpoint.charAt(0).toUpperCase() + endpoint.slice(1)}`; 
        const listEl = document.getElementById(listId); 
        if(!listEl) return; 
        
        const userInfo = getUserRoleAndId(); 
        const isClient = (userInfo.role === 'cliente'); 
        
        if (navigator.onLine && filterText === null) {
            try { 
                localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); 
                await localforage.setItem(`cache_${endpoint}`, localCache[endpoint]);
            } catch(e) { console.error("Error fetching " + endpoint); }
        } else if (!localCache[endpoint] || localCache[endpoint].length === 0) {
            try { localCache[endpoint] = await fetchAPI(`/api/${endpoint}`); } catch(e) {}
        }
        
        let data = localCache[endpoint] ||[];
        
        if (filterText !== null) { 
            paginationState[endpoint].filter = filterText.toLowerCase(); 
            paginationState[endpoint].page = 1; 
        } 
        
        const currentFilter = paginationState[endpoint].filter; 
        let filteredData = data; 
        
        if (currentFilter) { 
            filteredData = data.filter(item => { 
                const name = item.nombre || item.username || item.nombreArtistico || ''; 
                return name.toLowerCase().includes(currentFilter); 
            }); 
        } 
        
        const page = paginationState[endpoint].page; 
        const limit = paginationState[endpoint].limit; 
        const start = (page - 1) * limit; 
        const end = start + limit; 
        const paginatedItems = filteredData.slice(start, end); 
        const totalPages = Math.ceil(filteredData.length / limit) || 1; 
        
        listEl.innerHTML = paginatedItems.length ? paginatedItems.map(item => { 
            let displayName, editAction; 
            let viewButton = ''; 

            if (endpoint === 'artistas') { 
                displayName = `${item.nombreArtistico || item.nombre}`; 
                editAction = `app.abrirModalEditarArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}', '${escapeHTML(item.telefono || '')}', '${escapeHTML(item.correo || '')}')`;
                viewButton = `<button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')" title="Ver Perfil"><i class="bi bi-eye"></i></button>`;
            } else if (endpoint === 'usuarios') { 
                displayName = `${item.username} (${item.role})`; 
                editAction = `app.abrirModalEditarUsuario('${escapeHTML(JSON.stringify(item))}')`; 
            } else { 
                const vis = item.visible !== false; 
                displayName = `${item.nombre} - $${item.precio.toFixed(2)} ${vis ? '' : '<span class="badge bg-warning text-dark ms-2">Oculto</span>'}`; 
                editAction = `app.abrirModalEditarServicio('${item._id}', '${escapeHTML(item.nombre)}', '${item.precio}', ${vis})`; 
            } 
            
            const clickHandler = (endpoint === 'artistas') ? `ondblclick="app.irAVistaArtista('${item._id}', '${escapeHTML(item.nombre)}', '${escapeHTML(item.nombreArtistico || '')}')"` : ''; 
            const listItemClass = `list-group-item d-flex justify-content-between align-items-center ${endpoint === 'artistas' ? 'list-group-item-action' : ''}`; 
            let buttonsHtml = ''; 
            
            if (!isClient) { 
                buttonsHtml = `<div class="btn-group">${viewButton}<button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); ${editAction}"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.eliminarItem('${item._id}', '${endpoint}')"><i class="bi bi-trash"></i></button></div>`; 
            } 
            
            return `<li class="${listItemClass}" ${clickHandler} style="${endpoint === 'artistas' ? 'cursor:pointer;' : ''}"><span>${displayName}</span>${buttonsHtml}</li>`; 
        }).join('') : `<li class="list-group-item">No hay resultados.</li>`; 
        
        renderPaginationControls(listEl, endpoint, page, totalPages); 
    }
    
    function renderPaginationControls(container, endpoint, currentPage, totalPages) { let controls = container.parentNode.querySelector('.pagination-controls'); if(controls) controls.remove(); if (totalPages <= 1) return; controls = document.createElement('div'); controls.className = 'pagination-controls'; controls.innerHTML = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="app.changePage('${endpoint}', -1)">Anterior</button><span class="pagination-info">Página ${currentPage} de ${totalPages}</span><button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.changePage('${endpoint}', 1)">Siguiente</button>`; container.parentNode.appendChild(controls); }
    function changePage(endpoint, delta) { paginationState[endpoint].page += delta; renderPaginatedList(endpoint, null); }
    function limpiarForm(formId) { const f = document.getElementById(formId); if(f) f.reset(); }
    async function saveItem(e, type) { e.preventDefault(); const form = e.target; let body; if (type === 'servicios') { const vis = document.getElementById('visibleServicio'); body = { nombre: form.nombreServicio.value, precio: parseFloat(form.precioServicio.value), visible: vis ? vis.checked : true }; } else if (type === 'artistas') { body = { nombre: form.nombreArtista.value, nombreArtistico: form.nombreArtisticoArtista.value, telefono: form.telefonoArtista.value, correo: form.correoArtista.value }; } else if (type === 'usuarios') { const userVal = document.getElementById('usernameUsuario').value; const emailVal = document.getElementById('emailUsuario').value; const roleVal = document.getElementById('roleUsuario').value; const passVal = document.getElementById('passwordUsuario').value; const checkboxes = document.querySelectorAll('#formUsuarios input[name="user_permisos"]:checked'); const permisos = Array.from(checkboxes).map(c => c.value); body = { username: userVal, email: emailVal, role: roleVal, permisos: permisos, password: passVal }; if (!passVal) { showToast('La contraseña es requerida para crear un usuario', 'error'); return; } } try { await fetchAPI(`/api/${type}`, { method: 'POST', body: JSON.stringify(body) }); showToast('Creado exitosamente', 'success'); limpiarForm(form.id); localCache[type] =[]; renderPaginatedList(type); } catch (error) { showToast(`Error: ${error.message}`, 'error'); } }
    async function eliminarItem(id, endpoint) { Swal.fire({ title: '¿Mover a papelera?', text: "Podrás restaurarlo después.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, mover', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}`, { method: 'DELETE' }); showToast('Movido a papelera', 'info'); localCache[endpoint] =[]; renderPaginatedList(endpoint); } catch (e) { showToast(e.message, 'error'); } } }); }
    async function restaurarItem(id, endpoint) { try { await fetchAPI(`/api/${endpoint}/${id}/restaurar`, { method: 'PUT' }); showToast('Elemento restaurado.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } }
    async function eliminarPermanente(id, endpoint) { Swal.fire({ title: '¿Eliminar Permanente?', text: "¡Acción irreversible!", icon: 'error', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#d33', }).then(async (result) => { if (result.isConfirmed) { try { await fetchAPI(`/api/${endpoint}/${id}/permanente`, { method: 'DELETE' }); showToast('Eliminado permanentemente.', 'success'); cargarPapelera(); } catch (error) { showToast(error.message, 'error'); } } }); }
    function abrirModalEditarArtista(id, nombre, artistico, tel, mail) { document.getElementById('editArtistId').value = id; document.getElementById('editArtistNombre').value = nombre; document.getElementById('editArtistNombreArtístico').value = artistico; document.getElementById('editArtistTelefono').value = tel; document.getElementById('editArtistCorreo').value = mail; new bootstrap.Modal(document.getElementById('edit-artist-modal')).show(); }
    async function guardarEdicionArtista(e) { e.preventDefault(); const id = document.getElementById('editArtistId').value; const body = { nombre: document.getElementById('editArtistNombre').value, nombreArtistico: document.getElementById('editArtistNombreArtístico').value, telefono: document.getElementById('editArtistTelefono').value, correo: document.getElementById('editArtistCorreo').value }; try { await fetchAPI(`/api/artistas/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Artista actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('edit-artist-modal')).hide(); if(document.getElementById('vista-artista').classList.contains('active')) mostrarVistaArtista(id, body.nombre, body.nombreArtistico); localCache.artistas =[]; renderPaginatedList('artistas'); } catch (e) { showToast(e.message, 'error'); } }
    function abrirModalEditarServicio(id, nombre, precio, visible) { document.getElementById('editServicioId').value = id; document.getElementById('editServicioNombre').value = nombre; document.getElementById('editServicioPrecio').value = precio; document.getElementById('editServicioVisible').checked = (visible === true || visible === 'true'); new bootstrap.Modal(document.getElementById('modalEditarServicio')).show(); }
    async function guardarEdicionServicio(e) { e.preventDefault(); const id = document.getElementById('editServicioId').value; const body = { nombre: document.getElementById('editServicioNombre').value, precio: parseFloat(document.getElementById('editServicioPrecio').value), visible: document.getElementById('editServicioVisible').checked }; try { await fetchAPI(`/api/servicios/${id}`, { method: 'PUT', body: JSON.stringify(body) }); showToast('Servicio actualizado', 'success'); bootstrap.Modal.getInstance(document.getElementById('modalEditarServicio')).hide(); localCache.servicios =[]; renderPaginatedList('servicios'); } catch (e) { showToast(e.message, 'error'); } }
    async function abrirModalEditarUsuario(itemStr) { const item = JSON.parse(itemStr.replace(/&apos;/g, "'").replace(/&quot;/g, '"')); document.getElementById('editUsuarioId').value = item._id; document.getElementById('editUsuarioName').value = item.username; document.getElementById('editUsuarioEmail').value = item.emai