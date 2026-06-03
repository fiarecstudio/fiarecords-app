/**
 * FASE 4: MÓDULO DE GESTIÓN MULTI-TENANT (EMPRESAS)
 * 
 * Este módulo maneja:
 * - Contexto de empresa seleccionada (Super Admin)
 * - Persistencia en localStorage
 * - Comunicación con API de empresas
 * - UI del selector y modal de gestión
 */

// ==================================================================
// 1. SISTEMA DE CONTEXTO MULTI-TENANT
// ==================================================================

const EmpresaContext = {
    STORAGE_KEY: 'selected_empresa_id',
    
    // Obtener empresa seleccionada ('' = todas/global)
    getSelected: () => {
        return localStorage.getItem(EmpresaContext.STORAGE_KEY) || '';
    },
    
    // Guardar empresa seleccionada
    setSelected: (empresaId) => {
        if (empresaId) {
            localStorage.setItem(EmpresaContext.STORAGE_KEY, empresaId);
        } else {
            localStorage.removeItem(EmpresaContext.STORAGE_KEY);
        }
        // Notificar cambio de contexto
        window.dispatchEvent(new CustomEvent('empresa-context-changed', { 
            detail: { empresaId } 
        }));
    },
    
    // Verificar si el usuario actual es Super Admin
    isSuperAdmin: () => {
        const token = localStorage.getItem('token');
        if (!token) return false;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.isSuperAdmin === true;
        } catch (e) {
            return false;
        }
    },
    
    // Obtener empresaId del usuario logueado (para admins normales)
    getUserEmpresaId: () => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.empresaId;
        } catch (e) {
            return null;
        }
    }
};

// Hacer disponible globalmente
window.EmpresaContext = EmpresaContext;

// ==================================================================
// 2. FUNCIONES DE UI - SELECTOR DE EMPRESA
// ==================================================================

// Inicializar selector de empresa (llamar desde showApp)
async function inicializarSelectorEmpresa() {
    const container = document.getElementById('empresa-selector-container');
    if (!container) {
        console.warn('[EmpresaContext] No se encontró el contenedor del selector');
        return;
    }
    
    // Solo mostrar para Super Admin
    if (!EmpresaContext.isSuperAdmin()) {
        container.classList.add('d-none');
        container.classList.remove('d-flex');
        return;
    }
    
    // Mostrar selector
    container.classList.remove('d-none');
    container.classList.add('d-flex');
    
    // Cargar empresas disponibles
    await cargarEmpresasSelector();
}

// Cargar empresas en el selector dropdown
async function cargarEmpresasSelector() {
    try {
        // Usar fetch del módulo principal (window.app.fetchAPI si existe, o fetch nativo)
        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com';
        
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/empresas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error al cargar empresas');
        
        const empresas = await res.json();
        const selector = document.getElementById('empresa-selector');
        if (!selector) return;
        
        const selected = EmpresaContext.getSelected();
        
        // Opción default "Todas"
        selector.innerHTML = '<option value="">Todas (Global)</option>';
        
        empresas.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp._id;
            option.textContent = emp.nombre + (emp.isDefault ? ' (Principal)' : '');
            if (emp._id === selected) option.selected = true;
            selector.appendChild(option);
        });
    } catch (e) {
        console.error('[EmpresaContext] Error cargando empresas:', e);
    }
}

