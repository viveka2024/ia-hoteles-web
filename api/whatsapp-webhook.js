// /api/whatsapp-webhook.js

import { supabase } from '../api/supabaseClient'
import { generarRespuestaIA } from '../api/chat'
 
export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

  // 1) Verificación del webhook (GET)
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // 2) Recepción de eventos (POST)
  if (req.method === 'POST') {
    const body = req.body

    try {
      const changes = body.entry?.[0]?.changes?.[0]?.value
      const messages = changes?.messages || []

      for (const msg of messages) {
        const from = msg.from                // teléfono del cliente
        const text = msg.text?.body          // contenido

        // 3) Lógica IA: genera respuesta usando tu módulo chat.js
        const respuesta = await generarRespuestaIA({ from, text, channel: 'whatsapp' })

        // 4) Envía respuesta vía Cloud API
        await fetch(`https://graph.facebook.com/v15.0/${changes.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: respuesta }
          })
        })
      }

      // Acknowledge receipt
      return res.status(200).end()
    } catch (err) {
      console.error('Webhook error:', err)
      return res.status(500).send('Server error')
    }
  }

  // Otros métodos no permitidos
  res.setHeader('Allow', ['GET','POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}
