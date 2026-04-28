import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));
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

REGLAS ESTRICTAS SOBRE CITAS
- NO inventes citas, documentos, números ni enlaces.
- NO inventes URLs.
- Si conoces el documento pero no la URL exacta, cita el documento sin enlace.
- Prioriza siempre documentos oficiales del Vaticano.
- Para el Catecismo, cita el número de párrafo.
- Para Derecho Canónico, cita el canon.
- Para Escritura, cita libro, capítulo y versículo.

Para dirigirte al usuario, dile siempre "Mi Rey", para darle ese toque de cercanía y calidez.
`;

// ================= CHAT (OPENAI) =================
app.post("/chat", async (req, res) => {
  try {
    const { message, mode, tone, history } = req.body;

    // Construimos el historial de conversación si viene del frontend
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((m) => {
        if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: m.content });
        }
      });
    }

    // Agregamos instrucción de modo/tono si viene
    let userContent = message;
    if (mode || tone) {
      userContent = `[Modo: ${mode || "breve"} | Tono: ${tone || "pastoral"}]\n\n${message}`;
    }

    messages.push({ role: "user", content: userContent });

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages,
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Error en chat:", error);
    res.status(500).json({ error: "Error en IA de Chat" });
  }
});

// ================= PDF PREMIUM =================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer, audienceLevel, deckTone, deckStyle } = req.body;

    // ── PASO 1: Estructurar el contenido en JSON con gemini-2.5-flash (TEXTO) ──
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const structuringPrompt = `Eres un diseñador editorial de arte sacro y catequesis católica.
Divide este contenido doctrinal en exactamente ${slideCount} páginas para un PDF de capacitación.
Nivel de audiencia: ${audienceLevel || "Intermedio"}.
Enfoque: ${deckTone || "Catequético"}.

Para cada página define:
- "header": título corto (máx 8 palabras, en mayúsculas)
- "body": contenido desarrollado (máx 120 palabras, claro y didáctico)
- "image_prompt": descripción visual en inglés para generar una imagen de arte sacro (incluye: estilo, escena, símbolos religiosos, iluminación dorada, fondo oscuro místico)

Responde ÚNICAMENTE con JSON plano sin bloques de código ni caracteres extra:
{"pages":[{"header":"...","body":"...","image_prompt":"..."}]}

