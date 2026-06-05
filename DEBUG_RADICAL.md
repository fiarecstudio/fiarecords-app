# 🔴 DEBUG RADICAL - Verificación de tipoDashboard y Sidebar

## 📋 CAMBIOS APLICADOS

### 1. Backend (`routes/configuracion.js`)
**Líneas 188-230 modificadas**

✅ Ahora imprime:
```
[Config] ✅ Empresa encontrada por ID: [ID]
[Config] empresa.moduloSeguros: true/false
[Config] empresa.tipoDashboard (RAW): seguros/estandar
[Config] Tipo de empresa.tipoDashboard: string
[Config] ========== RESPUESTA FINAL QUE ENVIARÁ AL CLIENTE ==========
[Config] config.moduloSeguros: true/false
[Config] config.tipoDashboard: seguros/estandar
[Config] JSON completo: {...}
```

### 2. Frontend - `cargarDashboard()` (línea ~1062)
**DEPURACIÓN RADICAL agregada**

✅ Primer log (ANTES de try/catch):
```javascript
console.log('CONFIG ACTUAL CARGADA:', configCache);
console.log('[RADICAL DEBUG] configCache completo:', JSON.stringify(configCache, null, 2));
```

✅ Dentro del try:
```javascript
console.log('[cargarDashboard] tipoDashboard (sin comillas adicionales):', tipoDashboard);
console.log('[cargarDashboard] Tipo de tipoDashboard:', typeof tipoDashboard);
console.log('[cargarDashboard] ¿Comparación tipoDashboard === "seguros"?', tipoDashboard === 'seguros');
```

✅ Con bloqueo radical:
```javascript
const dashboardTrimmed = (tipoDashboard || '').trim().toLowerCase();
console.log('[cargarDashboard] Dashboard después de trim/lowercase:', dashboardTrimmed);

if (dashboardTrimmed === 'seguros') {
    console.log('[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...');
    await cargarDashboardSeguros();
    return;
} else {
    console.log('[cargarDashboard] ❌ CONDICIÓN NO CUMPLIDA: Cargando dashboard estándar');
}
```

### 3. Frontend - `renderSidebar()` (línea ~5404)
**DEPURACIÓN RADICAL + BLOQUEO RADICAL**

✅ Primer log (ANTES de todo):
```javascript
console.log('CONFIG ACTUAL CARGADA:', configCache);
console.log('[RADICAL DEBUG] renderSidebar - configCache completo:', JSON.stringify(configCache, null, 2));
```

✅ Variables de control mejoradas:
```javascript
const tipoDashboardRaw = configCache?.tipoDashboard || 'estandar';
// BLOQUEO RADICAL: Trim y lowercase
const tipoDashboard = (tipoDashboardRaw || '').trim().toLowerCase();
const esDashboardSeguros = tipoDashboard === 'seguros';
```

✅ Logs de diagnóstico:
```javascript
console.log('[renderSidebar] RAW tipoDashboard:', tipoDashboardRaw);
console.log('[renderSidebar] PROCESADO tipoDashboard:', tipoDashboard);
console.log('[renderSidebar] esDashboardSeguros:', esDashboardSeguros);
```

✅ En la rama de renderizado:
```javascript
if (esDashboardSeguros) {
    console.log('[renderSidebar] ✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS');
    // Solo Seguros
} else {
    console.log('[renderSidebar] ❌ RENDERIZANDO SIDEBAR ESTÁNDAR');
    // Dashboard, Agenda, Proyectos, etc.
}
```

---

## 🧪 PROCEDIMIENTO DE VERIFICACIÓN

### PASO 1: Verificar Backend está enviando tipoDashboard

**Acción:**
1. Abre el navegador en DevTools → Network
2. Haz login o recarga la app
3. Busca request a `/api/configuracion`
4. Haz clic en Response
5. Busca la propiedad `"tipoDashboard"`

**Esperado:**
```json
{
  "nombreEmpresa": "Mi Empresa Seguros",
  "tipoDashboard": "seguros",
  "moduloSeguros": true,
  ...
}
```

**Si NO está:**
- Revisar logs del servidor (terminal)
- Confirmar que la empresa en BD tiene el campo `tipoDashboard` poblado
- Ejecutar: `db.empresas.findOne({nombre: "..."})` para verificar

---

### PASO 2: Verificar configCache está recibiendo tipoDashboard

**Acción:**
1. Abre DevTools → Console
2. Ejecuta: `console.log(configCache)`
3. Expande el objeto
4. Busca `tipoDashboard`

**Esperado:**
```
configCache = {
  nombreEmpresa: "Mi Empresa Seguros"
  tipoDashboard: "seguros"
  moduloSeguros: true
  ...
}
```

**Si tipoDashboard es undefined:**
- El backend NO está enviándolo (volver a PASO 1)
- El frontend NO está leyéndolo de la respuesta (verificar loadConfig())

---

### PASO 3: Revisar logs en Console del Navegador

**Acción:**
1. Abre DevTools → Console
2. Filtra por `renderSidebar` o `cargarDashboard`

