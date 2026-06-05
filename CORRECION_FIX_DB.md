# ✅ fix-db.js Corregido - Usa Variables de Entorno del .env

## 🔧 Cambios Realizados

### Antes (INCORRECTO):
```javascript
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fiarecords';
require('dotenv').config(); // ← Cargado DESPUÉS
```
❌ Problema: URI hardcodeada a localhost, no usa tu .env real

### Después (CORRECTO):
```javascript
require('dotenv').config(); // ← Cargado PRIMERO

const mongoose = require('mongoose');
const Empresa = require('./models/Empresa');

const MONGO_URI = process.env.MONGO_URI; // ← LEE DEL .env (igual a server.js)
```
✅ Ahora: Lee MONGO_URI del archivo .env, igual que tu server.js

---

## 📋 Cambios Específicos

### 1. Cargar dotenv PRIMERO
```javascript
// CARGAR VARIABLES DE ENTORNO PRIMERO
require('dotenv').config();
```
✅ Se carga antes de cualquier variable de entorno

### 2. Usar MONGO_URI (sin fallback a hardcoded)
```javascript
const MONGO_URI = process.env.MONGO_URI;
```
✅ Usa EXACTAMENTE la misma variable que tu server.js

### 3. Validar que MONGO_URI esté definido
```javascript
if (!MONGO_URI) {
    throw new Error(
        '❌ Variable de entorno MONGO_URI no está definida.\n' +
        '   Por favor, asegúrate de que tu archivo .env contiene:\n' +
        '   MONGO_URI=mongodb+srv://... o MONGO_URI=mongodb://...\n' +
        '   Luego ejecuta de nuevo: node fix-db.js'
    );
}
```
✅ Si falta, da instrucción clara sobre qué agregar al .env

---

## 🚀 Para Ejecutar

### Opción 1: Si tu .env está en la carpeta raíz
```bash
node fix-db.js
```

### Opción 2: Si fix-db.js está en subfolder y .env en raíz
```bash
node fix-db.js
```
(dotenv busca automáticamente .env en la carpeta raíz)

---

## ✅ Verificación

### Si TODO está correcto:
```
🔧 INICIANDO SCRIPT DE REPARACIÓN DE BASE DE DATOS
═════════════════════════════════════════════════════════

📍 Conectando a MongoDB usando MONGO_URI del .env
📍 Empresa ID: 6a1887223134989151dd2974

🔌 Conectando a MongoDB...
✅ Conexión exitosa a MongoDB

✅ ¡ÉXITO! Los datos están correctamente actualizados en la BD
```

### Si MONGO_URI no está en .env:
```
❌ Variable de entorno MONGO_URI no está definida.
   Por favor, asegúrate de que tu archivo .env contiene:
   MONGO_URI=mongodb+srv://... o MONGO_URI=mongodb://...
   Luego ejecuta de nuevo: node fix-db.js
```

**Solución:** Agregaen tu .env:
```
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/fiarecords?retryWrites=true&w=majority
```

---

## 🔍 Comparación con server.js

| Elemento | server.js | fix-db.js (antes) | fix-db.js (ahora) |
|----------|-----------|------------------|-------------------|
| dotenv | `require('dotenv').config()` línea 4 | ❌ Después | ✅ Antes (línea 15) |
| URI | `process.env.MONGO_URI` | ❌ fallback a localhost | ✅ `process.env.MONGO_URI` |
| Validación | Implícita | ❌ No | ✅ Sí (línea 34-41) |

---

## 📞 Si Sigue Fallando

**Paso 1: Verifica que tu .env existe**
```bash
# En PowerShell:
Test-Path .env
```

**Paso 2: Verifica el contenido de .env**
```bash
# Ver MONGO_URI en .env:
Get-Content .env | Select-String "MONGO_URI"
```

**Paso 3: Verifica que el servidor puede conectarse**
```bash
npm start
# Si npm start funciona, significa que MONGO_URI es válido
```

**Paso 4: Ejecuta fix-db.js nuevamente**
```bash
node fix-db.js
```

---

## ✅ Status del Fix

- [✅] dotenv cargado PRIMERO
- [✅] Usa `process.env.MONGO_URI` (igual a server.js)
- [✅] Sin fallback a hardcoded localhost
- [✅] Validación clara si falta MONGO_URI
- [✅] Mismo script, solo cambios en conexión

**¡Listo para ejecutar!**

```bash
node fix-db.js
```
