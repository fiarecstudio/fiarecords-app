// Prueba mock para validar limpieza y parseo de la respuesta de Gemini

const samples = [
  'Texto introductorio...\n```json\n{\n  "numeroPoliza": "AN 46037175",\n  "cliente": "JESUS FRANCISCO PEÑA ALDAPE",\n  "aseguradora": "CHUBB",\n  "inciso": "1",\n  "tipoSeguro": "Vehicular",\n  "paquete": "AMPLIA",\n  "fechaInicio": "2026-01-01",\n  "fechaVencimiento": "2026-12-31",\n  "primaTotal": 12230.54\n}\n```\nMás texto innecesario...',

  'Respuesta sin fences: Texto previo... { "numeroPoliza":"AN 46037175","cliente":"JESUS FRANCISCO PEÑA ALDAPE","primaTotal":12230.54 } texto final...',

  'Respuesta malformada: \n```\nSome explanation\n{ "numeroPoliza": "AN 46037175", "cliente": "JESUS" }\n``` More',

  'No JSON here: This is plain text without any json example.'
];

function cleanAndParse(responseText) {
  const cleaned = String(responseText).replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  let jsonText = cleaned;
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonText = cleaned.substring(firstBrace, lastBrace + 1);
  }

  let datos = null;
  try {
    if (jsonText && jsonText.trim()) datos = JSON.parse(jsonText);
  } catch (err) {
    console.error('JSON.parse falló:', err.message);
    datos = null;
  }
  return { cleaned, jsonText, datos };
}

for (const s of samples) {
  console.log('\n--- Sample ---');
  console.log('Raw:', s.substring(0, 200));
  const out = cleanAndParse(s);
  console.log('Cleaned Preview:', out.cleaned.substring(0,200));
  console.log('JSON Text:', out.jsonText);
  console.log('Parsed:', out.datos);
}
