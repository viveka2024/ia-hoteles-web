import fetch from 'node-fetch'
import { generarRespuestaIA } from './whatsapp-chat.js'

// Buffer en memoria para debug rápido vía ?debug=true
let _lastPayload = null

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

  // 1) Handshake de verificación (GET)
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge, debug } = req.query

    // debug: consultar último payload
    if (debug === 'true') {
      return res.status(200).json(_lastPayload || { message: 'No hay payload aún' })
    }
    // validación normal
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // 2) Recepción de eventos (POST)
  if (req.method === 'POST') {
    const payload = req.body
    _lastPayload = payload

    try {
      const change = payload.entry?.[0]?.changes?.[0]?.value
      const phoneId = change?.metadata?.phone_number_id
      const messages = change?.messages || []

      for (const msg of messages) {
        const from = msg.from
        const text = msg.text?.body || ''
        const reply = await generarRespuestaIA({ from, text })
        await fetch(
          `https://graph.facebook.com/v15.0/${phoneId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: from,
              type: 'text',
              text: { body: reply }
            })
          }
        )
      }
    } catch (err) {
      console.error('Error procesando webhook:', err)
    }

    return res.status(200).end()
  }

  // Métodos no permitidos
  res.setHeader('Allow', ['GET','POST'])
  return res.status(405).end(`Method ${req.method} Not Allowed`)
}


