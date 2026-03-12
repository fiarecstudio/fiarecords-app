let horariosOcupadosDelDia = [];

let isInitialized = false;
let proyectoActual = {};
let logoBase64 = null;
let preseleccionArtistaId = null;

const paginationState = {
artistas:{page:1,limit:10,filter:''},
servicios:{page:1,limit:10,filter:''},
usuarios:{page:1,limit:10,filter:''}
};

const trashPagination = {
proyectos:{page:1,limit:10},
artistas:{page:1,limit:10},
servicios:{page:1,limit:10},
usuarios:{page:1,limit:10}
};

const tablePagination = {
historial:{page:1,limit:10},
cotizaciones:{page:1,limit:10},
pagosPendientes:{page:1,limit:10},
pagosHistorial:{page:1,limit:10}
};