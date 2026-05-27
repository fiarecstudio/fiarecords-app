/**
 * AGENTE LOCAL - Captura de Cámaras IP y Envío vía WebSockets
 * 
 * Este script corre en la misma red local que las cámaras IP.
 * Captura el flujo RTSP usando FFmpeg y lo envía al servidor en la nube.
 * 
 * REQUISITOS:
 * - Node.js instalado
 * - FFmpeg instalado y disponible en PATH
 * - npm install fluent-ffmpeg ws
 * 
 * USO:
 * node local-agent.js
 */

const ffmpeg = require('fluent-ffmpeg');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ==================================================================
// CONFIGURACIÓN
// ==================================================================

const CONFIG = {
    // URL del servidor en la nube (WebSocket)
    SERVER_URL: process.env.SERVER_URL || 'ws://tu-servidor-nube.com:5000/video',
    
    // Token de autenticación para el Agente (debe coincidir con el servidor)
    AGENT_TOKEN: process.env.AGENT_TOKEN || 'tu-token-secreto-agente',
    
    // Configuración de cámaras IP (RTSP)
    CAMERAS: [
        {
            id: 'cam-001',
            name: 'Cámara Principal',
            rtspUrl: 'rtsp://usuario:password@192.168.1.100:554/stream1',
            enabled: true
        },
        {
            id: 'cam-002',
            name: 'Cámara Secundaria',
            rtspUrl: 'rtsp://usuario:password@192.168.1.101:554/stream1',
            enabled: false // Deshabilitada temporalmente
        }
    ],
    
    // Configuración de FFmpeg
    FFMPEG: {
        // Codec de video: h264, mpeg4, etc.
        videoCodec: 'h264',
        
        // Resolución: 640x480, 1280x720, 1920x1080
        resolution: '1280x720',
        
        // FPS: 15, 24, 30
        fps: 15,
        
        // Bitrate en kbps (ajustar según ancho de banda)
        bitrate: '1000k',
        
        // Codec de audio: aac, mp3, none
        audioCodec: 'aac',
        
        // Formato de salida para WebSocket
        format: 'mpegts'
    },
    
    // Configuración de reconexión
    RECONNECT: {
        enabled: true,
        interval: 5000, // 5 segundos
        maxAttempts: 10
    },
    
    // Configuración de almacenamiento local (opcional)
    LOCAL_STORAGE: {
        enabled: false,
        path: './recordings',
        maxSizeMB: 1024 // 1 GB máximo
    }
};

// ==================================================================
// CLASE DEL AGENTE LOCAL
// ==================================================================

class LocalAgent {
    constructor(config) {
        this.config = config;
        this.ws = null;
        this.cameras = new Map(); // Mapa de procesos FFmpeg por cámara
        this.reconnectAttempts = 0;
        this.isRecording = false;
    }

    /**
     * Inicia el agente local
     */
    async start() {
        console.log('🚀 Iniciando Agente Local...');
        console.log(`📡 Conectando a servidor: ${this.config.SERVER_URL}`);
        
        // Conectar al servidor WebSocket
        this.connectWebSocket();
        
        // Iniciar captura de cámaras habilitadas
        this.config.CAMERAS
            .filter(cam => cam.enabled)
            .forEach(camera => this.startCamera(camera));
    }

