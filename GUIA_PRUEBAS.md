# GUÍA DE PRUEBAS - Correcciones Multi-Tenant

## 📋 CHECKLIST DE PRUEBAS

### PRUEBA 1: Filtrado de Secciones por Tipo de Dashboard

**Setup:**
1. Editar una empresa en la BD: `db.empresas.findOneAndUpdate({nombre: "EmpresaSeguros"}, {$set: {tipoDashboard: "seguros"}})`
2. Editar otra empresa: `db.empresas.findOneAndUpdate({nombre: "EmpresaEstandar"}, {$set: {tipoDashboard: "estandar"}})`

**Test Case 1a: Dashboard = "seguros"**
- [ ] Ingresar como usuario de EmpresaSeguros
- [ ] Verificar en consola: `console.log(configCache.tipoDashboard)` = "seguros"
- [ ] Intentar acceder a #dashboard → Debe aparecer toast de advertencia
- [ ] Intentar acceder a #agenda → Debe aparecer toast de advertencia
- [ ] Acceder a #polizas → Debe permitir ✅
- [ ] Verificar sidebar: Solo muestra "Seguros" section (Pólizas, Config Correos)

**Test Case 1b: Dashboard = "estandar"**
- [ ] Ingresar como usuario de EmpresaEstandar
- [ ] Verificar en consola: `console.log(configCache.tipoDashboard)` = "estandar"
- [ ] Acceder a #dashboard → Debe permitir ✅
- [ ] Acceder a #agenda → Debe permitir ✅
- [ ] Intento acceder a #polizas SIN moduloSeguros → Debe aparecer toast de advertencia

---

### PRUEBA 2: Dashboard Personalizado

**Setup:**
1. Empresa con `tipoDashboard: "seguros"` y `moduloSeguros: true`

**Test Case 2:**
- [ ] Ingresar a la aplicación
- [ ] Observar consola: `[cargarDashboard] tipoDashboard: seguros`
- [ ] Dashboard debe mostrar: "Dashboard de Seguros" con métricas de pólizas
- [ ] NO debe mostrar: Proyectos Activos, Proyectos por Cobrar, Ingresos Mes

**Validación:**
```javascript
// En consola, ejecutar:
app.mostrarSeccion('dashboard');
// Debe ver en logs:
// [cargarDashboard] tipoDashboard: seguros
// [cargarDashboardSeguros] Cargando dashboard de seguros...
```

---

### PRUEBA 3: Campos en Edición de Póliza

**Setup:**
1. Empresa con `moduloSeguros: true`
2. Crear una póliza con: email="test@example.com", teléfono="5512345678", tipoPago="trimestral"

**Test Case 3a: Verificar precarga**
- [ ] Hacer clic en editar póliza
- [ ] Verificar que el modal muestra:
  - [ ] Campo de email con valor "test@example.com"
  - [ ] Campo de teléfono con valor "5512345678"
  - [ ] Select de frecuencia con "Trimestral" seleccionado

**Test Case 3b: Editar y guardar**
- [ ] Cambiar email a "newemail@example.com"
- [ ] Cambiar teléfono a "5555555555"
- [ ] Cambiar frecuencia a "Mensual"
- [ ] Hacer clic en "Actualizar"
- [ ] Verificar en BD que los cambios se guardaron
- [ ] Abrir edición nuevamente → Los valores nuevos deben aparecer

**Validación en consola:**
```javascript
// Después de editar, ejecutar:
db.polizas.findOne({_id: ObjectId("...")})
// Debe tener:
// "clienteEmail": "newemail@example.com",
// "clienteTelefono": "5555555555",
// "tipoPago": "mensual"
```

---

### PRUEBA 4: Frecuencia de Pago Visible

**Setup:**
1. Crear póliza nueva
2. Editar póliza existente

