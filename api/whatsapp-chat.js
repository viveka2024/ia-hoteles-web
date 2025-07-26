// /api/whatsapp-chat.js

import OpenAI from "openai";
import { getLatestOfferText } from "./offersHelper.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Recibe un objeto { from, text, channel } y devuelve la respuesta del asistente.
 */
export async function generarRespuestaIA({ from, text, channel }) {
  // (Opcional) podrías registrar el mensaje entrante en tu BBDD aquí usando `from` y `channel`

  // 1) Traer la última oferta para contextualizar
  const ofertaTexto = await getLatestOfferText();

  // 2) Crear un nuevo hilo en Threads
  const thread = await openai.beta.threads.create();

  // 3) Inyectar la oferta como mensaje de sistema/assistant
  await openai.beta.threads.messages.create(thread.id, {
    role: "assistant",
    content: `
📢 *PROMOCIÓN ACTUAL* 📢
${ofertaTexto}

→ Al responder al usuario, integra esta promoción donde sea relevante.
    `.trim(),
  });

  // 4) Enviar el texto entrante del usuario
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: text,
  });

  // 5) Ejecutar el run para obtener la respuesta
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: process.env.ASSISTANT_ID,
  });

  // 6) Esperar a que termine
  let status = run.status;
  while (status !== "completed" && status !== "failed" && status !== "cancelled") {
    await new Promise((r) => setTimeout(r, 1000));
    const updated = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    status = updated.status;
  }
  if (status !== "completed") {
    throw new Error(`Asistente falló con estado: ${status}`);
  }

  // 7) Obtener mensajes y aislar la respuesta del assistant
  const messages = await openai.beta.threads.messages.list(thread.id);
  const assistantMsg = messages.data.find((m) => m.role === "assistant");
  const reply = assistantMsg?.content?.[0]?.text?.value;
  if (!reply) {
    throw new Error("El asistente no devolvió texto válido.");
  }

  // 8) Limpiar referencias de citas y devolver texto final
  return reply.replace(/【\d+:\d+†source】/g, "").trim();
}
