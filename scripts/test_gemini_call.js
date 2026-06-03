require('dotenv').config();

(async () => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no encontrada en .env');

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

    // Texto de prueba representativo de una póliza
    const sampleText = `Propietario/Contratante: JESUS FRANCISCO PEÑA ALDAPE\nPoliza: AN 46037175\nVigencia: 01/ene/2026 al 31/dic/2026\nPrima total: $12,230.54`;

    const promptText = `Eres un experto en pólizas de seguros. Extrae los datos del siguiente texto y devuelve ÚNICAMENTE un JSON válido.\nEstructura: { "numeroPoliza": "", "cliente": "", "aseguradora": "", "inciso": "", "tipoSeguro": "", "paquete": "", "fechaInicio": "YYYY-MM-DD", "fechaVencimiento": "YYYY-MM-DD", "primaTotal": 0 }\nSi no existe el dato, usa null. NO incluyas markdown.\nTexto: ${sampleText}`;

    console.log('Enviando petición de prueba a Gemini...');

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    const responseText = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

    console.log('Raw response:', responseText);
    console.log('Cleaned:', cleaned);

    const parsed = cleaned ? JSON.parse(cleaned) : null;
    console.log('Parsed JSON:', parsed);
  } catch (err) {
    console.error('Error en prueba Gemini:', err);
    process.exit(1);
  }
})();
