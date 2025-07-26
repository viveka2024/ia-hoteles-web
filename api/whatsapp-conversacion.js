// /api/whatsapp-conversacion_.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const {
      hotel_id,      // viene en la petición
      from,
      text,
      timestamp
    } = req.body

    // Construimos el objeto resumen_interaccion
    const resumen = { preguntas: [ text ] }
    const datos_contacto = { from }

    const { data, error } = await supabase
      .from('conversaciones_hoteles')
      .insert([{
        id_usuario_hotel:    hotel_id,
        canal:               'whatsapp',
        resumen_interaccion: resumen,
        datos_contacto:      datos_contacto,
        meta:                { timestamp }
      }])
      .select()

    if (error) {
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json(data[0])
  }

  res.setHeader('Allow', ['POST'])
  return res.status(405).end(`Method ${req.method} Not Allowed`)
}

