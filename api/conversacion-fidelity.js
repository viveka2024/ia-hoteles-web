// File: /api/conversacion-fidelity.js

import { supabase } from './supabaseClient.js';

export default async function handler(req, res) {
  // POST: crear nueva interacción de fidelidad
  if (req.method === 'POST') {
    const {
      hotel_id,       // ej. 'sierracazorla'
      room,           // nº de habitación
      nombre_cliente, // apellido o nombre del huésped
      canal,          // opcional: 'web', 'app', etc.
      meta,           // opcional: cualquier JSON extra
      categoria       // categoría inicial (puede omitirse)
    } = req.body;

    if (!hotel_id || !room || !nombre_cliente) {
      return res.status(400).json({ error: 'Falta hotel_id, room o nombre_cliente' });
    }

    const { data, error } = await supabase
      .from('interacciones_fidelity')
      .insert([{
        hotel_id,
        room,
        nombre_cliente,
        canal: canal || null,
        meta: meta || null,
        categoria: categoria || null,
        // resumen_interaccion se rellenará con PATCH
      }])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data[0]);
  }

  // PATCH: añadir una pregunta al resumen y actualizar categoría
  if (req.method === 'PATCH') {
    const {
      id_conversacion,          // antes usábamos id_interaccion
      resumen_interaccion,      // { pregunta: 'texto de la pregunta' }
      categoria: nuevaCategoria // categoría detectada por IA (opcional)
    } = req.body;

    if (!id_conversacion || !resumen_interaccion?.pregunta) {
      return res.status(400).json({ error: 'Falta id_conversacion o resumen_interaccion.pregunta' });
    }

    // 1) Leer el resumen y categoría actuales
    const { data: existing, error: fetchError } = await supabase
      .from('interacciones_fidelity')
      .select('resumen_interaccion, categoria')
      .eq('id', id_conversacion)
      .single();
    if (fetchError) return res.status(500).json({ error: fetchError.message });

    // 2) Asegurar array de preguntas y añadir la nueva
    const old = existing.resumen_interaccion || { preguntas: [] };
    const preguntas = Array.isArray(old.preguntas) ? old.preguntas : [];
    preguntas.push(resumen_interaccion.pregunta);

    // 3) Preparar objeto de actualización
    const updateData = {
      resumen_interaccion: { ...old, preguntas }
    };
    if (nuevaCategoria) {
      updateData.categoria = nuevaCategoria;
    }

    // 4) Actualizar en Supabase
    const { data, error: updError } = await supabase
      .from('interacciones_fidelity')
      .update(updateData)
      .eq('id', id_conversacion)
      .select();
    if (updError) return res.status(500).json({ error: updError.message });

    return res.status(200).json(data[0]);
  }

  res.setHeader('Allow', ['POST', 'PATCH']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
