/**
 * PASO 5: CAPA DE CONTROLADORES - Proyectos
 * ===========================================
 * Controladores delgados que solo:
 * 1. Reciben req y extraen datos (body, params, user, headers)
 * 2. Llaman al servicio correspondiente
 * 3. Devuelven la respuesta JSON
 * 4. Capturan errores y llaman a next(error) para el errorHandler global
 */

const proyectoService = require('../services/proyectoService');

class ProyectoController {
    
    /**
     * GET /disponibilidad - Verificar slots disponibles
     */
    async verificarDisponibilidad(req, res, next) {
        try {
            const { fecha } = req.query;
            const slots = await proyectoService.verificarDisponibilidad(fecha, req.tenantFilter);
            res.json(slots);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET / - Listar todos los proyectos
     */
    async listar(req, res, next) {
        try {
            const proyectos = await proyectoService.listarProyectos(req.user, req.tenantFilter);
            res.json(proyectos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /agenda - Listar eventos para calendario
     */
    async listarAgenda(req, res, next) {
        try {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            const eventos = await proyectoService.listarAgenda(req.user, req.tenantFilter, headerEmpresaId);
            res.json(eventos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /cotizaciones - Listar cotizaciones
     */
    async listarCotizaciones(req, res, next) {
        try {
            const cotizaciones = await proyectoService.listarCotizaciones(req.user, req.tenantFilter);
            res.json(cotizaciones);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /completos - Listar proyectos completos/cancelados
     */
    async listarCompletos(req, res, next) {
        try {
            const completos = await proyectoService.listarCompletos(req.tenantFilter);
            res.json(completos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /pagos/todos - Listar todos los pagos
     */
    async listarTodosPagos(req, res, next) {
        try {
            const pagos = await proyectoService.listarTodosPagos(req.tenantFilter);
            res.json(pagos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /por-artista/:id - Proyectos de un artista específico
     */
    async listarPorArtista(req, res, next) {
        try {
            const { id } = req.params;
            const proyectos = await proyectoService.listarPorArtista(req.user, req.tenantFilter, id);
            res.json(proyectos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /:id - Obtener un proyecto específico
     */
    async obtener(req, res, next) {
        try {
            const { id } = req.params;
            const proyecto = await proyectoService.obtenerProyecto(req.user, req.tenantFilter, id);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * POST / - Crear nuevo proyecto/cotización
     */
    async crear(req, res, next) {
        try {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            const nuevoProyecto = await proyectoService.crearProyecto(req.user, headerEmpresaId, req.body);
            res.status(201).json(nuevoProyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * POST /directo - Crear proyecto directo (pasado)
     */
    async crearDirecto(req, res, next) {
        try {
            const headerEmpresaId = req.headers['x-empresa-id'] || req.headers['X-Empresa-Id'];
            const nuevoProyecto = await proyectoService.crearProyectoDirecto(req.user, headerEmpresaId, req.body);
            res.status(201).json(nuevoProyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id - Actualizar proyecto general
     */
    async actualizar(req, res, next) {
        try {
            const { id } = req.params;
            const proyecto = await proyectoService.actualizarProyecto(req.user, req.tenantFilter, id, req.body);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id/nombre - Actualizar nombre del proyecto
     */
    async actualizarNombre(req, res, next) {
        try {
            const { id } = req.params;
            const { nombreProyecto } = req.body;
            const proyecto = await proyectoService.actualizarNombre(req.user, req.tenantFilter, id, nombreProyecto);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id/fecha - Actualizar fecha del proyecto
     */
    async actualizarFecha(req, res, next) {
        try {
            const { id } = req.params;
            const { fecha } = req.body;
            const proyecto = await proyectoService.actualizarFecha(req.user, req.tenantFilter, id, fecha);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id/estatus - Actualizar estatus del proyecto
     */
    async actualizarEstatus(req, res, next) {
        try {
            const { id } = req.params;
            const { estatus } = req.body;
            const proyecto = await proyectoService.actualizarEstatus(req.user, req.tenantFilter, id, estatus);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /:id/proceso - Actualizar proceso del proyecto
     */
    async actualizarProceso(req, res, next) {
        try {
            const { id } = req.params;
            const { proceso } = req.body;
            const proyecto = await proyectoService.actualizarProceso(req.user, req.tenantFilter, id, proceso);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * DELETE /:id - Eliminar proyecto (soft delete)
     */
    async eliminar(req, res, next) {
        try {
            const { id } = req.params;
            await proyectoService.eliminarProyecto(req.user, req.tenantFilter, id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * GET /papelera/all - Listar proyectos eliminados
     */
    async listarPapelera(req, res, next) {
        try {
            const proyectos = await proyectoService.listarPapelera(req.user, req.tenantFilter);
            res.json(proyectos);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id/restaurar - Restaurar proyecto eliminado
     */
    async restaurar(req, res, next) {
        try {
            const { id } = req.params;
            await proyectoService.restaurarProyecto(req.user, req.tenantFilter, id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * DELETE /:id/permanente - Eliminar proyecto permanentemente
     */
    async eliminarPermanente(req, res, next) {
        try {
            const { id } = req.params;
            await proyectoService.eliminarPermanente(req.user, req.tenantFilter, id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * DELETE /papelera/vaciar - Vaciar papelera
     */
    async vaciarPapelera(req, res, next) {
        try {
            await proyectoService.vaciarPapelera(req.user);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * POST /:id/pagos - Agregar pago
     */
    async agregarPago(req, res, next) {
        try {
            const { id } = req.params;
            const proyecto = await proyectoService.agregarPago(req.user, req.tenantFilter, id, req.body);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * DELETE /:id/pagos/:pagoId - Eliminar pago
     */
    async eliminarPago(req, res, next) {
        try {
            const { id, pagoId } = req.params;
            const proyecto = await proyectoService.eliminarPago(req.user, req.tenantFilter, id, pagoId);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * POST /:id/enviar-recibo - Enviar recibo por correo
     */
    async enviarRecibo(req, res, next) {
        try {
            const { id } = req.params;
            const resultado = await proyectoService.enviarRecibo(req.user, id, req.body);
            res.json(resultado);
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * PUT /:id/enlace-entrega - Guardar enlace de Drive
     */
    async guardarEnlaceEntrega(req, res, next) {
        try {
            const { id } = req.params;
            const proyecto = await proyectoService.guardarEnlaceEntrega(req.user, req.tenantFilter, id, req.body);
            res.json(proyecto);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ProyectoController();
