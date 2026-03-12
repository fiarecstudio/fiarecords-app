const API_URL =
window.location.hostname === 'localhost'
? 'http://localhost:5000'
: '';

async function apiFetch(endpoint,options={}){

const res = await fetch(API_URL+endpoint,options);

if(!res.ok){

throw new Error("Error API");

}

return res.json();

}