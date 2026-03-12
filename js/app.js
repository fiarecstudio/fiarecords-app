const app = {

async init(){

await cargarCache();

setupFooterYear();

console.log("App iniciada");

}

};

document.addEventListener("DOMContentLoaded",()=>{

app.init();

});