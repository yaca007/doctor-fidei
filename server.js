import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from 'pdfkit';

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

// ================= PDF (GEMINI 2.0 + PDFKIT) =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer } = req.body;

    // 1. Gemini estructura el contenido (2.0 Flash es el más estable en v1)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    }, { apiVersion: 'v1' });

    const prompt = `Actúa como diseñador editorial católico. Organiza el siguiente contenido en exactamente ${slideCount} secciones para un documento PDF.
    Responde ÚNICAMENTE en formato JSON plano: { "pages": [{ "header": "Título", "body": "Contenido" }] }.
    No incluyas bloques de código markdown.
    Contenido: ${sourceAnswer}`;

    const aiResult = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    });

    let textResponse = aiResult.response.text();
    textResponse = textResponse.replace(/```json|```/g, "").trim();
    const data = JSON.parse(textResponse);

    // 2. Configuración de PDFKit (Sin dependencias de Chrome)
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: title, Author: 'Doctor Fidei' }
    });

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      res.contentType("application/pdf");
      res.send(pdfBuffer);
    });

    // 3. Dibujar el contenido estilo "Doctor Fidei"
    data.pages.forEach((p, index) => {
      if (index > 0) doc.addPage();

      // Fondo Oscuro
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#03050a');

      // Título Dorado
      doc.fillColor('#d4af37')
        .fontSize(24)
        .text(p.header.toUpperCase(), { align: 'center' });

      doc.moveDown(0.5);

      // Línea divisoria
      doc.moveTo(100, doc.y).lineTo(500, doc.y).strokeColor('#d4af37').stroke();

      doc.moveDown(1.5);

      // Cuerpo de texto
      doc.fillColor('#f5f7fb')
        .fontSize(13)
        .text(p.body, {
          align: 'justify',
          lineGap: 4,
          paragraphGap: 10
        });

      // Footer
      doc.fontSize(10)
        .fillColor('#98a4c7')
        .text(`Doctor Fidei — Material de Formación — ${title}`, 50, 750, { align: 'center' });
    });

    doc.end();

  } catch (error) {
    console.error("Error detallado en PDF:", error);
    res.status(500).json({ error: "Error de generación", details: error.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Servidor Doctor Fidei en puerto ${port}`));