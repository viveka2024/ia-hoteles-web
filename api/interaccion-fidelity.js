// api/interaccion-fidelity.js
import { supabase } from './supabaseClient.js'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const {
      hotel_id,
      habitacion,
      nombre_cliente,
      canal,
      resumen_interaccion,
      categorias, // array opcional
      meta // opcional: idioma, modelo, etc.
    } = req.body

    const { data, error } = await supabase
      .from('interacciones_fidelity')
      .insert([{
        hotel_id,
        habitacion,
        nombre_cliente,
        canal,
        resumen_interaccion,
        categorias,
        meta,
        fecha_hora: new Date().toISOString()
      }])
      .select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data[0])
  }

  res.setHeader('Allow', ['POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
