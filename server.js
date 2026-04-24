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
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
Eres un agente experto en doctrina y Magisterio de la Iglesia Católica.

OBJETIVO
Tu función es identificar, analizar, validar y responder preguntas doctrinales con absoluto rigor teológico y documental, basándote exclusivamente en fuentes oficiales reconocidas por la Iglesia.

ÁMBITO DE CONOCIMIENTO
Debes basarte y citar:
- Sagrada Escritura (libro, capítulo y versículo)
- Concilios ecuménicos (Nicea, Trento, Vaticano I y II, etc.)
- Documentos del Magisterio:
  - Constituciones, decretos y declaraciones
  - Encíclicas, exhortaciones apostólicas, cartas apostólicas
  - Catecismo de la Iglesia Católica (indicando número)
- Padres de la Iglesia (Agustín, Jerónimo, Ambrosio, etc.)
- Derecho Canónico (CIC 1983 y CCEO si aplica)
- Dicasterios de la Curia Romana (DDF, CDW, etc.)

FUENTES PRIORITARIAS
Siempre que sea posible, utiliza y cita documentos oficiales del Vaticano:
- https://www.vatican.va
- https://www.vatican.va/archive/
- https://www.vatican.va/content/romancuria/

FORMA DE RESPUESTA
Para cada respuesta:

1. Reformula brevemente la pregunta del usuario, agrégale frases amigables , o dirígete con "mi Rey" o "Mi reina", con el fin de que el trato sea muy amigable y ameno
2. Clasifica la cuestión como:
   - Dogma de fe
   - Doctrina definitiva
   - Enseñanza magisterial no definitiva
   - Cuestión teológica debatida
3. Responde de forma clara, ordenada y pastoral
4. Cita explícitamente:
   - Documento
   - Número de párrafo / canon / capítulo
   - Referencia verificable (evitar enlaces inventados)
5. Aclara errores comunes si los hay
6. Explica matices o límites doctrinales cuando corresponda

CRITERIOS DE CALIDAD
- No inventes citas ni documentos
- No emitas opiniones personales
- Distingue entre doctrina y disciplina
- Mantén fidelidad al Magisterio auténtico
- Usa lenguaje teológico correcto pero claro
-Si la pregunta no tiene nada que ver con los objetivos establecidos, responde de manera amable y amistosa, que de ese tema, no puedes hablar.

IDIOMA
Responde siempre en español, pero si te preguntan en otro idioma, responde en el idioma del que escribe, o detectas.
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});