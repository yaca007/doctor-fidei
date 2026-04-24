import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import pptxgen from "pptxgenjs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Falta el mensaje." });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    res.json({ reply: response.output_text || "No se pudo generar respuesta." });
  } catch (error) {
    console.error("Error en /chat:", error);
    res.status(500).json({
      error: "Ocurrió un error al consultar la IA."
    });
  }
});
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

    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";

    const bg = "0B1020";
    const gold = "D4AF37";
    const white = "F5F7FB";
    const muted = "C7D0EA";

    function addDecorativeFrame(slide) {
      slide.background = { color: bg };

      slide.addShape(pptx.ShapeType.rect, {
        x: 0.25,
        y: 0.25,
        w: 12.83,
        h: 7.0,
        line: { color: gold, width: 1.2 },
        fill: { color: bg, transparency: 100 }
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: 0.42,
        y: 0.42,
        w: 12.49,
        h: 6.66,
        line: { color: "6E5A1E", width: 0.7 },
        fill: { color: bg, transparency: 100 }
      });
    }

    function addSlide(slideTitle, bodyText, footer = "Doctor Fidei") {
      const slide = pptx.addSlide();
      addDecorativeFrame(slide);

      slide.addText(slideTitle, {
        x: 0.75,
        y: 0.55,
        w: 11.8,
        h: 0.6,
        fontFace: "Georgia",
        fontSize: 27,
        bold: true,
        color: gold
      });

      slide.addText(bodyText || "", {
        x: 0.85,
        y: 1.35,
        w: 11.6,
        h: 5.2,
        fontFace: "Georgia",
        fontSize: 16,
        color: white,
        breakLine: false,
        fit: "shrink"
      });

      slide.addText(footer, {
        x: 0.85,
        y: 6.82,
        w: 11.6,
        h: 0.25,
        fontSize: 9,
        italic: true,
        color: muted,
        align: "center"
      });
    }

    addSlide(
      title || "Capacitación doctrinal",
      `${sourceQuestion || ""}\n\nEstilo: ${deckStyle || "victoriano-renacentista"}\nNivel: ${audienceLevel || "intermedio"}\nEnfoque: ${deckTone || "catequético"}`
    );

    const sections = (sourceAnswer || "")
      .split(/##\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const maxSlides = Number(slideCount || 8) - 1;

    sections.slice(0, maxSlides).forEach(section => {
      const lines = section.split("\n").filter(Boolean);
      const slideTitle = lines[0]?.replace(/[#*]/g, "").trim() || "Tema doctrinal";
      const body = lines.slice(1).join("\n").replace(/\*\*/g, "").slice(0, 1400);

      addSlide(slideTitle, body);
    });

    if (speakerNotes) {
      addSlide("Notas para el presentador", speakerNotes);
    }

    const buffer = await pptx.write({ outputType: "nodebuffer" });

    res.setHeader("Content-Disposition", `attachment; filename="doctor-fidei-presentacion.pptx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.send(buffer);

  } catch (error) {
    console.error("Error generando presentación:", error);
    res.status(500).json({ error: "Error generando presentación" });
  }
});
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});