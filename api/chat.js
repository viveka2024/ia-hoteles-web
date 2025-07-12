// api/chat.js
import OpenAI from "openai";
import { supabase } from "./supabaseClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💡 Request a /api/chat");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  // Esperamos que el cliente nos envíe también estos campos:
  const { message, id_usuario_hotel, canal, meta } = req.body;

  if (!message || !id_usuario_hotel || !canal || !meta) {
    return res
      .status(400)
      .json({ error: "Faltan campos: message, id_usuario_hotel, canal o meta" });
  }

  try {
    // ─── 1) Creamos el registro de la conversación en Supabase ─────────────────
    const { data: convData, error: convError } = await supabase
      .from("conversaciones_hoteles")
      .insert([{ id_usuario_hotel, canal, meta }])
      .select();
    if (convError) {
      console.error("Error al crear conversación:", convError);
      // No abortamos: seguimos para poder devolver al menos la IA
    }
    const id_conversacion = convData?.[0]?.id_conversacion;

    // ─── 2) Lógica de OpenAI Thread como antes ────────────────────────────────
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    let status = "queued";
    while (!["completed", "failed", "cancelled"].includes(status)) {
      const runStatus = await openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );
      status = runStatus.status;
      if (status !== "completed") {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (status !== "completed") {
      return res
        .status(500)
        .json({ error: `Ejecución con estado: ${status}` });
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find((m) => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value;
    if (!reply) {
      return res
        .status(500)
        .json({ error: "El asistente no devolvió una respuesta válida." });
    }
    const finalReply = reply.replace(/【\d+:\d+†source】/g, "").trim();

    // ─── 3) Actualizamos el registro con el resumen de intenciones ────────────
    // Aquí puedes construir el JSON de resumen que necesites.
    const resumen_interaccion = {      
pregunta: message,
      // añadir aquí otros campos si quieres, p.ej. tipo_cliente, foco, etc.
    };

    if (id_conversacion) {
      const { error: updError } = await supabase
        .from("conversaciones_hoteles")
        .update({ resumen_interaccion })
        .eq("id_conversacion", id_conversacion);
      if (updError) {
        console.error("Error al actualizar resumen:", updError);
      }
    }

    // ─── 4) Devolvemos la respuesta al cliente ─────────────────────────────────
    return res.status(200).json({
      id_conversacion,
      reply: finalReply,
    });
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
