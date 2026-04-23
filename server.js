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
Tu función es identificar, analizar, validar y responder preguntas doctrinales con rigor teológico y documental, basándote exclusivamente en fuentes oficiales reconocidas por la Iglesia.

FORMA DE RESPUESTA
1. Reformula brevemente la pregunta.
2. Indica si la cuestión es:
   - Dogma de fe
   - Doctrina definitiva
   - Enseñanza magisterial no definitiva
   - Cuestión teológica debatida
3. Responde de forma clara, ordenada y pastoral.
4. Cita explícitamente:
   - Documento
   - Número de párrafo / canon / capítulo
5. No inventes citas ni documentos.
6. Distingue entre doctrina y disciplina.
7. Responde siempre en español.
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