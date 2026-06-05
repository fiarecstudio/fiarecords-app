# 🔧 INSTRUCCIONES: Reparación de Base de Datos - tipoDashboard

## 📋 PROBLEMA IDENTIFICADO

El frontend recibe `configCache.tipoDashboard: 'estandar'`, lo que significa la base de datos está devolviendo 'estandar' en lugar de 'seguros' para la empresa ID `6a1887223134989151dd2974`.

---

## ✅ SOLUCIÓN PASO A PASO

### PASO 1: Ejecutar el Script de Reparación

**Desde la terminal/PowerShell en la carpeta del proyecto:**

```bash
node fix-db.js
```

**Esperado:**
```
🔧 INICIANDO SCRIPT DE REPARACIÓN DE BASE DE DATOS
═════════════════════════════════════════════════════════

📍 URI MongoDB: mongodb://...
📍 Empresa ID: 6a1887223134989151dd2974

🔌 Conectando a MongoDB...
✅ Conexión exitosa a MongoDB

🔍 Buscando empresa en la base de datos...
✅ Empresa encontrada

📋 ESTADO ANTES DE LA ACTUALIZACIÓN:
─────────────────────────────────────
   Nombre: [Nombre de la empresa]
   tipoDashboard: estandar
   moduloSeguros: false

🔄 Actualizando empresa...
✅ Empresa actualizada exitosamente

📋 ESTADO DESPUÉS DE LA ACTUALIZACIÓN:
─────────────────────────────────────
   Nombre: [Nombre de la empresa]
   tipoDashboard: seguros
   moduloSeguros: true

✅ VERIFICACIÓN: Leyendo desde la base de datos...
✅ ¡ÉXITO! Los datos están correctamente actualizados en la BD

📊 RESULTADO FINAL:
─────────────────────────────────────
   ✅ tipoDashboard: "seguros"
   ✅ moduloSeguros: true

🚀 PRÓXIMOS PASOS:
─────────────────────────────────────
   1. Reinicia el servidor Node.js: npm start
   2. Recarga el navegador: Ctrl+Shift+R
   3. Abre DevTools (F12) y revisa la Console
   4. Busca logs [Config] para ver que tipoDashboard: "seguros" está siendo enviado
```

---

### PASO 2: Verificación en MongoDB (Alternativa Manual)

Si prefieres verificar directamente en MongoDB sin ejecutar el script:

**Opción A: MongoDB CLI**
```bash
db.empresas.findOne({_id: ObjectId("6a1887223134989151dd2974")})
```

**Esperado:**
```json
{
  "_id": ObjectId("6a1887223134989151dd2974"),
  "nombre": "...",
  "tipoDashboard": "seguros",
  "moduloSeguros": true,
  ...
}
```

**Para actualizar manualmente (si el script no funcionó):**
```bash
db.empresas.updateOne(
  {_id: ObjectId("6a1887223134989151dd2974")},
  {$set: {tipoDashboard: "seguros", moduloSeguros: true}}
)
```

**Opción B: MongoDB Compass (GUI)**
1. Conecta a tu instancia MongoDB
2. Base de datos: `fiarecords` (o la que uses)
3. Colección: `empresas`
4. Busca por `_id`: `6a1887223134989151dd2974`
5. Edita los campos:
   - `tipoDashboard` → cambia a `"seguros"`
   - `moduloSeguros` → cambia a `true`
6. Guarda

---

### PASO 3: Verificar en Backend

Después de actualizar la BD, reinicia el servidor:

```bash
# Detener servidor actual (Ctrl+C)
# Luego ejecutar:
npm start
```

**En los logs del servidor deberías ver:**
```
[Config] ✅ Empresa encontrada por ID: 6a1887223134989151dd2974
[Config] empresa.moduloSeguros: true
[Config] empresa.tipoDashboard (RAW): seguros
[Config] Tipo de empresa.tipoDashboard: string
[Config] Después de asignación, config.tipoDashboard: seguros
[Config] Después de asignación, config.moduloSeguros: true
[Config] ========== RESPUESTA FINAL QUE ENVIARÁ AL CLIENTE ==========
[Config] config.tipoDashboard: seguros
[Config] moduloSeguros: true
```

---

### PASO 4: Verificar en Frontend

**En el navegador (después de Ctrl+Shift+R hard refresh):**

1. Abre DevTools (F12)
2. Va a Console
3. Busca logs `[Config]`, `[renderSidebar]`, `[cargarDashboard]`

**Esperado:**
```javascript
// En console:
[Config] ✅ Empresa encontrada por ID: 6a1887223134989151dd2974
[Config] empresa.tipoDashboard (RAW): seguros
[Config] Después de asignación, config.tipoDashboard: seguros

CONFIG ACTUAL CARGADA: {tipoDashboard: "seguros", moduloSeguros: true, ...}
[renderSidebar] esDashboardSeguros: true
[renderSidebar] ✅ RENDERIZANDO SIDEBAR PARA DASHBOARD DE SEGUROS

[cargarDashboard] Dashboard después de trim/lowercase: "seguros"
[cargarDashboard] ✅ CONDICIÓN CUMPLIDA: Cargando dashboard de seguros...
```