// Cambiar contexto de empresa
async function cambiarEmpresaContexto(empresaId) {
    // FASE 5: PASO 1 - Establecer el nuevo contexto ANTES de cualquier cambio visual
    EmpresaContext.setSelected(empresaId);
    
    // Actualizar empresaActiva para sincronización
    const empresaFinalId = (empresaId && empresaId !== '') ? empresaId : 'all';
    localStorage.setItem('empresaActiva', empresaFinalId);
    
    // FASE 5: PASO 2 - Determinar qué elementos necesitan actualización
    const seccionActiva = document.querySelector('section.active');
    const estaEnFlujoTrabajo = seccionActiva && seccionActiva.id === 'flujo-trabajo';
    
    // FASE 5: PASO 3 - Mostrar overlay del Kanban PRIMERO (antes de cualquier cambio)
    // Esto evita el flicker y prepara la transición suave
    if (estaEnFlujoTrabajo && window.app && window.app.mostrarOverlayKanban) {
        window.app.mostrarOverlayKanban(empresaFinalId);
    }
    
    // FASE 5: PASO 4 - SINCRONIZACIÓN PROFESIONAL: Logo y Kanban se actualizan juntos
    // Creamos un array de promesas para ejecutar en paralelo donde sea posible
    const promesasActualizacion = [];
    
    // 4a. Actualizar identidad visual (logo + favicon)
    promesasActualizacion.push(
        (async () => {
            try {
                if (window.aplicarIdentidadVisual) {
                    await window.aplicarIdentidadVisual(true);
                } else if (window.app && window.app.aplicarIdentidadVisual) {
                    await window.app.aplicarIdentidadVisual(true);
                }
            } catch (e) {
                console.warn('[EmpresaContext] Error aplicando identidad visual:', e);
            }
        })()
    );
    
    // 4b. Actualizar Kanban (solo si estamos en esa sección)
    if (estaEnFlujoTrabajo && window.app && window.app.recargarKanbanReactivo) {
        promesasActualizacion.push(
            (async () => {
                try {
                    // Limpiar caché antes de recargar
                    if (window.localCache) window.localCache.proyectos = [];
                    await localforage.removeItem('cache_proyectos');
                    
                    await window.app.recargarKanbanReactivo(empresaFinalId);
                } catch (e) {
                    console.warn('[EmpresaContext] Error recargando Kanban:', e);
                }
            })()
        );
    }
    
    // 4c. Esperar a que ambas actualizaciones terminen (transición sincronizada)
    await Promise.all(promesasActualizacion);
    
    // FASE 5: PASO 5 - Limpiar cachés de otros datos (en segundo plano)
    try {
        await localforage.removeItem('cache_artistas');
        await localforage.removeItem('cache_servicios');
        await localforage.removeItem('cache_pagos');
        
        if (window.localCache) {
            window.localCache.artistas = [];
            window.localCache.servicios = [];
            window.localCache.pagos = [];
        }
    } catch (e) {
        console.warn('[EmpresaContext] Error limpiando caché:', e);
    }
    
    // FASE 5: PASO 6 - Recargar configuración y vista
    if (window.configCache) window.configCache = null;
    
    try {
        if (window.app && window.app.loadInitialConfig) {
            await window.app.loadInitialConfig(empresaFinalId);
        }
    } catch (e) {
        console.warn('[EmpresaContext] Error recargando configuración:', e);
    }
    
    // Mostrar toast de confirmación
    if (window.app && window.app.showToast) {
        const nombreContexto = empresaId ? 'Empresa específica' : 'Vista Global';
        window.app.showToast(`Contexto: ${nombreContexto}`, 'info');
    }
    
    // Recargar vista actual
    refreshCurrentView();
}

// Recargar vista actual después de cambio de contexto
function refreshCurrentView() {
    if (!window.app || !window.app.mostrarSeccion) return;
    
    const seccionActiva = document.querySelector('section.active');
    if (seccionActiva) {
        const id = seccionActiva.id;
        // Recargar la sección actual
        window.app.mostrarSeccion(id, false);
    }
}

// ==================================================================
// 3. FUNCIONES DE UI - MODAL DE GESTIÓN DE EMPRESAS
// ==================================================================

// Abrir modal de gestión de empresas
async function abrirModalEmpresas() {
    if (!EmpresaContext.isSuperAdmin()) {
        if (window.app && window.app.showToast) {
            window.app.showToast('Solo Super Admin puede gestionar empresas', 'error');
        }
        return;
    }
    
    const modalEl = document.getElementById('modalEmpresas');
    if (!modalEl) {
        console.error('[EmpresaContext] Modal no encontrado');
        return;
    }
    
    const modal = new bootstrap.Modal(modalEl);
    await cargarTablaEmpresas();
    modal.show();
}

