// Archivo: /api/offers.js

import { supabase } from "./supabaseClient.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // Solo permitimos POST
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { hotel_id, text, expires_at } = req.body;
  if (!hotel_id || !text) {
    return res
      .status(400)
      .json({ error: "Faltan parámetros: hotel_id y/o text" });
  }

  try {
    // 1) Generar embedding con OpenAI
    const embResp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    const vector = embResp.data[0].embedding;

    // 2) Insertar la oferta en Supabase
    const { data, error } = await supabase
      .from("hotel_offers")
      .insert([
        {
          hotel_id,
          text,
          embedding: vector,
          // expires_at puede ser undefined si no se pasó
          expires_at: expires_at || null,
        },
      ])
      .select(); // devuelve la fila insertada

    if (error) {
      console.error("Error guardando la oferta:", error);
      throw error;
    }

    return res.status(201).json({ offer: data[0] });
  } catch (err) {
    console.error("offers.js error:", err);
    return res.status(500).json({ error: err.message });
  }
}
