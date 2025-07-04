import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log("💡 Request a /api/chat");
  console.log("🔑 Assistant ID usado:", process.env.ASSISTANT_ID);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "El mensaje es requerido" });
  }

  try {
    // 1) Crear hilo de conversación
    const thread = await openai.beta.threads.create();

    // 2) Añadir mensaje del usuario
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // 3) Ejecutar el asistente configurado con ASSISTANT_ID
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // 4) Esperar hasta que termine
    let status = "queued";
    while (status !== "completed" && status !== "failed" && status !== "cancelled") {
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (status !== "completed") {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (status !== "completed") {
      return res.status(500).json({ error: `La ejecución terminó con estado: ${status}` });
    }

    // 5) Obtener todos los mensajes y buscar la respuesta del asistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find(m => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value;

    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió una respuesta válida." });
    }

    // 6) Eliminar marcadores tipo 【n:m†source】
    let finalReply = reply.replace(/【\d+:\d+†source】/g, "").trim();

    // 7) Si detectamos intención de reserva y no hay ya un wa.me, lo añadimos en Markdown
    const reservaRegex = /\b(reserva|reservar|disponibilidad|quiero reservar|reservaciones?|pasar con reservas)\b/i;
    const hasWA = /wa\.me\/\d+/.test(finalReply);
    if (reservaRegex.test(finalReply) && !hasWA) {
      finalReply += '\n\n👉 Para cualquier gestión relacionada con reservas, por favor contacta directamente con nuestro personal de reservas aquí: [Personal de Reservas](https://wa.me/34678777204)';
    }

    return res.status(200).json({ reply: finalReply });

  } catch (error) {
    console.error("❌ Error en el servidor:", error);
    let errorMsg = "Error inesperado del servidor.";

    if (error.response) {
      try {
        errorMsg = await error.response.text();
      } catch {
        errorMsg = "No se pudo leer el mensaje de error de OpenAI.";
      }
    } else if (error.message) {
      errorMsg = error.message;
    }

    return res.status(500).json({ error: errorMsg });
  }
}

