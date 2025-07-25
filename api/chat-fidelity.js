// File: /api/chat-fidelity.js

import OpenAI from "openai";
import { supabase } from "./supabaseClient.js";
import { getLatestFidelityOfferText } from "./offersFidelityHelper.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💬 Request to /api/chat-fidelity");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  const { message, hotel_id, habitacion, nombre_cliente, canal = "web" } = req.body;
  if (!message || !hotel_id || !habitacion || !nombre_cliente) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  try {
    // 1) Recuperar ofertas actuales
    const ofertasTexto = await getLatestFidelityOfferText();

    // 2) Crear thread y alimentar al asistente
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "assistant",
      content: `
🎁 *OFERTAS EXCLUSIVAS FIDELITY* 🎁
${ofertasTexto}

→ Eres el asistente personalizado para clientes fidelizados. Integra las ofertas arriba cuando sea relevante.
`.trim()
    });
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // 3) Ejecutar asistente
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    let status = run.status;
    while (!["completed", "failed", "cancelled"].includes(status)) {
      await new Promise((r) => setTimeout(r, 1000));
      status = (await openai.beta.threads.runs.retrieve(thread.id, run.id)).status;
    }
    if (status !== "completed") {
      return res.status(500).json({ error: `Ejecución fallida: ${status}` });
    }

    // 4) Obtener respuesta
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value?.trim();
    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió respuesta válida." });
    }

    // 5) **NO insertamos** otra fila: las preguntas ya se acumulan vía conversacion-fidelity.js

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Error en /api/chat-fidelity:", error);
    let msg = error.message || "Error inesperado.";
    if (error.response) {
      try { msg = await error.response.text(); } catch {}
    }
    return res.status(500).json({ error: msg });
  }
}
