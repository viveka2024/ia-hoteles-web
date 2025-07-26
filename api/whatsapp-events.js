// /api/whatsapp-events.js

import { supabase } from './supabaseClient'

export default async function handler(req, res) {
  // lee los últimos 20 eventos
  const { data, error } = await supabase
    .from('webhook_debug')
    .select('id, payload, received_at')
    .order('received_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Supabase select error:', error)
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json(data)
}
