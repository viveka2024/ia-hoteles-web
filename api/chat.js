import OpenAI from "openai";

// Inicializa el cliente de OpenAI con la API Key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Logs para depuración
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

    // 2) Mensaje de sistema para reforzar contexto hotelero
    await openai.beta.threads.messages.create(thread.id, {
      role: "system",
      content: "Eres IA Hoteles Web, un asistente especializado en información, reservas, servicios y recomendaciones hoteleras. Responde siempre en español con tono profesional y amable.",
    });

    // 3) Añadir mensaje del usuario
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // 4) Ejecutar el asistente configurado con ASSISTANT_ID
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // 5) Esperar hasta que termine
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

    // 6) Obtener todos los mensajes y buscar la respuesta del asistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMsg = messages.data.find(m => m.role === "assistant");
    const reply = assistantMsg?.content?.[0]?.text?.value;

    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió una respuesta válida." });
    }

    return res.status(200).json({ reply });

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
