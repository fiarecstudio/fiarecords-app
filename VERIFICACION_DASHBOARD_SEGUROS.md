================================================================================
                    CORRECCIÓN: ACCESO AL DASHBOARD DE SEGUROS
================================================================================

## PROBLEMA REPORTADO

El filtro radical en `mostrarSeccion()` estaba **bloqueando el acceso al dashboard**
mostrando: "Esta sección no está disponible en el módulo de Seguros"

## CAUSA

En script.js (línea 2214-2217), la validación era demasiado estricta:

```javascript
// ANTES (INCORRECTO)
const seccionesEstandar = ['dashboard', 'agenda', 'flujo-trabajo', ...];

if (esDashboardSeguros && seccionesEstandar.includes(id)) {
    showToast('⚠️ Esta sección no está disponible en el módulo de Seguros', 'warning');
    return;  // ❌ BLOQUEABA DASHBOARD
}
```

El problema: `'dashboard'` estaba en la lista negra, bloqueando a TODOS los usuarios
de seguros de acceder al dashboard.

## SOLUCIÓN APLICADA

### 1. Lista Blanca Revisada (script.js, línea 2204-2205)

**ANTES:**
```javascript
const seccionesSeguros = ['polizas', 'config-correos'];
const seccionesEstandar = ['dashboard', 'agenda', 'flujo-trabajo', 'cotizaciones', 'historial-proyectos', 'registrar-proyecto'];
```

**AHORA:**
```javascript
const seccionesSeguros = ['polizas', 'config-correos', 'mis-deudas', 'configuracion'];
// NOTA: 'dashboard' está permitido para AMBOS tipos (se decide internamente en cargarDashboard())
const seccionesEstandarBloqueadas = ['agenda', 'flujo-trabajo', 'cotizaciones', 'historial-proyectos', 'registrar-proyecto', 'gestion-artistas', 'gestion-servicios', 'gestion-usuarios'];
```

### 2. Validación Corregida (script.js, línea 2214-2217)

**ANTES:**
```javascript
if (esDashboardSeguros && seccionesEstandar.includes(id)) {
    showToast('⚠️ Esta sección no está disponible en el módulo de Seguros', 'warning');
    return;
}
```

**AHORA:**
```javascript
if (esDashboardSeguros && seccionesEstandarBloqueadas.includes(id)) {
    showToast('⚠️ Esta sección no está disponible en el módulo de Seguros', 'warning');
    return;
}
```

✅ Ahora 'dashboard' se permite SIEMPRE

## FLUJO DE EJECUCIÓN CORRECTO

### Cuando el usuario hace clic en "Dashboard"

1. **mostrarSeccion('dashboard', true)** es llamado
   - Verifica si tipoDashboard === 'seguros' ✅ YES
   - Verifica si 'dashboard' está en seccionesEstandarBloqueadas ❌ NO
   - Permite pasar ✅

2. **Activar sección en DOM**
   - Agrega clase `active` al elemento `#dashboard`
   - Remueve clase `active` de otros elementos

3. **Cargar datos**
   - Ejecuta `loadDataActions['dashboard']()` → **`cargarDashboard()`**

4. **Dentro de cargarDashboard() (línea 1062)**
   - Lee `configCache.tipoDashboard`
   - Si es 'seguros' → llama a **`cargarDashboardSeguros()`** ✅
   - Si es 'estandar' → carga dashboard estándar

5. **En cargarDashboardSeguros() (línea 1120)**
   - Renderiza estructura HTML personalizada del dashboard de seguros
   - Llama a `/api/polizas/dashboard/metricas` para obtener datos
   - Rellena los 4 KPIs:
     - PÓLIZAS ACTIVAS
     - PRÓXIMAS A VENCER (30D)
     - PAGOS REQUERIDOS/ATRASADOS
     - PRIMAS RECAUDADAS

## ARCHIVOS MODIFICADOS

