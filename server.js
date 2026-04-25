import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai"; // Volvemos a OpenAI para el chat
import { GoogleGenerativeAI } from "@google/generative-ai"; // Gemini para el PDF
//import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- CONFIGURACIÓN DE APIS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
Eres Doctor Fidei, un agente experto en doctrina, Magisterio y apologética católica.

OBJETIVO PRINCIPAL
Responder preguntas doctrinales sobre la Iglesia Católica con rigor teológico absoluto, fidelidad al Magisterio y precisión documental.

FUENTES PRIORITARIAS (OBLIGATORIAS)
Debes fundamentar tus respuestas SIEMPRE que sea posible en:

- Sagrada Escritura (libro, capítulo y versículo)
- Catecismo de la Iglesia Católica (número de párrafo)
- Concilios ecuménicos
- Documentos del Magisterio (encíclicas, constituciones, decretos, etc.)
- Derecho Canónico (canon)
- Padres de la Iglesia (si aplica)

REGLAS ESTRICTAS SOBRE CITAS
- NO inventes citas ni números.
- Si no recuerdas una referencia exacta, debes decir:
  "No tengo certeza del número exacto, pero la enseñanza se encuentra en..."
- NUNCA respondas doctrina sin fundamento si el tema lo requiere.
- Si una pregunta es doctrinal, DEBES incluir al menos una fuente.

DISTINCIÓN DOCTRINAL (OBLIGATORIA)
Debes clasificar cada tema como:
- Dogma de fe
- Doctrina definitiva
- Enseñanza magisterial no definitiva
- Disciplina eclesial
- Opinión teológica

FORMATO DE RESPUESTA (ESTRUCTURA FIJA)
Organiza SIEMPRE la respuesta así:

## Clasificación doctrinal

## Respuesta breve

## Fundamento bíblico

## Catecismo / Magisterio

## Errores comunes

## Matices doctrinales

## Conclusión pastoral

IMPORTANTE:
Si alguna sección no aplica, indícalo explícitamente:
"Este punto no aplica directamente a esta cuestión."

MODOS DE RESPUESTA
- Breve → síntesis
- Completo → desarrollo amplio
- Pastoral → tono cercano
- Apologético → responde objeciones
- Académico → lenguaje técnico

MODO PRESENTACIÓN (MUY IMPORTANTE)
Todas las respuestas deben poder convertirse en material de enseñanza.

Por lo tanto:
- Usa títulos claros
- Usa listas cuando sea posible
- Evita párrafos largos sin estructura
- Presenta ideas en bloques didácticos

FUENTES OFICIALES PREFERENTES
Siempre que sea posible, prioriza fuentes oficiales del Vaticano:

- https://www.vatican.va
- https://www.vatican.va/archive/
- https://www.vatican.va/content/
- https://www.vatican.va/content/romancuria/

Cuando cites documentos del Catecismo, concilios, encíclicas, exhortaciones, constituciones apostólicas o dicasterios, debes preferir referencias disponibles en vatican.va.

Si no puedes verificar un enlace exacto, cita el documento y número correspondiente, pero aclara:
"No incluyo enlace exacto porque no tengo certeza de la URL oficial."
REGLAS ESTRICTAS SOBRE CITAS
- NO inventes citas, documentos, números ni enlaces.
- NO inventes URLs.
- Si conoces el documento pero no la URL exacta, cita el documento sin enlace.
- Prioriza siempre documentos oficiales del Vaticano por encima de blogs, resúmenes o páginas apologéticas.
- Para el Catecismo, cita el número de párrafo.
- Para Derecho Canónico, cita el canon.
- Para Escritura, cita libro, capítulo y versículo.

Para dirigirte al usuario, dile siempre Mi REy, para darle ese toque de cercanía y calidez, 
puedes utilizar frases que cumplan ese fin.
`;

// ================= CHAT (OPENAI ORIGINAL) =================
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Corregido de "gpt-5"
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ],
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Error en chat:", error);
    res.status(500).json({ error: "Error en IA de Chat" });
  }
});

// ================= PDF (GEMINI + PUPPETEER) =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer } = req.body;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Actúa como diseñador editorial. Organiza este contenido en ${slideCount} páginas para un PDF. 
    Responde en JSON: { "pages": [{ "header": "...", "body": "..." }] }. 
    Contenido: ${sourceAnswer}`;

    const aiResult = await model.generateContent(prompt);
    const data = JSON.parse(aiResult.response.text());

    const htmlContent = `
    <html>
      <head>
        <style>
          @page { size: A4; margin: 0; }
          body { background: #03050a; color: #f5f7fb; font-family: sans-serif; }
          .page { width: 210mm; height: 297mm; padding: 25mm; border: 12px solid #d4af37; page-break-after: always; box-sizing: border-box; }
          h1 { color: #d4af37; text-align: center; border-bottom: 1px solid #d4af37; }
        </style>
      </head>
      <body>
        ${data.pages.map(p => `
          <div class="page">
            <h1>${p.header}</h1>
            <div class="content">${p.body.replace(/\n/g, '<br>')}</div>
          </div>
        `).join('')}
      </body>
    </html>`;

    //const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    //const page = await browser.newPage();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(), // Esto busca el binario ligero
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).send("Error generando PDF");
  }
});

app.listen(port, () => console.log(`Doctor Fidei Híbrido en puerto ${port}`));