**Esperado para Dashboard de Seguros:**
```
CONFIG ACTUAL CARGADA: {nombreEmpresa: "...", tipoDashboard: "seguros", ...}
[RADICAL DEBUG] renderSidebar - configCache completo: {...}
[renderSidebar] RAW tipoDashboard: "seguros"
[renderSidebar] PROCESADO tipoDashboard: "seguros"
[renderSidebar] esDashboardSeguros: true
[renderSidebar] ✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS

CONFIG ACTUAL CARGADA: {nombreEmpresa: "...", tipoDashboard: "seguros", ...}
[RADICAL DEBUG] configCache completo: {...}
[cargarDashboard] tipoDashboard (sin comillas adicionales): "seguros"
[cargarDashboard] ¿Comparación tipoDashboard === "seguros"?: true
[cargarDashboard] Dashboard después de trim/lowercase: "seguros"
[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...
```

---

### PASO 4: Revisar Logs en Servidor (Terminal/Consola de Node)

**Acción:**
1. Busca en los logs del servidor por `[Config]`

**Esperado:**
```
[Config] ✅ Empresa encontrada por ID: 123abc...
[Config] empresa.moduloSeguros: true
[Config] empresa.tipoDashboard (RAW): seguros
[Config] Tipo de empresa.tipoDashboard: string
[Config] Después de asignación, config.tipoDashboard: seguros
[Config] Después de asignación, config.moduloSeguros: true
[Config] ========== RESPUESTA FINAL QUE ENVIARÁ AL CLIENTE ==========
[Config] config.moduloSeguros: true
[Config] config.tipoDashboard: seguros
[Config] JSON completo: {...}
```

---

## 🔍 ÁRBOL DE DECISIÓN PARA DEBUGGING

```
¿Dashboard de Seguros no aparece?
│
├─ NO veo logs de "[renderSidebar]" y "[cargarDashboard]"
│  └─ ❌ Posible: La app no está recargando o hay error crítico
│     └─ Revisar: Console → Errores en rojo
│
├─ VEO logs pero "esDashboardSeguros: false"
│  └─ ❌ Posible: configCache.tipoDashboard es undefined
│     ├─ Revisar: PASO 1 (Backend) - ¿Está enviando tipoDashboard?
│     └─ Revisar: PASO 3 - ¿Qué dice console.log(configCache)?
│
├─ "esDashboardSeguros: true" PERO sigo viendo sidebar estándar
│  └─ ❌ Posible: Los logs dicen ✅ RENDERIZANDO pero HTML NO cambió
│     └─ Esto sugiere:
│        ├─ navContainer.innerHTML = html NO está ejecutándose
│        ├─ navContainer tiene un ID incorrecto o no existe
│        └─ Revisar PASO 4 en Console: ¿Hay errores de JavaScript?
│
├─ Dashboard se renderiza PERO muestra "Proyectos Activos"
│  └─ ❌ Posible: cargarDashboard() dice "✅ CONDICIÓN CUMPLIDA"
│              pero después de ello se carga el dashboard estándar
│     └─ Esto sugiere:
│        ├─ cargarDashboardSeguros() se ejecuta
│        └─ Pero después algo lo sobrescribe (revisar línea ~1103)
│
└─ VEO "Dashboard de Seguros" pero también veo "Proyectos"
   └─ ❌ Posible: Las secciones no están siendo bloqueadas
      └─ Revisar: ¿El sidebar tiene "Proyectos" visible?
         └─ Si sí, entonces `esDashboardSeguros` es false
            └─ Volver al punto "VEO logs pero esDashboardSeguros: false"
```

---

## 🚀 CHECKLIST FINAL

- [ ] **Backend (`routes/configuracion.js`):**
  - [ ] Empresa tiene campo `tipoDashboard` en MongoDB
  - [ ] Backend lee `empresa.tipoDashboard` correctamente
  - [ ] Backend incluye `tipoDashboard` en respuesta JSON
  - [ ] Logs de servidor muestran "✅ Empresa encontrada"

- [ ] **Frontend (`script.js` - `cargarDashboard`):**
  - [ ] `configCache.tipoDashboard` tiene valor "seguros"
  - [ ] Comparación `dashboardTrimmed === 'seguros'` es `true`
  - [ ] Log muestra "✅ CONDICIÓN CUMPLIDA"
  - [ ] `cargarDashboardSeguros()` se ejecuta y renderiza

- [ ] **Frontend (`script.js` - `renderSidebar`):**
  - [ ] `esDashboardSeguros` es `true`
  - [ ] Log muestra "✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS"
  - [ ] Sidebar solo tiene: Dashboard, Pólizas, Config Correos, Admin
  - [ ] NO hay: Proyectos, Agenda, Artistas, Servicios, Usuarios

- [ ] **Visual:**
  - [ ] Sidebar NO muestra "Proyectos", "Agenda", "Artistas", etc.
  - [ ] Dashboard muestra "Dashboard de Seguros" (verde)
  - [ ] Pólizas Activas, Por Vencer, Pagos Pendientes visibles

---

## 📞 SI SIGUE FALLANDO

1. **Copia TODOS los logs de la consola** (incluyendo errores en rojo)
2. **Copia TODOS los logs del servidor** (terminal de Node)
3. **Ejecuta en consola:**
   ```javascript
   console.log('=== DEBUG COMPLETO ===');
   console.log('configCache:', configCache);
   console.log('configCache.tipoDashboard:', configCache?.tipoDashboard);
   console.log('typeof tipoDashboard:', typeof configCache?.tipoDashboard);
   console.log('=== FIN DEBUG ===');
   ```
4. Pegado esto en el reporte del problema
