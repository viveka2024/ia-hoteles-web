// File: /api/conversacion-fidelity.js

import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  // POST: crear nueva interacción de fidelidad (solo una vez, si lo necesitas)
  if (req.method === 'POST') {
    const {
      hotel_id,
      habitacion,
      nombre_cliente,
      canal,
      meta,
      categoria
    } = req.body;

    if (!hotel_id || !habitacion || !nombre_cliente) {
      return res.status(400).json({ error: 'Falta hotel_id, habitacion o nombre_cliente' });
    }

    const { data, error } = await supabase
      .from('interacciones_fidelity')
      .insert([{
        hotel_id,
        habitacion,
        nombre_cliente,
        canal: canal || null,
        meta: meta || null,
        categoria: categoria || null,
        resumen_interaccion: { preguntas: [] },
        fecha_hora: new Date().toISOString()
      }])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data[0]);
  }

  // PATCH: añadir pregunta al resumen, actualizar categoría y fecha_hora
  if (req.method === 'PATCH') {
    const {
      id_conversacion,           // el UUID de la fila
      resumen_interaccion,       // { pregunta: 'texto' }
      categoria: nuevaCategoria  // opcional
    } = req.body;

    if (!id_conversacion || !resumen_interaccion?.pregunta) {
      return res.status(400).json({
        error: 'Falta id_conversacion o resumen_interaccion.pregunta'
      });
    }

    // 1) leo el estado actual
    const { data: existing, error: fetchError } = await supabase
      .from('interacciones_fidelity')
      .select('resumen_interaccion, categoria')
      .eq('id', id_conversacion)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    // 2) añado la nueva pregunta al array
    const old = existing.resumen_interaccion || { preguntas: [] };
    const preguntas = Array.isArray(old.preguntas) ? old.preguntas : [];
    preguntas.push(resumen_interaccion.pregunta);

    // 3) construyo el objeto de actualización (incluyendo nueva fecha_hora)
    const updateData = {
      resumen_interaccion: { ...old, preguntas },
      fecha_hora: new Date().toISOString()
    };
    if (nuevaCategoria) {
      updateData.categoria = nuevaCategoria;
    }

    // 4) actualizo en Supabase
    const { data, error: updError } = await supabase
      .from('interacciones_fidelity')
      .update(updateData)
      .eq('id', id_conversacion)
      .select();

    if (updError) {
      return res.status(500).json({ error: updError.message });
    }

    return res.status(200).json(data[0]);
  }

  // Métodos no permitidos
  res.setHeader('Allow', ['POST', 'PATCH']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
