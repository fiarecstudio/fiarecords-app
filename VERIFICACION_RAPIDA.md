## ⚡ VERIFICACIÓN RÁPIDA - Checklist de 5 minutos

### 1. Backend está enviando tipoDashboard? ✅

**En terminal (Node.js):**
```
[Config] ✅ Empresa encontrada por ID: ...
[Config] empresa.tipoDashboard (RAW): seguros
[Config] Después de asignación, config.tipoDashboard: seguros
```

**Resultado:**
- [ ] VEO estos logs → ✅ Backend OK
- [ ] NO veo → ❌ Revisar BD: `db.empresas.findOne({}).tipoDashboard`

---

### 2. Frontend recibe en Network? ✅

**En DevTools → Network → /api/configuracion → Response:**
```json
{
  "tipoDashboard": "seguros",
  "moduloSeguros": true,
  ...
}
```

**Resultado:**
- [ ] VEO "tipoDashboard": "seguros" → ✅ Network OK
- [ ] NO veo → ❌ Problema en backend (volver a paso 1)

---

### 3. Frontend cargó configCache? ✅

**En DevTools → Console, ejecuta:**
```javascript
console.log(configCache?.tipoDashboard)
```

**Esperado:**
```
"seguros"
```

**Resultado:**
- [ ] VEO "seguros" (sin undefined) → ✅ configCache OK
- [ ] VEO undefined → ❌ Revisar paso 1-2

---

### 4. renderSidebar() renderizó correctamente? ✅

**En DevTools → Console, busca estos logs:**
```
[renderSidebar] esDashboardSeguros: true
[renderSidebar] ✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS
```

**Resultado:**
- [ ] VEO ambos logs → ✅ Sidebar filtrado
- [ ] VEO "esDashboardSeguros: false" → ❌ tipoDashboard tiene espacios/mayúsculas
  ```javascript
  // Ejecutar en console:
  const raw = configCache?.tipoDashboard;
  const procesado = (raw || '').trim().toLowerCase();
  console.log('RAW:', raw, '| PROCESADO:', procesado);
  ```

---

### 5. Dashboard se cargó correctamente? ✅

**En DevTools → Console, busca:**
```
[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...
```

**Visualmente en app:**
- [ ] Sidebar: SOLO "Dashboard", "Pólizas", "Config Correos"
- [ ] NO aparecen: "Proyectos", "Agenda", "Artistas", "Servicios"
- [ ] Dashboard: Verde, título dice "Dashboard de Seguros"
- [ ] Tarjetas: Pólizas Activas, Por Vencer, Pagos Pendientes

**Resultado:**
- [ ] TODO OK → ✅ SISTEMA FUNCIONANDO
- [ ] Dashboard estándar → ❌ Revisar paso 4

---

## 🔴 Problema Rápido: Dashboard estándar sigue apareciendo

**Causa probable:** `esDashboardSeguros = false`

**Revisar:**
```javascript
// En Console:
console.log('1. RAW:', configCache?.tipoDashboard);
console.log('2. PROCESADO:', (configCache?.tipoDashboard || '').trim().toLowerCase());
console.log('3. ¿EQUALS "seguros"?', (configCache?.tipoDashboard || '').trim().toLowerCase() === 'seguros');
```

**Si resultado es:**
- `RAW: " seguros"` (con espacio) → El backend envía con espacio
- `RAW: "Seguros"` (mayúscula) → El backend envía con mayúscula
- `RAW: undefined` → El backend NO envía (revisar paso 1-2)

**Solución:**
- Si RAW tiene espacio/mayúscula → Es problema del backend (revisar BD)
- Si es undefined → Revisar paso 1

---

## 📱 Logs esperados en orden

### Cuando carga la app correctamente:

**Terminal (Node):**
```
[Config] ✅ Empresa encontrada por ID: 123abc
[Config] empresa.tipoDashboard (RAW): seguros
[Config] Después de asignación, config.tipoDashboard: seguros
[Config] ========== RESPUESTA FINAL QUE ENVIARÁ AL CLIENTE ==========
[Config] config.tipoDashboard: seguros
[Config] JSON completo: {...}
```

**Console (DevTools):**
```
CONFIG ACTUAL CARGADA: {tipoDashboard: "seguros", ...}
[RADICAL DEBUG] renderSidebar - configCache completo: {...}
[renderSidebar] RAW tipoDashboard: "seguros"
[renderSidebar] PROCESADO tipoDashboard: "seguros"
[renderSidebar] esDashboardSeguros: true
[renderSidebar] ✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS

CONFIG ACTUAL CARGADA: {tipoDashboard: "seguros", ...}
[RADICAL DEBUG] configCache completo: {...}
[cargarDashboard] Dashboard después de trim/lowercase: "seguros"
[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...
```

---

## ✅ Validación Final

Marca las que cumples:

- [ ] Backend envía tipoDashboard=seguros
- [ ] Network muestra tipoDashboard en response
- [ ] configCache?.tipoDashboard = "seguros" en console
- [ ] esDashboardSeguros = true en console
- [ ] Log dice "✅ CONDICIÓN CUMPLIDA"
- [ ] Sidebar NO muestra Proyectos, Agenda, Artistas
- [ ] Dashboard es verde y dice "Dashboard de Seguros"
- [ ] Tarjetas de seguros visibles

**Si marcaste 8/8:** 🎉 SISTEMA FUNCIONA PERFECTAMENTE
**Si menos:** Revisar el paso que falla según la sección anterior
