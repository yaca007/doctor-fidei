import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
//import chromium from "@sparticuz/chromium-min";
//import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";
import html_to_pdf from "html-pdf-node";

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

// ================= CHAT (OPENAI) =================
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
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

// ================= PDF (GEMINI 3.0 + HTML-PDF-NODE) =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer } = req.body;

    // 1. Gemini estructura el contenido (Sin el campo conflictivo)
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
    }, { apiVersion: 'v1beta' });

    // Reforzamos el prompt para que el JSON venga limpio
    const prompt = `Actúa como diseñador editorial católico. Organiza el siguiente contenido en exactamente ${slideCount} secciones para un documento PDF.
    Responde ÚNICAMENTE en formato JSON plano: { "pages": [{ "header": "Título", "body": "Contenido" }] }.
    No incluyas explicaciones ni bloques de código markdown.
    Contenido: ${sourceAnswer}`;

    const aiResult = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
      // ELIMINAMOS generationConfig para que no de Error 400
    });

    // Limpieza de seguridad por si la IA usa bloques de código
    let textResponse = aiResult.response.text();
    textResponse = textResponse.replace(/```json|```/g, "").trim();
    const data = JSON.parse(textResponse);

    // 2. Plantilla HTML con estilo Doctor Fidei
    const htmlContent = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            background: #03050a; 
            color: #f5f7fb; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 0;
          }
          .page { 
            width: 210mm; 
            height: 297mm; 
            padding: 25mm; 
            border: 15px solid #d4af37; 
            box-sizing: border-box; 
            position: relative;
            page-break-after: always;
            display: flex;
            flex-direction: column;
          }
          h1 { 
            color: #d4af37; 
            text-align: center; 
            font-size: 2.2rem; 
            border-bottom: 2px solid #d4af37; 
            padding-bottom: 10px; 
            margin-top: 0;
          }
          .content { 
            font-size: 1.1rem; 
            line-height: 1.6; 
            text-align: justify; 
            margin-top: 20px; 
            flex-grow: 1;
          }
          .footer { 
            text-align: center; 
            color: #98a4c7; 
            border-top: 1px solid rgba(212,175,55,0.2); 
            padding-top: 10px;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        ${data.pages.map(p => `
          <div class="page">
            <h1>${p.header}</h1>
            <div class="content">${p.body.replace(/\n/g, '<br>')}</div>
            <div class="footer">Doctor Fidei — ${title}</div>
          </div>
        `).join('')}
      </body>
    </html>`;

    // 3. Generar PDF usando html-pdf-node (Sin navegador externo)
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };

    const file = { content: htmlContent };

    const pdfBuffer = await html_to_pdf.generatePdf(file, options);

    // 4. Enviar respuesta
    res.contentType("application/pdf");
    res.send(pdfBuffer);

  } catch (error) {
    console.error("Error detallado en PDF:", error);
    res.status(500).json({
      error: "Error al generar el documento",
      details: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Servidor Híbrido corriendo en puerto ${port}`));