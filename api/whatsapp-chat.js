// /api/whatsapp-chat.js

import OpenAI from "openai";
import { getLatestOfferText } from "./offersHelper.js";  // o la función que uses para recuperar ofertas

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Genera una respuesta de IA para WhatsApp usando gpt-3.5-turbo
 * @param {{ from: string, text: string, channel: string }} params
 * @returns {Promise<string>}
 */
export async function generarRespuestaIA({ from, text }) {
  // 1) Recupera contexto (oferta)
  const ofertaTexto = await getLatestOfferText();

  // 2) Llamada a la API de chat
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "assistant",
        content: `
📢 *PROMOCIÓN ACTUAL* 📢
${ofertaTexto}

→ Integra esta oferta en tu respuesta siempre que tenga sentido.
        `.trim(),
      },
      { role: "user", content: text },
    ],
  });

  // 3) Extrae y limpia la respuesta
  const reply = completion.choices?.[0]?.message?.content;
  if (!reply) {
    return "Lo siento, no pude generar una respuesta en este momento.";
  }
  return reply.trim();
}


