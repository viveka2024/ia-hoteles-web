// api/chat.js

import { supabase } from './supabaseClient.js'
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💡 Request to /api/chat");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  // Validar mensaje
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "El campo 'message' es requerido" });
  }

  try {
    // ─── Recuperar la última oferta activa ──────────────────────────────────
    const now = new Date().toISOString();
    const { data: offers = [], error: offersError } = await supabase
      .from("hotel_offers")
      .select("text")
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (offersError) console.warn("Error cargando oferta:", offersError);

    const ofertaTexto = offers.length
      ? `– ${offers[0].text}`
      : "– No hay ofertas activas en este momento.";

    // ─── Lógica con OpenAI Threads, inyectando la oferta como mensaje de usuario ───
    const thread = await openai.beta.threads.create();

    // 1) Mensaje de usuario con la oferta
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `PROMOCIONES ACTUALES:\n${ofertaTexto}`
    });

    // 2) Mensaje real del cliente
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // ─── Ejecutar el run del asistente ───────────────────────────────────────
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
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
      return res.status(500).json({ error: `Ejecución con estado: ${status}` });
    }

    // ─── Recoger la respuesta del asistente ──────────────────────────────────
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value;
    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió una respuesta válida." });
    }
    const finalReply = reply.replace(/【\d+:\d+†source】/g, "").trim();

    // ─── Devolvemos la respuesta al cliente ────────────────────────────────
    return res.status(200).json({ reply: finalReply });

  } catch (error) {
    console.error("❌ Error en /api/chat:", error);
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

