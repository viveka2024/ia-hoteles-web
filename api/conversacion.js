// api/conversacion.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { id_usuario_hotel, canal, meta } = req.body
    const { data, error } = await supabase
      .from('conversaciones_hoteles')
      .insert([{ id_usuario_hotel, canal, meta }])
      .select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data[0])
  }

  if (req.method === 'PATCH') {
    const { id_conversacion, resumen_interaccion } = req.body

    // 1) Obtener el resumen actual
    const { data: existing, error: fetchError } = await supabase
      .from('conversaciones_hoteles')
      .select('resumen_interaccion')
      .eq('id_conversacion', id_conversacion)
      .single()
    if (fetchError) return res.status(500).json({ error: fetchError.message })

    // 2) Asegurar un array de preguntas y añadir la nueva
    const old = existing.resumen_interaccion || { preguntas: [] }
    const preguntas = Array.isArray(old.preguntas) ? old.preguntas : []
    preguntas.push(resumen_interaccion.pregunta)

    // 3) Construir el nuevo objeto con todo el historial
    const newSummary = { ...old, preguntas }

    // 4) Actualizar en Supabase
    const { data, error: updError } = await supabase
      .from('conversaciones_hoteles')
      .update({ resumen_interaccion: newSummary })
      .eq('id_conversacion', id_conversacion)
      .select()
    if (updError) return res.status(500).json({ error: updError.message })

    return res.status(200).json(data[0])
  }

  res.setHeader('Allow', ['POST', 'PATCH'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
