// api/conversacion.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { id_usuario_hotel, canal, meta } = req.body
    const { data, error } = await supabase
      .from('conversaciones_hoteles')
      .insert([{ id_usuario_hotel, canal, meta }])
      .select()
    if (error) return res.status(500).json({ error })
    return res.status(200).json(data[0])
  }

  if (req.method === 'PATCH') {
    const { id_conversacion, resumen_interaccion } = req.body
    const { data, error } = await supabase
      .from('conversaciones_hoteles')
      .update({ resumen_interaccion })
      .eq('id_conversacion', id_conversacion)
      .select()
    if (error) return res.status(500).json({ error })
    return res.status(200).json(data[0])
  }

  res.setHeader('Allow', ['POST','PATCH'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
