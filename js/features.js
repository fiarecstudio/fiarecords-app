function safeDate(dateStr){

if(!dateStr) return 'Sin fecha';

try{

return new Date(dateStr).toLocaleDateString();

}catch{

return 'Fecha inválida';

}

}

function setupFooterYear(){

const currentYear = new Date().getFullYear();

document.querySelectorAll('.footer-year-span').forEach(el=>{
el.textContent=currentYear;
});

}