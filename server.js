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
app.use(express.json({ limit: "10mb" })); // Aumentamos límite por las imágenes
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

// ================= PDF DE GLORIA (GEMINI 2.5 PRO + NANO BANANA 2) =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer } = req.body;

    // 1. Director de Orquesta: Gemini 2.5 Pro para estructura y prompts de arte
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const structuringPrompt = `Actúa como diseñador editorial de arte sacro. Divide este contenido en exactamente ${slideCount} páginas.
    Para cada página, define un "image_prompt" místico para una IA generativa.
    Responde ÚNICAMENTE en JSON plano: 
    { "pages": [{ "header": "Título", "body": "Contenido", "image_prompt": "descripción visual mística" }] }.
    Contenido: ${sourceAnswer}`;

    const textResult = await textModel.generateContent(structuringPrompt);
    let textResponse = textResult.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(textResponse);

    // 2. Configuración PDF Horizontal Premium
    const doc = new PDFDocument({ 
      size: 'A4', 
      layout: 'landscape', 
      margin: 0,
      info: { Title: title, Author: 'Doctor Fidei' }
    });

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Artista Sacro: Nano Banana 2 (Gemini 3 Flash Image)
    const imageModel = genAI.getGenerativeModel({ model: "gemini-3-flash-image" });

    // 3. Procesamiento de Páginas
    for (const [index, p] of data.pages.entries()) {
      if (index > 0) doc.addPage();
      
      const w = doc.page.width;
      const h = doc.page.height;

      // FONDO NEGRO Y MARCO DORADO DOBLE
      doc.rect(0, 0, w, h).fill('#03050a');
      doc.rect(20, 20, w - 40, h - 40).lineWidth(2).stroke('#d4af37');
      doc.rect(30, 30, w - 60, h - 60).lineWidth(0.5).stroke('#d4af37');

      try {
        // GENERACIÓN DE IMAGEN CON NANO BANANA 2
        const bananaPrompt = `Estética Nano Banana: Arte sacro de alta gama, iluminación cinematográfica, 
        detalles en oro sobre fondo negro místico. Escena: ${p.image_prompt}. 
        Estilo horizontal, 8k, majestuoso.`;

        const imageGenResult = await imageModel.generateContent(bananaPrompt);
        const imageData = imageGenResult.response.candidates[0].content.parts[0].inlineData.data;
        const imgBuffer = Buffer.from(imageData, 'base64');

        // Imagen a la izquierda (Formato Premium)
        doc.image(imgBuffer, 60, 100, { width: 350 });
      } catch (imgError) {
        console.error("Error en Nano Banana 2:", imgError);
        doc.fillColor('#d4af37').fontSize(80).text("✝", 180, 180);
      }

      // TEXTO A LA DERECHA
      doc.fillColor('#d4af37').fontSize(26).text(p.header.toUpperCase(), 450, 100, { 
        width: 320, 
        align: 'left',
        characterSpacing: 1
      });
      
      doc.moveTo(450, 140).lineTo(770, 140).lineWidth(1).stroke('#d4af37');

      doc.fillColor('#f5f7fb').fontSize(16).text(p.body, 450, 170, {
        width: 320,
        align: 'justify',
        lineGap: 6
      });

      // FOOTER DE EXCELENCIA
      doc.fillColor('#d4af37').fontSize(12).text(`DOCTOR FIDEI — ${title.toUpperCase()}`, 0, h - 50, { align: 'center' });
      doc.fillColor('#555').fontSize(9).text(`PÁGINA ${index + 1} DE ${data.pages.length}`, 0, h - 35, { align: 'center' });
    }

    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      res.contentType("application/pdf");
      res.send(pdfBuffer);
    });
    
    doc.end();

  } catch (error) {
    console.error("Fallo Crítico en Excelencia PDF:", error);
    res.status(500).json({ error: "Error en la matriz de diseño", details: error.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Servidor de Élite Doctor Fidei en puerto ${port}`));