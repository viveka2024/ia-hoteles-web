// /api/whatsapp-conversacion.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { hotel_id, from, text, timestamp } = req.body

  // 1) Busca la conversación más reciente de este contacto
  const { data: existing, error: fetchError } = await supabase
    .from('conversaciones_hoteles')
    .select('id_conversacion, resumen_interaccion')
    .eq('id_usuario_hotel', hotel_id)
    .eq('canal', 'whatsapp')
    .eq('datos_contacto->>from', from)
    .order('fecha_hora', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('❌ Error fetching existing conv:', fetchError)
    return res.status(500).json({ error: fetchError.message })
  }

  if (existing) {
    // 2) Si existe, append al array de preguntas
    const prev = existing.resumen_interaccion || { preguntas: [] }
    const preguntas = Array.isArray(prev.preguntas) ? prev.preguntas : []
    preguntas.push(text)
    const newSummary = { preguntas }

    const { data: updated, error: updError } = await supabase
      .from('conversaciones_hoteles')
      .update({ resumen_interaccion: newSummary })
      .eq('id_conversacion', existing.id_conversacion)
      .select()
    
    if (updError) {
      console.error('❌ Error updating conv:', updError)
      return res.status(500).json({ error: updError.message })
    }
    return res.status(200).json(updated[0])
  } else {
    // 3) Si no existe, inserta uno nuevo
    const resumen = { preguntas: [text] }
    const datos_contacto = { from }

    const { data, error: insError } = await supabase
      .from('conversaciones_hoteles')
      .insert([{
        id_usuario_hotel: hotel_id,
        canal: 'whatsapp',
        resumen_interaccion: resumen,
        datos_contacto,
        meta: { timestamp }
      }])
      .select()

    if (insError) {
      console.error('❌ Error inserting conv:', insError)
      return res.status(500).json({ error: insError.message })
    }
    return res.status(200).json(data[0])
  }
}
