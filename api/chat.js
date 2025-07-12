// api/chat.js
import OpenAI from "openai";
import { supabase } from "./supabaseClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💡 Request to /api/chat");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  // 1) Validación de campos recibidos:
  const { message, id_usuario_hotel, canal, meta } = req.body;
  if (!message || !id_usuario_hotel || !canal || !meta) {
    return res
      .status(400)
      .json({ error: "Faltan campos: message, id_usuario_hotel, canal o meta" });
  }

  try {
    // 2) INSERT inicial de la conversación:
    const { data: convData, error: convError } = await supabase
      .from("conversaciones_hoteles")
      .insert([{ id_usuario_hotel, canal, meta }])
      .select();
    if (convError) {
      console.error("Error al crear conversación:", convError);
    }
    const id_conversacion = convData?.[0]?.id_conversacion;

    // 3) Lógica con OpenAI Threads:
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
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (status !== "completed") {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (status !== "completed") {
      return res.status(500).json({ error: `Ejecución con estado: ${status}` });
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find(m => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value;
    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió una respuesta válida." });
    }
    const finalReply = reply.replace(/【\d+:\d+†source】/g, "").trim();

    // 4) Preparamos el objeto que guardaremos en la BBDD:
    const resumen_interaccion = {
      pregunta: message
    };

    // 5) Devolvemos YA la respuesta al cliente:
    res.status(200).json({
      id_conversacion,
      reply: finalReply,
    });

    // 6) Fire-and-forget: actualizamos en background sin retrasar al usuario
    setImmediate(async () => {
      if (!id_conversacion) return;
      try {
        const { error: updError } = await supabase
          .from("conversaciones_hoteles")
          .update({ resumen_interaccion })
          .eq("id_conversacion", id_conversacion);
        if (updError) console.error("Error al actualizar resumen en background:", updError);
      } catch (e) {
        console.error("Error inesperado en background:", e);
      }
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