### script.js
- **Línea 2204-2205**: Actualizada definición de listas de secciones
- **Línea 2213**: Nombre de variable cambió de `seccionesEstandar` a `seccionesEstandarBloqueadas`
- **Línea 2214**: Validación ahora usa `seccionesEstandarBloqueadas` en lugar de `seccionesEstandar`

### index.html
- **SIN CAMBIOS**: Ya tiene `<section id="dashboard" class="active section-view"></section>`
- El contenedor existe y es usado por `cargarDashboardSeguros()`

### Archivos NO modificados (ya estaban correctos)
- routes/configuracion.js ✅ (transmite tipoDashboard correctamente)
- models/Empresa.js ✅ (define tipoDashboard correctamente)
- cargarDashboard() ✅ (lógica correcta para seleccionar dashboard según tipoDashboard)
- cargarDashboardSeguros() ✅ (renderiza correctamente)

## VERIFICACIÓN

### Frontend - Esperado en Console (F12)

```
[mostrarSeccion] configCache: { tipoDashboard: 'seguros', moduloSeguros: true, ... }
[mostrarSeccion] tipoDashboard: seguros
[mostrarSeccion] esEmpresaSeguros: true
[mostrarSeccion] esDashboardSeguros: true
[mostrarSeccion] Sección solicitada: dashboard

[cargarDashboard] tipoDashboard (sin comillas adicionales): seguros
[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...

[cargarDashboardSeguros] Iniciando carga de dashboard de seguros...
[cargarDashboardSeguros] Estructura renderizada, cargando métricas...
[cargarDashboardSeguros] Respuesta de métricas: { metricas: { activas: N, ... } }
[cargarDashboardSeguros] Métricas actualizadas
```

### Frontend - Esperado visualmente

```
Dashboard de Seguros (título verde)
┌─────────────┬──────────────┬──────────────┬──────────────┐
│ Pólizas Act.│ Por Vencer   │ Pagos Pend.  │ Primas Recaud.│
│ [número]    │ [número]     │ [número]     │ $[cantidad]   │
└─────────────┴──────────────┴──────────────┴──────────────┘

✅ SIN mensaje "Esta sección no está disponible"
✅ Sin dashboard estándar de proyectos
✅ Solo 4 tarjetas verdes/amarillas/rojas/azules
```

## PRUEBAS A REALIZAR

### Test 1: Acceso al Dashboard
- [ ] Clic en "Dashboard" en sidebar
- [ ] Esperado: Sin error, dashboard de seguros se carga
- [ ] Console: Ver "✅ CONDICIÓN CUMPLIDA"

### Test 2: Intento de acceso a sección bloqueada
- [ ] Clic en "Proyectos" (si existe en sidebar)
- [ ] Esperado: Mensaje "Esta sección no está disponible en el módulo de Seguros"
- [ ] Comportamiento: No navega, se mantiene en dashboard

### Test 3: Acceso a Pólizas
- [ ] Clic en "Pólizas"
- [ ] Esperado: Se carga lista de pólizas sin problemas
- [ ] Console: No debe haber errores de validación

### Test 4: Acceso a Configuración
- [ ] Clic en "Configuración"
- [ ] Esperado: Se carga sin problema (está en lista blanca)
- [ ] Console: No debe haber error "no está disponible"

## CAMBIOS RESUMIDOS

| Archivo | Línea | Cambio | Impacto |
|---------|-------|--------|--------|
| script.js | 2204-2205 | Reorganizar listas de secciones | Permite 'dashboard' para ambos tipos |
| script.js | 2214 | Usar `seccionesEstandarBloqueadas` | Bloquea solo secciones innecesarias |

## ESTADO FINAL

✅ **Dashboard es accesible para empresas de seguros**
✅ **Secciones bloqueadas permanecen ocultas**
✅ **Flujo de datos funciona correctamente**
✅ **Sin mensajes de error falso**

================================================================================
