// /api/offersFidelity.js
import { supabase } from './supabaseClient.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    const hotel_id = req.method === 'GET'
      ? req.query.hotel_id
      : req.body.hotel_id;

    if (!hotel_id) {
      return res.status(400).json({ error: 'Falta hotel_id' });
    }

    // GET: última oferta activa de Fidelity
    if (req.method === 'GET') {
      const now = new Date().toISOString();
      const filter = 'expires_at.is.null,expires_at.gt.' + now;

      const { data: offers, error } = await supabase
        .from('fidelity_offers')
        .select('id, title, text, created_at')
        .eq('hotel_id', hotel_id)
        .eq('active', true)
        .or(filter)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ offer: offers[0] || null });
    }

    // PATCH: desactivar oferta
    if (req.method === 'PATCH') {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Falta id de la oferta' });
      }

      const { data, error } = await supabase
        .from('fidelity_offers')
        .update({ active: false })
        .eq('id', id)
        .select();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ offer: data[0] });
    }

    // POST: crear nueva oferta de Fidelity
    if (req.method === 'POST') {
      const { text, expires_at } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Falta el campo text' });
      }

      // 1) Generar embedding
      const embResp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      const vector = embResp.data[0].embedding;

      // 2) Calcular fecha de inicio
      const start_date = new Date().toISOString();

      // 3) Insertar en Supabase (añadiendo title y start_date para no violar NOT NULL)
      const { data, error } = await supabase
        .from('fidelity_offers')
        .insert([{
          hotel_id,
          title: text,
          text,
          embedding: vector,
          start_date,
          expires_at: expires_at || null,
        }])
        .select();

      if (error) {
        throw error;
      }

      return res.status(201).json({ offer: data[0] });
    }

    // Métodos no permitidos
    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (err) {
    console.error('💥 offersFidelity crashed:', err);
    return res.status(500).json({ error: err.message });
  }
}




