// /api/whatsapp-conversacion.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const {
      hotel_id,      // viene en la petición
      from,
      text,
      timestamp
    } = req.body

    // 1. Buscar conversación previa por hotel y contacto
    const { data: existingRows, error: searchError } = await supabase
      .from('conversaciones_hoteles')
      .select()
      .eq('id_usuario_hotel', hotel_id)
      .eq('canal', 'whatsapp')
      .eq('datos_contacto->>from', from)
      .order('meta->timestamp', { ascending: false })
      .limit(1)

    if (searchError) {
      return res.status(500).json({ error: searchError.message })
    }

    if (existingRows.length > 0) {
      // 2. Actualizar fila existente, agregando la nueva pregunta
      const existing = existingRows[0]
      const preguntas = existing.resumen_interaccion?.preguntas || []

      preguntas.push(text)

      const { error: updateError } = await supabase
        .from('conversaciones_hoteles')
        .update({
          resumen_interaccion: { preguntas },
          meta: { timestamp }
        })
        .eq('id', existing.id)

      if (updateError) {
        return res.status(500).json({ error: updateError.message })
      }

      return res.status(200).json({ updated: true, id: existing.id })
    } else {
      // 3. Crear nueva fila si no existe ninguna
      const resumen = { preguntas: [text] }
      const datos_contacto = { from }

      const { data, error: insertError } = await supabase
        .from('conversaciones_hoteles')
        .insert([{
          id_usuario_hotel:    hotel_id,
          canal:               'whatsapp',
          resumen_interaccion: resumen,
          datos_contacto:      datos_contacto,
          meta:                { timestamp }
        }])
        .select()

      if (insertError) {
        return res.status(500).json({ error: insertError.message })
      }

      return res.status(200).json(data[0])
    }
  }

  res.setHeader('Allow', ['POST'])
  return res.status(405).end(`Method ${req.method} Not Allowed`)
}


