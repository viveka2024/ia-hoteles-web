// Archivo: /api/offers.js

import { supabase } from "./supabaseClient.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // Determinar hotel_id según el método
  const hotel_id = req.method === "GET" ? req.query.hotel_id : req.body.hotel_id;
  if (!hotel_id) {
    return res.status(400).json({ error: "Falta hotel_id" });
  }

  // GET: última oferta activa
  if (req.method === "GET") {
    const now = new Date().toISOString();
    const { data: offers, error } = await supabase
      .from("hotel_offers")
      .select("id, text, created_at")
      .eq("hotel_id", hotel_id)
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ offer: offers[0] || null });
  }

  // PATCH: desactivar oferta
  if (req.method === "PATCH") {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Falta id de la oferta" });
    }
    const { data, error } = await supabase
      .from("hotel_offers")
      .update({ active: false })
      .eq("id", id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ offer: data[0] });
  }

  // POST: crear nueva oferta
  if (req.method === "POST") {
    const { text, expires_at } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Falta el campo text" });
    }
    try {
      // 1) Generar embedding
      const embResp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      const vector = embResp.data[0].embedding;

      // 2) Insertar en Supabase
      const { data, error } = await supabase
        .from("hotel_offers")
        .insert([
          { hotel_id, text, embedding: vector, expires_at: expires_at || null }
        ])
        .select();

      if (error) throw error;
      return res.status(201).json({ offer: data[0] });
    } catch (err) {
      console.error("offers.js error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Métodos no permitidos
  res.setHeader("Allow", ["GET", "POST", "PATCH"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
