const DOMElements = {

loginContainer:document.getElementById('login-container'),
appWrapper:document.getElementById('app-wrapper'),
logoutButton:document.getElementById('logout-button'),
welcomeUser:document.getElementById('welcome-user'),
connectionStatus:document.getElementById('connection-status'),
connectionText:document.getElementById('connection-text')

};

function toggleTheme(isDark){

document.body.classList.toggle('dark-mode',isDark);

localStorage.setItem('theme',isDark?'dark':'light');

}