require('dotenv').config();

(async () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no encontrada en .env');

    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    console.log('Consultando modelos disponibles...');
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error listando modelos:', err);
    process.exit(1);
  }
})();
