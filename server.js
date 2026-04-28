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

REGLAS ESTRICTAS SOBRE CITAS
- NO inventes citas, documentos, números ni enlaces.
- NO inventes URLs.
- Si conoces el documento pero no la URL exacta, cita el documento sin enlace.
- Para el Catecismo, cita el número de párrafo.
- Para Derecho Canónico, cita el canon.
- Para Escritura, cita libro, capítulo y versículo.

Para dirigirte al usuario, dile siempre "Mi Rey", para darle ese toque de cercanía y calidez.
`;

// ================================================================
// CHAT (OPENAI) — con historial, mode y tone
// ================================================================
app.post("/chat", async (req, res) => {
  try {
    const { message, mode, tone, history } = req.body;

    const messages = [{ role: "system", content: SYSTEM_PROMPT }];

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((m) => {
        if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: m.content });
        }
      });
    }

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

// ================================================================
// TEXT-TO-SPEECH (OPENAI) — voz shimmer, español natural
// ================================================================
app.post("/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Texto vacío" });
    }

    // Limpiamos markdown para que no se lea como código
    const cleanText = text
      .replace(/#{1,6}\s?/g, "")       // encabezados
      .replace(/\*\*(.*?)\*\*/g, "$1") // negrita
      .replace(/\*(.*?)\*/g, "$1")     // cursiva
      .replace(/`{1,3}[^`]*`{1,3}/g, "") // código
      .replace(/^\s*[-•]\s/gm, "")    // bullets
      .replace(/\n{3,}/g, "\n\n")     // líneas en blanco extra
      .trim();

    // Máximo 4096 caracteres por límite de OpenAI TTS
    const truncated = cleanText.slice(0, 4096);

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",          // tts-1-hd para mayor calidad (más lento)
      voice: voice || "shimmer", // shimmer: suave y pastoral
      input: truncated,
      speed: 0.95,             // ligeramente más pausado para contenido doctrinal
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error("Error en TTS:", error);
    res.status(500).json({ error: "Error en Text-to-Speech", details: error.message });
  }
});

