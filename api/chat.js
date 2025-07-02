import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permiten solicitudes POST" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "El mensaje es requerido" });
  }

  try {
    // Crear hilo
    const thread = await openai.beta.threads.create();

    // Añadir mensaje del usuario
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    // Ejecutar el asistente
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID,
    });

    // Esperar que termine
    let status = "queued";
    while (status !== "completed" && status !== "failed" && status !== "cancelled") {
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
      if (status !== "completed") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (status !== "completed") {
      return res.status(500).json({ error: `La ejecución terminó con estado: ${status}` });
    }

    // Obtener la respuesta del asistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data?.[0]?.content?.[0]?.text?.value;

    if (!reply) {
      return res.status(500).json({ error: "El asistente no devolvió una respuesta válida." });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("❌ Error en el servidor:", error);

    let errorMsg = "Error inesperado del servidor.";

    if (error.response) {
      try {
        const errorText = await error.response.text();
        errorMsg = errorText;
      } catch (parseErr) {
        errorMsg = "No se pudo leer el mensaje del error de OpenAI.";
      }
    } else if (error.message) {
      errorMsg = error.message;
    }

    return res.status(500).json({ error: errorMsg });
  }
}