---

### PASO 5: Validación Visual

En la aplicación deberías ver:

- ✅ Sidebar: SOLO "Dashboard", "Pólizas", "Configuración Correos"
- ✅ NO aparecen: "Proyectos", "Agenda", "Artistas", "Servicios"
- ✅ Dashboard: Verde, título dice "Dashboard de Seguros"
- ✅ Tarjetas: "Pólizas Activas", "Por Vencer", "Pagos Pendientes"

---

## 🔍 REVISIÓN DEL BACKEND (VERIFICADO)

### Consulta en `routes/configuracion.js` (Línea 190)

**CORRECTO:**
```javascript
const empresa = await Empresa.findById(finalEmpresaId);
```

✅ **NO excluye campos** - obtiene todos los campos del documento  
✅ **Incluye tipoDashboard** - el modelo Empresa define este campo  
✅ **Sin proyección** - no hay segundo parámetro que excluya campos

### Asignación en `routes/configuracion.js` (Línea 203)

**CORRECTO:**
```javascript
config.tipoDashboard = empresa.tipoDashboard || 'estandar';
```

✅ **Asigna el valor de la BD**  
✅ **Fallback correcto** - si es null/undefined, usa 'estandar'  
✅ **No hay lógica que sobrescriba**

### Modelo Empresa (lines 49-53)

**CORRECTO:**
```javascript
tipoDashboard: {
    type: String,
    enum: ['estandar', 'seguros'],
    default: 'estandar'
}
```

✅ **Campo definido correctamente**  
✅ **Enum protege valores válidos**  
✅ **Default es 'estandar'** (correcto para empresas que no lo especifiquen)

---

## ⚠️ SI EL SCRIPT FALLA

### Posible Problema 1: MongoDB no está corriendo
**Solución:**
```bash
# Verificar que MongoDB está activo
# Si usas MongoDB local, ejecuta:
mongod
```

### Posible Problema 2: Variable de entorno MONGODB_URI incorrecta
**Verificar en .env:**
```
MONGODB_URI=mongodb://localhost:27017/fiarecords
```

### Posible Problema 3: ID inválido o no existe
**Verificar:**
```bash
# En MongoDB CLI:
db.empresas.findOne({_id: ObjectId("6a1887223134989151dd2974")})
# Debe devolver un documento, no null
```

### Posible Problema 4: Permisos de Mongoose
**Solución:**
- Verifica que el usuario de MongoDB tenga permisos de escritura
- Revisa que el archivo `models/Empresa.js` está correctamente importado

---

## 📊 COMANDOS DE VERIFICACIÓN RÁPIDA

```javascript
// En consola de MongoDB:

// 1. Ver el documento ANTES de actualizar
db.empresas.findOne({_id: ObjectId("6a1887223134989151dd2974")})

// 2. Actualizar (manual)
db.empresas.updateOne(
  {_id: ObjectId("6a1887223134989151dd2974")},
  {$set: {tipoDashboard: "seguros", moduloSeguros: true}}
)

// 3. Ver el documento DESPUÉS
db.empresas.findOne({_id: ObjectId("6a1887223134989151dd2974")})

// 4. Verificar que el update fue exitoso
db.empresas.findOne(
  {_id: ObjectId("6a1887223134989151dd2974")},
  {tipoDashboard: 1, moduloSeguros: 1}
)
```

**Resultado esperado:**
```json
{
  "_id": ObjectId("6a1887223134989151dd2974"),
  "tipoDashboard": "seguros",
  "moduloSeguros": true
}
```

---

## ✅ CHECKLIST FINAL

- [ ] Ejecuté `node fix-db.js` exitosamente (o actualicé manualmente en MongoDB)
- [ ] BD muestra `tipoDashboard: "seguros"` y `moduloSeguros: true`
- [ ] Reinicié el servidor (`npm start`)
- [ ] Recarguéel navegador (`Ctrl+Shift+R`)
- [ ] En console veo `[Config] empresa.tipoDashboard (RAW): seguros`
- [ ] En console veo `[cargarDashboard] ✅ CONDICIÓN CUMPLIDA`
- [ ] Sidebar SOLO muestra opciones de Seguros
- [ ] Dashboard es verde y dice "Dashboard de Seguros"

**Si todos están marcados:** 🎉 ¡ÉXITO! El sistema está funcionando correctamente.

---

## 📞 RESUMEN RÁPIDO

| Paso | Comando | Verificar |
|------|---------|-----------|
| 1 | `node fix-db.js` | ✅ ÉXITO al final |
| 2 | `npm start` | Logs con `tipoDashboard: seguros` |
| 3 | `Ctrl+Shift+R` | Console muestra logs correctos |
| 4 | Visual | Sidebar filtra, dashboard es verde |

