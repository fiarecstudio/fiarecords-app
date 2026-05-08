/**
 * logger.js
 * Sistema de logging centralizado para la aplicación
 * 
 * En producción solo se muestran errores críticos.
 * En desarrollo se muestran todos los niveles.
 */

(function() {
    'use strict';

    const Logger = {
        // Niveles de log
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        
        // Detectar modo producción por hostname o variable
        get isProduction() {
            return window.location.hostname !== 'localhost' && 
                   window.location.hostname !== '127.0.0.1';
        },
        
        // Nivel actual (ERROR en producción, DEBUG en desarrollo)
        get level() {
            return this.isProduction ? this.ERROR : this.DEBUG;
        },
        
        /**
         * Log genérico con nivel
         */
        log(level, prefix, ...args) {
            if (level < this.level) return;
            
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            const label = ['DBG', 'INF', 'WRN', 'ERR'][level] || 'LOG';
            
            if (args.length === 1 && typeof args[0] === 'string') {
                console.log(`[${label}] [${prefix}] ${args[0]}`);
            } else {
                console.log(`[${label}] [${prefix}]`, ...args);
            }
        },
        
        // Métodos de conveniencia
        debug(prefix, ...args) { this.log(this.DEBUG, prefix, ...args); },
        info(prefix, ...args) { this.log(this.INFO, prefix, ...args); },
        warn(prefix, ...args) { this.log(this.WARN, prefix, ...args); },
        error(prefix, ...args) { this.log(this.ERROR, prefix, ...args); }
    };

    // Exportar globalmente
    window.Logger = Logger;
})();