// Cargar tabla de empresas en el modal
async function cargarTablaEmpresas() {
    try {
        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com';
        
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/empresas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error al cargar empresas');
        
        const empresas = await res.json();
        const tbody = document.getElementById('tabla-empresas-body');
        if (!tbody) return;
        
        tbody.innerHTML = empresas.map(emp => `
            <tr>
                <td>${escapeHTML(emp.nombre)}</td>
                <td>${escapeHTML(emp.rfc || '-')}</td>
                <td>${escapeHTML(emp.email || '-')}</td>
                <td>
                    <span class="badge ${emp.isActive ? 'bg-success' : 'bg-secondary'}">
                        ${emp.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                    ${emp.isDefault ? '<span class="badge bg-primary ms-1">Principal</span>' : ''}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="empresasApp.editarEmpresa('${emp._id}')" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    ${!emp.isDefault ? `
                    <button class="btn btn-sm btn-outline-danger ms-1" onclick="empresasApp.desactivarEmpresa('${emp._id}')" title="Desactivar">
                        <i class="bi bi-trash"></i>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('[EmpresaContext] Error cargando tabla:', e);
        if (window.app && window.app.showToast) {
            window.app.showToast('Error cargando empresas', 'error');
        }
    }
}

// Guardar nueva empresa
async function guardarEmpresa(e) {
    if (e) e.preventDefault();
    
    try {
        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com';
        
        const checkboxModuloSeguros = document.getElementById('checkModuloSeguros');
        const moduloSegurosValue = checkboxModuloSeguros ? checkboxModuloSeguros.checked : false;
        
        console.log('[guardarEmpresa] Valor de moduloSeguros:', moduloSegurosValue);
        
        const data = {
            nombre: document.getElementById('emp-nombre').value,
            rfc: document.getElementById('emp-rfc').value,
            email: document.getElementById('emp-email').value,
            direccion: document.getElementById('emp-direccion').value,
            telefono: document.getElementById('emp-telefono').value,
            moduloSeguros: moduloSegurosValue
        };
        
        console.log('[guardarEmpresa] Payload a enviar:', data);
        
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/empresas`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Error al crear empresa');
        }
        
        const response = await res.json();
        console.log('[guardarEmpresa] Respuesta del servidor:', response);
        
        if (window.app && window.app.showToast) {
            window.app.showToast('Empresa creada exitosamente', 'success');
        }
        
        // Limpiar formulario
        document.getElementById('form-nueva-empresa').reset();
        
        // Recargar tablas
        await cargarTablaEmpresas();
        await cargarEmpresasSelector();
    } catch (e) {
        console.error('[EmpresaContext] Error guardando empresa:', e);
        if (window.app && window.app.showToast) {
            window.app.showToast(e.message || 'Error al crear empresa', 'error');
        }
    }
}

// Editar empresa existente
async function editarEmpresa(id) {
    try {
        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com';
        
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/empresas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error al cargar empresas');
        
        const empresas = await res.json();
        const empresa = empresas.find(e => e._id === id);
        if (!empresa) return;
        
        // Usar SweetAlert2 si está disponible
        const Swal = window.Swal;
        if (!Swal) {
            alert('SweetAlert2 no está disponible');
            return;
        }
        
        const { value: formValues } = await Swal.fire({
            title: 'Editar Empresa',
            html: `
                <div class="text-start">
                    <label class="form-label small">Nombre</label>
                    <input id="swal-nombre" class="form-control mb-2" value="${escapeHTML(empresa.nombre)}">
                    <label class="form-label small">RFC</label>
                    <input id="swal-rfc" class="form-control mb-2" value="${escapeHTML(empresa.rfc || '')}">
                    <label class="form-label small">Email</label>
                    <input id="swal-email" class="form-control mb-2" value="${escapeHTML(empresa.email || '')}">
                    <label class="form-label small">Dirección</label>
                    <input id="swal-direccion" class="form-control mb-2" value="${escapeHTML(empresa.direccion || '')}">
                    <label class="form-label small">Teléfono</label>
                    <input id="swal-telefono" class="form-control mb-2" value="${escapeHTML(empresa.telefono || '')}">
                    <div class="form-check mt-2">
                        <input class="form-check-input" type="checkbox" id="swal-modulo-seguros" ${empresa.moduloSeguros ? 'checked' : ''}>
                        <label class="form-check-label small" for="swal-modulo-seguros">
                            Activar Módulo de Seguros
                        </label>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                return {
                    nombre: document.getElementById('swal-nombre').value,
                    rfc: document.getElementById('swal-rfc').value,
                    email: document.getElementById('swal-email').value,
                    direccion: document.getElementById('swal-direccion').value,
                    telefono: document.getElementById('swal-telefono').value,
                    moduloSeguros: document.getElementById('swal-modulo-seguros').checked
                };
            }
        });
        
        if (formValues) {
            console.log('[editarEmpresa] Payload a enviar al PUT:', formValues);
            
            const updateRes = await fetch(`${API_URL}/api/empresas/${id}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formValues)
            });
            
            console.log('[editarEmpresa] Status de respuesta:', updateRes.status);
            
            if (!updateRes.ok) {
                const errorData = await updateRes.json();
                console.error('[editarEmpresa] Error del servidor:', errorData);
                throw new Error(errorData.error || errorData.details || 'Error al actualizar');
            }
            
            const responseData = await updateRes.json();
            console.log('[editarEmpresa] Respuesta exitosa:', responseData);
            
            if (window.app && window.app.showToast) {
                window.app.showToast('Empresa actualizada', 'success');
            }
            
            await cargarTablaEmpresas();
            await cargarEmpresasSelector();
        }
    } catch (e) {
        console.error('[EmpresaContext] Error editando empresa:', e);
        if (window.app && window.app.showToast) {
            window.app.showToast('Error al editar empresa', 'error');
        }
    }
}

// Desactivar empresa (soft delete)
async function desactivarEmpresa(id) {
    const Swal = window.Swal;
    if (!Swal) {
        if (!confirm('¿Desactivar empresa?')) return;
    } else {
        const result = await Swal.fire({
            title: '¿Desactivar empresa?',
            text: 'La empresa no aparecerá en el selector pero los datos se conservan',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, desactivar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33'
        });
        
        if (!result.isConfirmed) return;
    }
    
    try {
        const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000'
            : 'https://fiarecords-app.onrender.com';
        
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/empresas/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error al desactivar');
        
        if (window.app && window.app.showToast) {
            window.app.showToast('Empresa desactivada', 'success');
        }
        
        await cargarTablaEmpresas();
        await cargarEmpresasSelector();
    } catch (e) {
        console.error('[EmpresaContext] Error desactivando empresa:', e);
        if (window.app && window.app.showToast) {
            window.app.showToast('Error al desactivar', 'error');
        }
    }
}

// Helper para escapar HTML
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

// ==================================================================
// 4. EXPOSICIÓN GLOBAL
// ==================================================================

// Crear namespace global para las funciones
window.empresasApp = {
    EmpresaContext,
    inicializarSelectorEmpresa,
    cargarEmpresasSelector,
    cambiarEmpresaContexto,
    abrirModalEmpresas,
    cargarTablaEmpresas,
    guardarEmpresa,
    editarEmpresa,
    desactivarEmpresa,
    refreshCurrentView
};


// ==================================================================
// 5. INTEGRACIÓN CON APP PRINCIPAL
// ==================================================================

// Función para integrar con window.app (se ejecuta después de que DOM y script.js estén listos)
function integrarConApp() {
    // Si window.app no existe, crearlo
    if (!window.app) {
        window.app = {};
    }
    
    // Agregar funciones de empresas a window.app
    // Las funciones del HTML usan app.nombreFuncion()
    window.app.cambiarEmpresaContexto = cambiarEmpresaContexto;
    window.app.abrirModalEmpresas = abrirModalEmpresas;
    window.app.guardarEmpresa = guardarEmpresa;
    window.app.editarEmpresa = editarEmpresa;
    window.app.desactivarEmpresa = desactivarEmpresa;
    
}

// Bandera para evitar ejecución múltiple
let integracionCompleta = false;

// Ejecutar integración cuando window.app esté disponible
// script.js crea window.app al final de su ejecución
function esperarYIntegrar() {
    let intentos = 0;
    const maxIntentos = 50; // 5 segundos máximo
    
    const intervalo = setInterval(() => {
        if (integracionCompleta) {
            clearInterval(intervalo);
            return;
        }
        
        intentos++;
        
        // Verificar si window.app existe o si ya pasó mucho tiempo
        if (window.app || intentos >= maxIntentos) {
            clearInterval(intervalo);
            if (!integracionCompleta) {
                integrarConApp();
                integracionCompleta = true;
            }
            
            if (!window.app && intentos >= maxIntentos) {
                console.warn('[empresas.js] ⚠️ window.app no encontrado después de 5s, creando objeto propio');
            }
        }
    }, 100); // Verificar cada 100ms
}

// Iniciar espera
esperarYIntegrar();

// Backup: también ejecutar cuando el DOM esté listo (solo si no se ha integrado)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (!integracionCompleta) {
                integrarConApp();
                integracionCompleta = true;
            }
        }, 500);
    });
}
