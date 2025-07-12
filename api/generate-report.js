// Archivo: /api/generate-report.js

import { createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";

// Inicializa cliente Supabase con rol de servicio
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
    .from("conversations")
    .select("fecha_hora, canal, resumen_interaccion, meta")
    .order("fecha_hora", { ascending: false });
  if (fromDate) {
    query = query.gte("fecha_hora", fromDate.toISOString());
  }
  const { data: conversations, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Prepara array de interacciones para GPT
  const interactions = conversations.map(c => ({
    fecha: c.fecha_hora,
    canal: c.canal,
    idioma: c.meta?.idioma || "unknown",
    texto:
      c.resumen_interaccion?.pregunta ||
      (typeof c.resumen_interaccion === "string"
        ? c.resumen_interaccion
        : JSON.stringify(c.resumen_interaccion))
  }));

  // Construye prompt para análisis
  const prompt = `
Eres un analista de datos para hoteles. A continuación tienes la lista de interacciones con clientes en el periodo seleccionado:
${JSON.stringify(interactions, null, 2)}

Objetivos del informe:
1. Resumen de Tendencias:
   - Número de usuarios únicos (considera un usuario como las interacciones agrupadas en ventanas de 10 minutos).
   - Tipos de perfiles detectados (familia, romántico, individual, trabajo, etc.) extraídos de los textos de interacción y su porcentaje.
   - Temáticas y focos de interés más consultados con porcentaje.
2. Recomendaciones y Campañas Potenciales:
   - Orientación y consejos para campañas de marketing basadas en las tendencias encontradas. Por ejemplo, si hay interés en excursiones, sugiere paquetes de excursiones desde el hotel, etc.

Formato de ejemplo:
✅ Resumen de Tendencias Manager Insights (Hotel X)
Número de usuarios únicos:
→ 38 usuarios (agrupado por ventanas de 10 minutos)

Tipos de perfiles detectados:
• Grupo de amigos: 14 interacciones (23.3%)
• Eventos: 14 interacciones (23.3%)
...

Temáticas y focos de interés más consultados:
• Ofertas: 9 interacciones (15.0%)
• Spa: 8 interacciones (13.3%)
...

🎯 Recomendaciones y Campañas Potenciales
1. Paquetes para grupos/eventos:
   o Dado el 46.6% de interacciones combinadas entre “grupo de amigos” y “eventos”, ofrecer paquetes cerrados con spa, late check-out y desayuno incluido sería muy estratégico.
2. Promociones de Ofertas Especiales:
   o Las “ofertas” son el foco más consultado: configurar campañas de email marketing con códigos de descuento.
3. Comunicación clara de check-in y late check-out:
   o Actualizar mensajes en web y WhatsApp IA.
4. Upselling en spa, wifi premium y excursiones:
   o Incluir en el flujo preguntas como “¿Desea incluir acceso al spa?”

Devuélvelo como texto formateado, sin JSON extra.
`;

  // Llama a OpenAI para generar el texto del informe
  const gptResponse = await openai.createChatCompletion({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Eres un asistente experto en análisis de datos de hoteles." },
      { role: "user", content: prompt }
    ]
  });

  const informe = gptResponse.data.choices[0].message.content;

  return res.status(200).json({ informe });
}

