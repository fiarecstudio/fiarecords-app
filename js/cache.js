let localCache = {
artistas:[],
servicios:[],
proyectos:[],
cotizaciones:[],
historial:[],
pagos:[],
usuarios:[],
deudas:[],
trash:{
proyectos:[],
artistas:[],
servicios:[],
usuarios:[]
}
};

async function cargarCache(){

try{

const artistas = await localforage.getItem('cache_artistas');
const servicios = await localforage.getItem('cache_servicios');
const proyectos = await localforage.getItem('cache_proyectos');

if(artistas) localCache.artistas = artistas;
if(servicios) localCache.servicios = servicios;
if(proyectos) localCache.proyectos = proyectos;

console.log("Cache cargado");

}catch(e){

console.error("Error cargando cache",e);

}

}