    /**
     * Conecta al servidor WebSocket
     */
    connectWebSocket() {
        this.ws = new WebSocket(this.config.SERVER_URL, {
            headers: {
                'Authorization': `Bearer ${this.config.AGENT_TOKEN}`
            }
        });

        this.ws.on('open', () => {
            console.log('✅ Conectado al servidor WebSocket');
            this.reconnectAttempts = 0;
            
            // Enviar mensaje de autenticación
            this.ws.send(JSON.stringify({
                type: 'agent_auth',
                token: this.config.AGENT_TOKEN,
                timestamp: new Date().toISOString()
            }));
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleServerMessage(message);
            } catch (error) {
                console.error('Error al procesar mensaje del servidor:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error('❌ Error en WebSocket:', error.message);
        });

        this.ws.on('close', () => {
            console.log('🔌 Desconectado del servidor WebSocket');
            
            if (this.config.RECONNECT.enabled && 
                this.reconnectAttempts < this.config.RECONNECT.maxAttempts) {
                this.reconnectAttempts++;
                console.log(`🔄 Reintentando conectar (${this.reconnectAttempts}/${this.config.RECONNECT.maxAttempts})...`);
                
                setTimeout(() => {
                    this.connectWebSocket();
                }, this.config.RECONNECT.interval);
            } else {
                console.error('❌ Máximo de intentos de reconexión alcanzado');
            }
        });
    }

    /**
     * Maneja mensajes del servidor
     */
    handleServerMessage(message) {
        switch (message.type) {
            case 'start_recording':
                console.log('📹 Servidor solicitó iniciar grabación');
                this.isRecording = true;
                break;
                
            case 'stop_recording':
                console.log('⏹️ Servidor solicitó detener grabación');
                this.isRecording = false;
                break;
                
            case 'camera_control':
                this.handleCameraControl(message);
                break;
                
            default:
                console.log('📩 Mensaje del servidor:', message.type);
        }
    }

    /**
     * Maneja comandos de control de cámara
     */
    handleCameraControl(message) {
        const { cameraId, action } = message;
        
        switch (action) {
            case 'start':
                const camera = this.config.CAMERAS.find(c => c.id === cameraId);
                if (camera) {
                    this.startCamera(camera);
                }
                break;
                
            case 'stop':
                this.stopCamera(cameraId);
                break;
                
            default:
                console.warn('Acción de cámara desconocida:', action);
        }
    }

    /**
     * Inicia la captura de una cámara específica
     */
    startCamera(camera) {
        if (this.cameras.has(camera.id)) {
            console.warn(`⚠️ Cámara ${camera.id} ya está activa`);
            return;
        }

        console.log(`📹 Iniciando cámara: ${camera.name} (${camera.id})`);
        console.log(`🔗 RTSP URL: ${camera.rtspUrl}`);

        const ffmpegCommand = ffmpeg(camera.rtspUrl)
            .inputOptions([
                '-rtsp_transport', 'tcp', // Usar TCP para mejor estabilidad
                '-stimeout', '5000000'    // Timeout de 5 segundos
            ])
            .videoCodec(this.config.FFMPEG.videoCodec)
            .size(this.config.FFMPEG.resolution)
            .fps(this.config.FFMPEG.fps)
            .videoBitrate(this.config.FFMPEG.bitrate)
            .audioCodec(this.config.FFMPEG.audioCodec)
            .format(this.config.FFMPEG.format)
            .on('start', (commandLine) => {
                console.log(`🎬 FFmpeg iniciado: ${camera.id}`);
                console.log(`   Comando: ${commandLine}`);
            })
            .on('error', (err) => {
                console.error(`❌ Error en FFmpeg (${camera.id}):`, err.message);
                this.stopCamera(camera.id);
                
                // Reintentar después de un delay
                setTimeout(() => {
                    if (camera.enabled) {
                        this.startCamera(camera);
                    }
                }, 10000);
            })
            .on('end', () => {
                console.log(`🏁 FFmpeg terminado: ${camera.id}`);
                this.stopCamera(camera.id);
            });

        // Si el WebSocket está conectado, enviar el stream
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            ffmpegCommand.pipe(this.ws, { end: false });
        }

        // Opcional: Guardar localmente
        if (this.config.LOCAL_STORAGE.enabled) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${camera.id}_${timestamp}.${this.config.FFMPEG.format}`;
            const filepath = path.join(this.config.LOCAL_STORAGE.path, filename);
            
            // Crear directorio si no existe
            if (!fs.existsSync(this.config.LOCAL_STORAGE.path)) {
                fs.mkdirSync(this.config.LOCAL_STORAGE.path, { recursive: true });
            }
            
            ffmpegCommand.save(filepath);
            console.log(`💾 Grabando localmente: ${filepath}`);
        }

        this.cameras.set(camera.id, ffmpegCommand);
    }

    /**
     * Detiene la captura de una cámara específica
     */
    stopCamera(cameraId) {
        const ffmpegCommand = this.cameras.get(cameraId);
        
        if (ffmpegCommand) {
            console.log(`⏹️ Deteniendo cámara: ${cameraId}`);
            ffmpegCommand.kill();
            this.cameras.delete(cameraId);
        }
    }

    /**
     * Detiene todas las cámaras
     */
    stopAllCameras() {
        console.log('⏹️ Deteniendo todas las cámaras...');
        
        this.cameras.forEach((ffmpegCommand, cameraId) => {
            this.stopCamera(cameraId);
        });
    }

    /**
     * Detiene el agente
     */
    stop() {
        console.log('🛑 Deteniendo Agente Local...');
        
        this.stopAllCameras();
        
        if (this.ws) {
            this.ws.close();
        }
        
        console.log('✅ Agente Local detenido');
    }
}

// ==================================================================
// EJECUCIÓN
// ==================================================================

// Crear instancia del agente
const agent = new LocalAgent(CONFIG);

// Iniciar agente
agent.start();

// Manejar señales de terminación
process.on('SIGINT', () => {
    console.log('\n📡 Recibida señal SIGINT');
    agent.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n📡 Recibida señal SIGTERM');
    agent.stop();
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
    agent.stop();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    agent.stop();
    process.exit(1);
});