**Test Case 4a: Crear póliza**
- [ ] Clic en "Seguros" → "Pólizas" → "Registrar Nueva Póliza"
- [ ] Modal debe mostrar select "Frecuencia de Pago" con opciones:
  - [ ] Anual (seleccionado por defecto)
  - [ ] Trimestral
  - [ ] Mensual
- [ ] Cambiar a "Trimestral" y guardar
- [ ] Verificar en tabla que la póliza se creó

**Test Case 4b: Editar póliza**
- [ ] Hacer clic en editar póliza
- [ ] Select "Frecuencia de Pago" debe mostrar el valor actual
- [ ] Cambiar a otra opción y guardar
- [ ] Verificar que el cambio persiste

---

### PRUEBA 5: Consistencia Entre Crear y Editar

**Setup:**
1. Empresa con `moduloSeguros: true`

**Test Case 5:**
- [ ] Crear nueva póliza → Aparece formulario con X campos
- [ ] Editar póliza existente → Formulario debe tener los MISMOS campos
- [ ] Orden de campos debe ser idéntico:
  1. Número de Póliza
  2. Cliente
  3. Email / Teléfono (lado a lado)
  4. Frecuencia de Pago
  5. Aseguradora
  6. Inciso / Paquete
  7. Tipo de Seguro
  8. Fechas (lado a lado)
  9. Prima Total

---

### PRUEBA 6: Multi-Tenant Isolation

**Setup:**
1. Crear 2 empresas: A (seguros) y B (estándar)
2. Crear pólizas diferentes en cada una

**Test Case 6:**
- [ ] Ingresar como usuario de Empresa A
- [ ] Ver pólizas de A (solo debe haber las de A)
- [ ] Cambiar a Empresa B (si es super admin)
- [ ] Ver pólizas de B (NO debe ver las de A)
- [ ] Verificar en consola: `configCache.tipoDashboard` es diferente
- [ ] Dashboard de A = "seguros", Dashboard de B = "estandar"

---

## 🔍 COMANDOS DE DEBUG

### Ver estado de configCache:
```javascript
console.log('Empresa:', configCache.nombreEmpresa);
console.log('Dashboard:', configCache.tipoDashboard);
console.log('Módulo Seguros:', configCache.moduloSeguros);
```

### Ver validación de secciones:
```javascript
app.mostrarSeccion('polizas');
// Ver en consola los logs de validación
```

### Ver datos de póliza en edición:
```javascript
// Después de hacer clic en editar:
console.log('Póliza cargada:', document.getElementById('poliza-email').value);
console.log('Teléfono:', document.getElementById('poliza-telefono').value);
console.log('Frecuencia:', document.getElementById('poliza-tipo-pago').value);
```

### Validar tipoPago no duplicado:
```javascript
// En MongoDB:
db.polizas.findOne({}) // Revisar que tipoPago existe una sola vez
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

| Criterio | Esperado | Status |
|----------|----------|--------|
| Empresa con tipoDashboard="seguros" solo ve secciones de seguros | SÍ | [ ] |
| Dashboard personalizado se renderiza para tipo "seguros" | SÍ | [ ] |
| Email se muestra en edición de póliza | SÍ | [ ] |
| Teléfono se muestra en edición de póliza | SÍ | [ ] |
| Frecuencia de pago es editable | SÍ | [ ] |
| Formularios de crear y editar son idénticos | SÍ | [ ] |
| Multi-tenant isolation funciona correctamente | SÍ | [ ] |
| Logs en consola son claros y útiles | SÍ | [ ] |

---

## 📝 NOTAS

- Los logs en consola incluyen: `[cargarDashboard]`, `[mostrarSeccion]`, `[editarPoliza]` para fácil debugging
- Si `tipoDashboard` no está en la empresa, el default es `"estandar"`
- Si `moduloSeguros = false`, las secciones de seguros están bloqueadas
- Los campos email, teléfono y tipoPago tienen valores por defecto vacío/anual en creación
