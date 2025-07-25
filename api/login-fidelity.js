// File: /api/login-fidelity.js

import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { apellido, habitacion, hotel_id } = req.body;
  if (!apellido || !habitacion || !hotel_id) {
    return res.status(400).json({ error: 'Falta apellido, habitación o hotel_id' });
  }

  try {
    // 1) Intentamos encontrar una sesión existente para ESTE hotel_id
    const { data: existing, error: fetchError } = await supabase
      .from('interacciones_fidelity')
      .select('id')
      .eq('nombre_cliente', apellido)
      .eq('habitacion', habitacion)
      .eq('hotel_id', hotel_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const now = new Date().toISOString();
    let sessionId;

    if (existing && existing.id) {
      // 2a) Si existe, actualizamos fecha_hora y devolvemos el id
      sessionId = existing.id;
      await supabase
        .from('interacciones_fidelity')
        .update({ fecha_hora: now })
        .eq('id', sessionId);
    } else {
      // 2b) Si no existe, creamos una nueva fila INCLUYENDO hotel_id
      const insertPayload = {
        hotel_id,
        habitacion,
        nombre_cliente: apellido,
        canal: 'recepcion',
        resumen_interaccion: { preguntas: [] },
        meta: null,
        categoria: null,
        fecha_hora: now
      };
      const { data: inserted, error: insertError } = await supabase
        .from('interacciones_fidelity')
        .insert([insertPayload])
        .select('id')
        .single();

      if (insertError) throw insertError;
      sessionId = inserted.id;
    }

    return res.status(200).json({ id: sessionId });
  } catch (err) {
    console.error('login-fidelity error:', err);
    return res.status(500).json({ error: err.message });
  }
}
