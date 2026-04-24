import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

Me gusta mucho mi REY!
`;

// ================= CHAT =================
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Falta el mensaje." });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ]
    });

    res.json({ reply: response.output_text || "No se pudo generar respuesta." });

  } catch (error) {
    console.error("Error en /chat:", error);
    res.status(500).json({ error: "Error en IA" });
  }
});

// ================= PRESENTATION =================
app.post("/presentation", async (req, res) => {
  try {
    const {
      title,
      slideCount,
      sourceQuestion,
      sourceAnswer,
      audienceLevel,
      deckTone,
      deckStyle,
      speakerNotes
    } = req.body;

    // 🔥 IMPORT DINÁMICO (CLAVE PARA EVITAR 500 EN VERCEL)
    const { default: pptxgen } = await import("pptxgenjs");

    if (!sourceAnswer || !sourceAnswer.trim()) {
      return res.status(400).json({ error: "Falta contenido para generar PPT." });
    }

    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";

    const bg = "0B1020";
    const gold = "D4AF37";
    const white = "F5F7FB";

    function addSlide(title, content) {
      const slide = pptx.addSlide();

      slide.background = { color: bg };

      slide.addText(title, {
        x: 0.7,
        y: 0.5,
        w: 11.5,
        fontSize: 26,
        bold: true,
        color: gold
      });

      slide.addText(content || "", {
        x: 0.7,
        y: 1.3,
        w: 11.5,
        h: 5,
        fontSize: 16,
        color: white,
        fit: "shrink"
      });
    }

    // portada
    addSlide(
      title || "Capacitación doctrinal",
      sourceQuestion || ""
    );

    // contenido
    const sections = sourceAnswer.split("##").filter(s => s.trim());

    sections.slice(0, (slideCount || 8) - 1).forEach(sec => {
      const lines = sec.trim().split("\n");
      const t = lines[0] || "Tema";
      const body = lines.slice(1).join("\n").slice(0, 1200);
      addSlide(t, body);
    });

    if (speakerNotes) {
      addSlide("Notas del presentador", speakerNotes);
    }

    const buffer = await pptx.write({ outputType: "nodebuffer" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="doctor-fidei.pptx"`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    res.send(buffer);

  } catch (error) {
    console.error("ERROR REAL EN /presentation:", error);
    res.status(500).json({ error: "Error generando presentación" });
  }
});

// ================= FRONT =================
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= START =================
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});