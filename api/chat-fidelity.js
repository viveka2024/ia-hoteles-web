// api/chat-fidelity.js

import OpenAI from "openai";
import { supabase } from "./supabaseClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💬 Request to /api/chat-fidelity");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  const { message, hotel_id, habitacion, nombre_cliente, canal = "web" } = req.body;
  if (!message || !hotel_id) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  try {
    // 🔁 Crear un nuevo thread en OpenAI
    const thread = await openai.beta.threads.create();

    // 1️⃣ Mensaje inicial de sistema (si quieres inyectar instrucciones)
    await openai.beta.threads.messages.create(thread.id, {
      role: "assistant",
      content: `
Eres un asistente IA especializado en fidelización de huéspedes de hotel.
Responde de forma amable y útil, ofreciendo sugerencias del hotel.
Resume internamente lo que el cliente busca para propósitos analíticos.
`.trim()
    });

    // 2️⃣ Mensaje real del cliente
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // ▶️ Lanzar el run del asistente específico para Fidelity
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID_FIDELITY, // ⚠️ este será tu nuevo asistente de fidelización
    });

    let status = "queued";
    while (!["completed", "failed", "cancelled"].includes(status)) {
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (status !== "completed") {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (status !== "completed") {
      return res.status(500).json({ error: `Ejecución fallida. Estado: ${status}` });
    }

    // 📩 Obtener la respuesta final del asistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value?.trim();

    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió respuesta válida." });
    }

    // 🧾 Guardar la interacción en Supabase
    const resumen_interaccion = { preguntas: [message] };
    const meta = {
      modelo: "OpenAI Assistant (Thread)",
      assistant_id: process.env.ASSISTANT_ID_FIDELITY
    };

    const { error: insertError } = await supabase
      .from("interacciones_fidelity")
      .insert([{
        hotel_id,
        habitacion,
        nombre_cliente,
        canal,
        resumen_interaccion,
        meta
      }]);

    if (insertError) {
      console.error("❌ Error al guardar en Supabase:", insertError.message);
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Error en /api/chat-fidelity:", error);
    let errorMsg = "Error inesperado del servidor.";
    if (error.response) {
      try {
        errorMsg = await error.response.text();
      } catch {}
    } else if (error.message) {
      errorMsg = error.message;
    }
    return res.status(500).json({ error: errorMsg });
  }
}
