// /api/whatsapp-conversacion.js

import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { hotel_id, from, text, timestamp } = req.body

  // Construimos el objeto resumen_interaccion
  const resumen = { preguntas: [text] }
  const datos_contacto = { from }

  // Intentamos insertar
  const { data, error } = await supabase
    .from('conversaciones_hoteles')
    .insert([
      {
        id_usuario_hotel: hotel_id,
        canal: 'whatsapp',
        resumen_interaccion: resumen,
        datos_contacto,
        meta: { timestamp }
      }
    ])
    .select()
  
  if (error) {
    console.error('❌ Supabase insert error in whatsapp-conversacion:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json(data[0])
}



