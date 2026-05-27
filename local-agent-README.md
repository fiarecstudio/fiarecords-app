# Agente Local - Cámaras IP

Este script captura el flujo de video de cámaras IP (RTSP) y lo transmite al servidor en la nube mediante WebSockets.

## Requisitos Previos

1. **Node.js** (v14 o superior)
   ```bash
   node --version
   ```

2. **FFmpeg** instalado y disponible en PATH
   - **Windows**: Descargar desde https://ffmpeg.org/download.html y agregar al PATH
   - **Linux**: `sudo apt-get install ffmpeg`
   - **macOS**: `brew install ffmpeg`
   
   Verificar instalación:
   ```bash
   ffmpeg -version
   ```

## Instalación

1. Copiar los archivos del agente a la máquina local (donde están las cámaras):
   - `local-agent.js`
   - `local-agent-package.json`

2. Instalar dependencias:
   ```bash
   npm install
   ```

## Configuración

Editar el archivo `local-agent.js` y modificar la sección `CONFIG`:

```javascript
const CONFIG = {
    // URL del servidor en la nube
    SERVER_URL: 'ws://tu-servidor-nube.com:5000/video',
    
    // Token de autenticación
    AGENT_TOKEN: 'tu-token-secreto-agente',
    
    // Configuración de cámaras
    CAMERAS: [
        {
            id: 'cam-001',
            name: 'Cámara Principal',
            rtspUrl: 'rtsp://usuario:password@192.168.1.100:554/stream1',
            enabled: true
        }
    ],
    
    // Configuración de FFmpeg
    FFMPEG: {
        videoCodec: 'h264',
        resolution: '1280x720',
        fps: 15,
        bitrate: '1000k',
        audioCodec: 'aac',
        format: 'mpegts'
    }
};
```

### Formato URL RTSP

El formato típico de URL RTSP es:
```
rtsp://usuario:password@IP_CAMARA:554/ruta_stream
```

Consultar la documentación de tu cámara para obtener la URL exacta.

## Ejecución

### Iniciar el agente
```bash
npm start
```

### Ejecutar en segundo plano (Linux/macOS)
```bash
nohup npm start > agent.log 2>&1 &
```

### Ejecutar como servicio (Windows)
Usar `npm install -g pm2` y luego:
```bash
pm2 start local-agent.js --name "fia-agent"
pm2 save
pm2 startup
```

## Variables de Entorno

Opcionalmente, puedes usar variables de entorno para la configuración:

```bash
export SERVER_URL="ws://tu-servidor-nube.com:5000/video"
export AGENT_TOKEN="tu-token-secreto-agente"
npm start
```

## Solución de Problemas

### FFmpeg no encontrado
Asegúrate de que FFmpeg esté instalado y en el PATH:
```bash
ffmpeg -version
```

### Error de conexión WebSocket
- Verifica que el servidor en la nube esté corriendo
- Verifica que el puerto esté abierto en el firewall
- Revisa la URL del servidor

### Cámara no conecta
- Verifica que la cámara esté accesible desde la máquina del agente
- Prueba la URL RTSP con VLC Media Player
- Revisa las credenciales de autenticación de la cámara
- Verifica que el puerto 554 no esté bloqueado por el firewall

### Latencia alta
Ajusta los parámetros de FFmpeg:
- Reducir FPS: `fps: 10`
- Reducir resolución: `resolution: '640x480'`
- Reducir bitrate: `bitrate: '500k'`

## Seguridad

- **NO** exponer el agente a internet
- Mantener el token de autenticación seguro
- Usar conexiones HTTPS/WSS en producción
- Limitar el acceso a la red local

## Monitoreo

El agente muestra logs en consola con información sobre:
- Conexión WebSocket
- Estado de cámaras
- Errores de FFmpeg
- Reconexiones automáticas

## Soporte

Para problemas o preguntas, contactar al equipo de soporte.