// ================================================================
// PDF PREMIUM — con estilos: sacro adulto + infantil (acuarela / bíblico)
// ================================================================
app.post("/presentation", async (req, res) => {
  try {
    const { title, slideCount, sourceAnswer, audienceLevel, deckTone, deckStyle } = req.body;

    const isKids = deckStyle === "infantil-acuarela" || deckStyle === "infantil-biblico";

    // Elimina emojis que PDFKit (Helvetica) no puede renderizar
    const stripEmojis = (str) => (str || "").replace(/\p{Emoji}/gu, "").trim();


    // ── PASO 1: Estructurar el JSON con gemini-2.5-flash ──
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let structuringPrompt;

    if (isKids) {
      structuringPrompt = `Eres un catequista creativo especializado en niños de 6 a 12 años.
Divide este contenido doctrinal en exactamente ${slideCount} páginas para un PDF educativo infantil.
Usa lenguaje muy simple, frases cortas, analogías divertidas y ejemplos de la vida cotidiana de un niño.

Para cada página define:
- "header": título corto y simpático (máx 6 palabras, SIN emojis, solo texto)
- "body": contenido en lenguaje de niños (máx 80 palabras, frases cortas, divertido y claro)
- "image_prompt": descripción en inglés para ilustración INFANTIL: colorida, cartoon, tipo libro ilustrado, personajes simpáticos, estilo acuarela suave, fondo blanco o pastel, colores vibrantes, SIN fondo oscuro, SIN realismo, SIN adultos serios

Responde ÚNICAMENTE con JSON plano sin bloques de código ni caracteres extra:
{"pages":[{"header":"...","body":"...","image_prompt":"..."}]}

Contenido doctrinal a adaptar:
${sourceAnswer}`;
    } else {
      structuringPrompt = `Eres un diseñador editorial de arte sacro y catequesis católica.
Divide este contenido doctrinal en exactamente ${slideCount} páginas para un PDF de capacitación.
Nivel de audiencia: ${audienceLevel || "Intermedio"}.
Enfoque: ${deckTone || "Catequético"}.

Para cada página define:
- "header": título corto (máx 8 palabras, en mayúsculas)
- "body": contenido desarrollado (máx 120 palabras, claro y didáctico)
- "image_prompt": descripción visual en inglés para arte sacro (estilo: ${deckStyle || "victoriano-renacentista"}, escena religiosa, iluminación dorada, fondo oscuro místico, símbolos católicos)

Responde ÚNICAMENTE con JSON plano sin bloques de código ni caracteres extra:
{"pages":[{"header":"...","body":"...","image_prompt":"..."}]}

Contenido a dividir:
${sourceAnswer}`;
    }

    const textResult = await textModel.generateContent(structuringPrompt);
    let textResponse = textResult.response.text().replace(/```json|```/g, "").trim();

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch {
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No se pudo parsear el JSON de estructura.");
      }
    }

    // ── PASO 2: Modelo de imagen — Nano Banana 2 ──
    const imageModel = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-image-preview",
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // ── PASO 3: Configuración PDF ──
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: title, Author: "Doctor Fidei" },
    });

    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));

    // ── PASO 4: Generar cada página ──
    for (const [index, p] of data.pages.entries()) {
      if (index > 0) doc.addPage();

      const w = doc.page.width;  // 841pt landscape A4
      const h = doc.page.height; // 595pt landscape A4

      if (isKids) {
        // ════════════════════════════════════
        // DISEÑO INFANTIL — colorido y alegre
        // ════════════════════════════════════
        const bgColor = ["#fff8f0", "#f0f8ff", "#f5fff0", "#fff0f8"][index % 4];
        const accentColor = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f7dc6f", "#a29bfe"][index % 5];
        const darkAccent = ["#c0392b", "#16a085", "#2471a3", "#d4ac0d", "#6c5ce7"][index % 5];

        // Fondo claro y alegre
        doc.rect(0, 0, w, h).fill(bgColor);

        // Borde redondeado decorativo
        doc.roundedRect(12, 12, w - 24, h - 24, 20).lineWidth(4).stroke(accentColor);
        doc.roundedRect(20, 20, w - 40, h - 40, 16).lineWidth(1.5).stroke(accentColor + "88");

        // Decoración: círculos de colores en esquinas (estilo infantil)
        const decorColors = ["#ff6b6b", "#4ecdc4", "#f7dc6f", "#a29bfe"];
        [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]].forEach(([x, y], i) => {
          doc.circle(x, y, 14).fill(decorColors[i % decorColors.length] + "99");
          doc.circle(x, y, 8).fill(decorColors[(i + 2) % decorColors.length]);
        });

        // Separador vertical
        doc.moveTo(400, 40).lineTo(400, h - 40).lineWidth(2).dash(6, { space: 4 }).stroke(accentColor + "99");
        doc.undash();

        // COLUMNA IZQUIERDA: imagen cartoon
        let imgGenerated = false;
        try {
          const kidsImagePrompt = `Children's illustration for Catholic catechesis book, 
          watercolor cartoon style, bright cheerful colors, white or pastel background, 
          simple friendly characters, age 6-12, educational and fun: ${p.image_prompt}. 
          Style: children's book illustration, soft watercolor, NO dark backgrounds, 
          NO realistic style, colorful and joyful, horizontal composition.`;

          const imageResult = await imageModel.generateContent(kidsImagePrompt);
          const parts = imageResult.response.candidates?.[0]?.content?.parts || [];
          const imagePart = parts.find((part) => part.inlineData?.mimeType?.startsWith("image/"));

          if (imagePart?.inlineData?.data) {
            const imgBuffer = Buffer.from(imagePart.inlineData.data, "base64");
            doc.image(imgBuffer, 35, 50, {
              width: 340,
              height: h - 100,
              fit: [340, h - 100],
              align: "center",
              valign: "center",
            });
            imgGenerated = true;
          }
        } catch (imgError) {
          console.warn(`[PDF Kids] Imagen página ${index + 1}: ${imgError.message}`);
        }

        // Fallback infantil: estrella y símbolo colorido
        if (!imgGenerated) {
          const cx = 200, cy = h / 2;
          doc.circle(cx, cy, 80).fill(accentColor + "33");
          doc.circle(cx, cy, 55).fill(accentColor + "66");
          // Cruz simple y amigable
          doc.roundedRect(cx - 8, cy - 45, 16, 90, 8).fill(darkAccent);
          doc.roundedRect(cx - 35, cy - 12, 70, 16, 8).fill(darkAccent);
        }

        // COLUMNA DERECHA: texto infantil
        const textX = 418;
        const textWidth = w - textX - 35;

        // Número de página decorativo
        doc.circle(w - 42, 42, 18).fill(accentColor);
        doc.fillColor("#fff").fontSize(13).font("Helvetica-Bold")
          .text(`${index + 1}`, w - 52, 35, { width: 20, align: "center" });

        // Header con fondo de color
        const headerText = stripEmojis(p.header);
        doc.roundedRect(textX - 8, 48, textWidth + 8, 52, 10).fill(accentColor + "22");
        doc.fillColor(darkAccent).fontSize(20).font("Helvetica-Bold");
        const headerHeight = doc.heightOfString(headerText, { width: textWidth });
        doc.text(headerText, textX, 58, { width: textWidth, align: "left" });

        // Línea decorativa
        const lineY = 58 + Math.max(headerHeight, 30) + 12;
        doc.moveTo(textX, lineY).lineTo(w - 35, lineY).lineWidth(2.5).stroke(accentColor);

        // Body: texto simple para niños
        doc.fillColor("#2c3e50").fontSize(15).font("Helvetica")
          .text(stripEmojis(p.body), textX, lineY + 14, {
            width: textWidth,
            align: "left",
            lineGap: 7,
          });

        // Footer infantil
        doc.roundedRect(0, h - 38, w, 38, 0).fill(accentColor + "33");
        doc.fillColor(darkAccent).fontSize(11).font("Helvetica-Bold")
          .text(`✝ DOCTOR FIDEI — ${title.toUpperCase()}`, 0, h - 26, {
            align: "center",
            width: w,
          });

      } else {
        // ════════════════════════════════════
        // DISEÑO SACRO ADULTO — dorado/oscuro
        // ════════════════════════════════════

        // Fondo y marcos dorados
        doc.rect(0, 0, w, h).fill("#03050a");
        doc.rect(18, 18, w - 36, h - 36).lineWidth(2).stroke("#d4af37");
        doc.rect(26, 26, w - 52, h - 52).lineWidth(0.5).stroke("#d4af37");

        // Separador vertical
        doc.moveTo(420, 50).lineTo(420, h - 50).lineWidth(0.5).stroke("#d4af37");

        // COLUMNA IZQUIERDA: imagen sacra IA
        let imgGenerated = false;
        try {
          const sacredImagePrompt = `Sacred Catholic art, cinematic golden lighting, dark mystical background, 
          high quality illustration, ornate details: ${p.image_prompt}. 
          Style: ${deckStyle || "Victorian Renaissance"} religious painting meets manuscript illumination. 
          Horizontal composition, gold and dark tones.`;

          const imageResult = await imageModel.generateContent(sacredImagePrompt);
          const parts = imageResult.response.candidates?.[0]?.content?.parts || [];
          const imagePart = parts.find((part) => part.inlineData?.mimeType?.startsWith("image/"));

          if (imagePart?.inlineData?.data) {
            const imgBuffer = Buffer.from(imagePart.inlineData.data, "base64");
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
          console.warn(`[PDF Sacro] Imagen página ${index + 1}: ${imgError.message}`);
        }

        // Fallback sacro: cruz con círculos vectoriales dorados
        if (!imgGenerated) {
          const cx = 215, cy = h / 2;
          doc.circle(cx, cy, 110).lineWidth(1.5).stroke("#d4af37");
          doc.circle(cx, cy, 100).lineWidth(0.5).stroke("#d4af37");
          doc.moveTo(cx, cy - 75).lineTo(cx, cy + 75).lineWidth(3).stroke("#d4af37");
          doc.moveTo(cx - 50, cy - 25).lineTo(cx + 50, cy - 25).lineWidth(3).stroke("#d4af37");
          doc.fillColor("#d4af37").fontSize(14).font("Helvetica")
            .text(`${index + 1}`, cx - 8, cy + 120);
        }

        // COLUMNA DERECHA: texto doctrinal
        const textX = 440;
        const textWidth = w - textX - 45;

        // Número de página
        doc.fillColor("#d4af37").fontSize(9).font("Helvetica")
          .text(`${index + 1} / ${data.pages.length}`, w - 80, 38, { width: 50, align: "right" });

        // Header dinámico
        const headerText = p.header.toUpperCase();
        doc.fillColor("#d4af37").fontSize(18).font("Helvetica-Bold");
        const headerHeight = doc.heightOfString(headerText, { width: textWidth });
        doc.text(headerText, textX, 65, { width: textWidth, align: "left" });

        // Línea separadora bajo header (dinámica)
        const lineY = 65 + headerHeight + 8;
        doc.moveTo(textX, lineY).lineTo(w - 45, lineY).lineWidth(1).stroke("#d4af37");

        // Body
        doc.fillColor("#f0f2f8").fontSize(13).font("Helvetica")
          .text(p.body, textX, lineY + 14, {
            width: textWidth,
            align: "justify",
            lineGap: 5,
          });

        // Footer
        doc.moveTo(w * 0.2, h - 48).lineTo(w * 0.8, h - 48).lineWidth(0.5).stroke("#d4af37");
        doc.fillColor("#d4af37").fontSize(10).font("Helvetica-Bold")
          .text(`DOCTOR FIDEI  ·  ${title.toUpperCase()}`, 0, h - 42, {
            align: "center",
            width: w,
          });
      }
    }

    // ── PASO 5: Enviar PDF ──
    await new Promise((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="doctor-fidei.pdf"`);
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
      res.status(500).json({ error: "Fallo en la generación del PDF", details: error.message });
    }
  }
});

// ── Fallback SPA ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`✝ Doctor Fidei corriendo en puerto ${port}`));