Contenido a dividir:
${sourceAnswer}`;

    const textResult = await textModel.generateContent(structuringPrompt);
    let textResponse = textResult.response.text().replace(/```json|```/g, "").trim();

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (parseError) {
      // Intento de recuperación: buscar el JSON dentro de la respuesta
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No se pudo parsear el JSON de estructura: " + textResponse.slice(0, 200));
      }
    }

    // ── PASO 2: Modelo de imagen — Nano Banana 2 (gemini-3.1-flash-image-preview) ──
    const imageModel = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-image-preview",
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // ── PASO 3: Configuración PDF Horizontal A4 ──
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: title, Author: "Doctor Fidei" },
    });

    // IMPORTANTE: registrar buffer ANTES del loop para evitar race condition
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));

    // ── PASO 4: Generar cada página ──
    for (const [index, p] of data.pages.entries()) {
      if (index > 0) doc.addPage();

      const w = doc.page.width;   // 841pt en landscape A4
      const h = doc.page.height;  // 595pt en landscape A4

      // — FONDO Y MARCOS DORADOS —
      doc.rect(0, 0, w, h).fill("#03050a");
      doc.rect(18, 18, w - 36, h - 36).lineWidth(2).stroke("#d4af37");
      doc.rect(26, 26, w - 52, h - 52).lineWidth(0.5).stroke("#d4af37");

      // — SEPARADOR VERTICAL entre columna imagen y texto —
      doc.moveTo(420, 50).lineTo(420, h - 50).lineWidth(0.5).stroke("#d4af37");

      // ── COLUMNA IZQUIERDA: imagen generada por IA ──
      let imgGenerated = false;
      try {
        const imagePromptFull = `Sacred Catholic art, cinematic golden lighting, dark mystical background, 
        high quality illustration, ornate details: ${p.image_prompt}. 
        Style: Renaissance religious painting meets manuscript illumination. Horizontal composition.`;

        const imageResult = await imageModel.generateContent(imagePromptFull);
        const parts = imageResult.response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((part) => part.inlineData?.mimeType?.startsWith("image/"));

        if (imagePart?.inlineData?.data) {
          const imgBuffer = Buffer.from(imagePart.inlineData.data, "base64");
          // Imagen centrada en la columna izquierda
          doc.image(imgBuffer, 40, 60, {
            width: 350,
            height: h - 120,
            fit: [350, h - 120],
            align: "center",
            valign: "center",
          });
          imgGenerated = true;
        }
      } catch (imgError) {
        console.warn(`[PDF] Imagen página ${index + 1} falló: ${imgError.message}`);
      }

      // Fallback visual si la imagen falla: ornamento sacro dibujado con vectores
      if (!imgGenerated) {
        const cx = 215; // centro de la columna izquierda
        const cy = h / 2;

        // Círculo exterior dorado
        doc.circle(cx, cy, 110).lineWidth(1.5).stroke("#d4af37");
        doc.circle(cx, cy, 100).lineWidth(0.5).stroke("#d4af37");

        // Cruz central
        doc.moveTo(cx, cy - 75).lineTo(cx, cy + 75).lineWidth(3).stroke("#d4af37");
        doc.moveTo(cx - 50, cy - 25).lineTo(cx + 50, cy - 25).lineWidth(3).stroke("#d4af37");

        // Número de slide decorativo
        doc
          .fillColor("#d4af37")
          .fontSize(14)
          .font("Helvetica")
          .text(`${index + 1}`, cx - 8, cy + 120);
      }

      // ── COLUMNA DERECHA: texto doctrinal ──
      const textX = 440;
      const textWidth = w - textX - 45; // margen derecho de 45pt

      // Número de página decorativo (pequeño, arriba a la derecha)
      doc
        .fillColor("#d4af37")
        .fontSize(9)
        .font("Helvetica")
        .text(`${index + 1} / ${data.pages.length}`, w - 80, 38, { width: 50, align: "right" });

      // Header
      const headerText = p.header.toUpperCase();
      doc.fillColor("#d4af37").fontSize(18).font("Helvetica-Bold");
      const headerHeight = doc.heightOfString(headerText, { width: textWidth });
      doc.text(headerText, textX, 65, { width: textWidth, align: "left" });

      // Línea separadora bajo el header
      const lineY = 65 + headerHeight + 8;
      doc.moveTo(textX, lineY).lineTo(w - 45, lineY).lineWidth(1).stroke("#d4af37");

      // Body text
      const bodyY = lineY + 14;
      doc
        .fillColor("#f0f2f8")
        .fontSize(13)
        .font("Helvetica")
        .text(p.body, textX, bodyY, {
          width: textWidth,
          align: "justify",
          lineGap: 5,
        });

      // Footer
      doc
        .fillColor("#d4af37")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`DOCTOR FIDEI  ·  ${title.toUpperCase()}`, 0, h - 42, {
          align: "center",
          width: w,
        });

      doc
        .moveTo(w * 0.2, h - 48)
        .lineTo(w * 0.8, h - 48)
        .lineWidth(0.5)
        .stroke("#d4af37");
    }

    // ── PASO 5: Finalizar y enviar el PDF ──
    await new Promise((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="doctor-fidei.pdf"`
          );
          res.send(pdfBuffer);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      doc.on("error", reject);
      doc.end();
    });
  } catch (error) {
    console.error("Error Crítico Presentación:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Fallo en la generación del PDF",
        details: error.message,
      });
    }
  }
});

// ── Fallback SPA ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () =>
  console.log(`✝ Doctor Fidei corriendo en puerto ${port}`)
);
