// /api/whatsapp-chat.js

import OpenAI from "openai";
import { getLatestOfferText } from "./offersHelper.js";  // o la función que uses para recuperar ofertas

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Genera una respuesta de IA para WhatsApp
 * @param {{ from: string, text: string, channel: string }} params
 * @returns {Promise<string>}
 */
export async function generarRespuestaIA({ from, text, channel }) {
  // Recupera contexto si lo necesitas
  const ofertaTexto = await getLatestOfferText();

  // Crea un hilo en Threads
  const thread = await openai.beta.threads.create();

  // Inyecta oferta como primer mensaje de asistente
  await openai.beta.threads.messages.create(thread.id, {
    role: "assistant",
    content: `
📢 *PROMOCIÓN ACTUAL* 📢
${ofertaTexto}

→ Integra esta oferta en tu respuesta siempre que tenga sentido.
    `.trim(),
  });

  // Mensaje del usuario
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: text,
  });

  // Lanza la ejecución del asistente
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: process.env.ASSISTANT_ID,
  });

  // Espera a que termine
  let status = run.status;
  while (status === "queued") {
    await new Promise((r) => setTimeout(r, 500));
    const r2 = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    status = r2.status;
  }
  if (status !== "completed") throw new Error(`Run status: ${status}`);

  // Recupera respuesta
  const msgs = await openai.beta.threads.messages.list(thread.id);
  const assistantMsg = msgs.data.find((m) => m.role === "assistant");
  return assistantMsg?.content?.[0]?.text?.value.replace(/【\d+:\d+†source】/g, "").trim()
    || "Lo siento, no pude generar una respuesta.";
}

