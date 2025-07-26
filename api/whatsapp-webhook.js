// /api/whatsapp-webhook.js

import fetch from 'node-fetch'
import { supabase } from './supabaseClient.js'
import { generarRespuestaIA } from './whatsapp-chat.js'

let _lastPayload = null

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

  // 0) Debug super-early
  if (req.method === 'GET' && req.query.debug === 'true') {
    return res.status(200).json(_lastPayload || { message: 'No hay payload aún' })
  }

  // 1) Handshake de verificación
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // 2) Recepción de eventos
  if (req.method === 'POST') {
    const payload = req.body
    _lastPayload = payload

    // (opcional) guarda en Supabase
    supabase.from('webhook_debug')
      .insert([{ payload, received_at: new Date() }])
      .catch(err => console.error('Supabase error:', err))

    // procesa mensajes
    const change = payload.entry?.[0]?.changes?.[0]?.value
    const phoneId = change?.metadata?.phone_number_id
    const messages = change?.messages || []

    for (const msg of messages) {
      const from = msg.from
      const text = msg.text?.body || ''
      const reply = await generarRespuestaIA({ from, text })
      await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: reply }
        })
      })
    }

    return res.status(200).end()
  }

  // otros métodos
  res.setHeader('Allow', ['GET','POST'])
  return res.status(405).end(`Method ${req.method} Not Allowed`)
}
