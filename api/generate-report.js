// Archivo: /api/generate-report.js

import { createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";

// Inicializa cliente Supabase con las claves de Vercel
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Inicializa cliente OpenAI
const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { period } = req.query;
  let fromDate = null;
  if (period === "7" || period === "30") {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period, 10));
  }

  // Consulta interacciones relevantes
  let query = supabase
    .from("conversaciones_hoteles")
    .select("fecha_hora, canal, resumen_interaccion, meta")
    .order("fecha_hora", { ascending: false });
  if (fromDate) {
    query = query.gte("fecha_hora", fromDate.toISOString());
  }

  const { data: conversations, error } = await query;
  if (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({ error: error.message });
  }

  const total = conversations.length;
  // Agrupar datos localmente para reducir tamaño del prompt
  const userWindows = new Set();
  const tiposCount = {};
  const tematicasCount = {};

  // Ventana de 10 minutos para usuarios únicos
  conversations.forEach(c => {
    const date = new Date(c.fecha_hora);
    // Redondea minutos a ventanas de 10 minutos
    date.setMinutes(Math.floor(date.getMinutes() / 10) * 10);
    userWindows.add(date.toISOString());
    // Tipo y temática asumidos dentro de resumen_interaccion
    let tipo = "Desconocido";
    let tema = "General";
    try {
      const parsed = typeof c.resumen_interaccion === 'object'
        ? c.resumen_interaccion
        : JSON.parse(c.resumen_interaccion);
      tipo = parsed.tipo_cliente || tipo;
      tema = parsed.tematica || tema;
    } catch {}
    tiposCount[tipo] = (tiposCount[tipo] || 0) + 1;
    tematicasCount[tema] = (tematicasCount[tema] || 0) + 1;
  });

  const usuariosUnicos = userWindows.size;
  const tiposCliente = Object.entries(tiposCount).map(([tipo, count]) => ({
    tipo,
    count,
    porcentaje: parseFloat(((count / total) * 100).toFixed(1))
  }));
  const tematicas = Object.entries(tematicasCount).map(([tema, count]) => ({
    tema,
    count,
    porcentaje: parseFloat(((count / total) * 100).toFixed(1))
  }));

  // Construye prompt usando resumen de métricas
  const resumen = { usuariosUnicos, tiposCliente, tematicas };
  const prompt = `
Eres un analista de datos de hoteles.
Basándote en este resumen de métricas:
${JSON.stringify(resumen, null, 2)}

Genera un informe con:
1. Resumen de Tendencias (texto formateado según ejemplo).
2. Recomendaciones y campañas potenciales basadas en estas tendencias.

Formato de ejemplo:
✅ Resumen de Tendencias Manager Insights (Hotel X)
Número de usuarios únicos:
→ ${usuariosUnicos} usuarios

Tipos de perfiles detectados:
• Grupo de amigos: 14 interacciones (23.3%)
...

Temáticas y focos de interés más consultados:
• Ofertas: 9 interacciones (15.0%)
...

🎯 Recomendaciones y Campañas Potenciales
1. Paquetes para grupos/eventos: ...
2. Promociones de Ofertas Especiales: ...
3. Comunicación clara de check-in y late check-out: ...
4. Upselling en spa, wifi premium y excursiones: ...

Devuélvelo como texto formateado, sin JSON extra.
`;

  try {
    const gptResponse = await openai.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Eres un asistente experto en análisis de datos de hoteles." },
        { role: "user", content: prompt }
      ]
    });
    const informe = gptResponse.data.choices[0].message.content;
    return res.status(200).json({ informe });
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    return res.status(500).json({ error: "Error generando informe" });
  }
}

