// /api/whatsapp-webhook.js

export default function handler(req, res) {
  // Sólo manejamos GET para el handshake
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // Para cualquier otro método devolvemos 200 para no romper
  return res.status(200).end()
}


