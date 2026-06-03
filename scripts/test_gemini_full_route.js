require('dotenv').config();
const fs = require('fs');
const PDFParse = require('pdf-parse');

(async () => {
  try {
    const buffer = fs.readFileSync('temp-test.pdf');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    await parser.destroy();
    let texto = data.text;
    texto = texto
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\t+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    texto = texto
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200F\uFEFF]/g, '')
      .replace(/['']+/g, "'")
      .replace(/["]+/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();

    const apiKey = process.env.GEMINI_API_KEY;
    const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const promptText = `Eres un experto en pólizas de seguros. Extrae los datos del siguiente texto y devuelve ÚNICAMENTE un JSON válido.\nEstructura: { \"numeroPoliza\": \"\", \"cliente\": \"\", \"aseguradora\": \"\", \"inciso\": \"\", \"tipoSeguro\": \"\", \"paquete\": \"\", \"fechaInicio\": \"YYYY-MM-DD\", \"fechaVencimiento\": \"YYYY-MM-DD\", \"primaTotal\": 0 }\nSi no existe el dato, usa null. NO incluyas markdown.\nTexto: ${texto.substring(0, 8000)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    console.log('status', res.status);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
