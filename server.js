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
app.use(express.json({ limit: "15mb" })); // Límite amplio para buffers de imagen
app.use(express.static(path.join(__dirname, "public")));

// --- CONFIGURACIÓN DE APIS (Usa tu nueva Key de Agent Platform) ---
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

// ================= PDF PREMIUM (GEMINI 2.0 FLASH MULTIMODAL) =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer } = req.body;

    // 1. Modelos: Usamos 2.0 Flash para TODO (Texto e Imagen)
    // Este modelo es el que habilitaste en la Agent Platform.
    const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });

    const structuringPrompt = `Actúa como diseñador editorial de arte sacro. Divide este contenido en exactamente ${slideCount} páginas.
    Para cada página, define un "image_prompt" místico que describa una escena para generar una imagen.
    Responde ÚNICAMENTE en JSON plano: 
    { "pages": [{ "header": "Título", "body": "Contenido", "image_prompt": "descripción visual detallada" }] }.
    Contenido: ${sourceAnswer}`;

    const textResult = await model.generateContent(structuringPrompt);
    let textResponse = textResult.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(textResponse);

    // 2. Configuración PDF Horizontal
    const doc = new PDFDocument({ 
      size: 'A4', 
      layout: 'landscape', 
      margin: 0,
      info: { Title: title, Author: 'Doctor Fidei' }
    });

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // 3. Procesamiento de Páginas con Generación Visual
    for (const [index, p] of data.pages.entries()) {
      if (index > 0) doc.addPage();
      
      const w = doc.page.width;
      const h = doc.page.height;

      // FONDO NEGRO Y MARCOS DORADOS (Estética Olimpia)
      doc.rect(0, 0, w, h).fill('#03050a');
      doc.rect(20, 20, w - 40, h - 40).lineWidth(2).stroke('#d4af37');
      doc.rect(30, 30, w - 60, h - 60).lineWidth(0.5).stroke('#d4af37');

      try {
        // GENERACIÓN DE IMAGEN MULTIMODAL
        const bananaPrompt = `Genera una imagen con Estética Nano Banana: Arte sacro de alta gama, iluminación cinematográfica, detalles en oro sobre fondo negro místico. Escena: ${p.image_prompt}. Estilo horizontal, majestuoso.`;

        const imageGenResult = await model.generateContent(bananaPrompt);
        const candidates = imageGenResult.response.candidates;
        
        // Buscamos la parte de datos binarios en la respuesta multimodal
        const imagePart = candidates[0].content.parts.find(part => part.inlineData);

        if (imagePart) {
          const imgBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
          // Insertamos la imagen a la izquierda
          doc.image(imgBuffer, 60, 100, { width: 350 });
        } else {
          throw new Error("No inlineData found");
        }
      } catch (imgError) {
        console.error("Fallo visual en página " + (index + 1) + ":", imgError.message);
        // Fallback: Símbolo sacro dorado
        doc.fillColor('#d4af37').fontSize(100).text("✝", 190, 160);
      }

      // TEXTO A LA DERECHA (Diseño de Excelencia)
      doc.fillColor('#d4af37').fontSize(26).text(p.header.toUpperCase(), 450, 100, { 
        width: 320, 
        align: 'left'
      });
      
      doc.moveTo(450, 140).lineTo(770, 140).lineWidth(1).stroke('#d4af37');

      doc.fillColor('#f5f7fb').fontSize(16).text(p.body, 450, 170, {
        width: 320,
        align: 'justify',
        lineGap: 6
      });

      // FOOTER
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
    console.error("Error Crítico Presentación:", error);
    res.status(500).json({ error: "Fallo en la generación del PDF", details: error.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Servidor de Élite Doctor Fidei corriendo en puerto ${port}`));