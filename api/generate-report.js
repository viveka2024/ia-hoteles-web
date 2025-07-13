// Archivo: /api/generate-report.js

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Inicializa cliente Supabase con las claves definidas en Vercel
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Inicializa cliente OpenAI (v4.x)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  // Depuración de variables de entorno
  console.log("ENV:", {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
    OPENAI_KEY: !!process.env.OPENAI_API_KEY
  });

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    // Determina el rango de fechas
    const { period } = req.query;
    let fromDate = null;
    if (period === "7" || period === "30") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - parseInt(period, 10));
    }

    // Consulta las interacciones
    let query = supabase
      .from("conversaciones_hoteles")
      .select("fecha_hora, canal, resumen_interaccion, meta")
      .order("fecha_hora", { ascending: false });
    if (fromDate) {
      query = query.gte("fecha_hora", fromDate.toISOString());
    }
    const { data: rows, error } = await query;
    if (error) throw error;

    const total = rows.length;

    // Agrupa datos localmente
    const userWindows = new Set();
    const tiposCount = {};
    const tematicasCount = {};

    rows.forEach(r => {
      // Ventana de 10 min para usuarios únicos
      const d = new Date(r.fecha_hora);
      d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);
      userWindows.add(d.toISOString());

      // Extrae tipo y temática de resumen_interaccion
      let tipo = "Desconocido", tema = "General";
      try {
        const parsed = typeof r.resumen_interaccion === "object"
          ? r.resumen_interaccion
          : JSON.parse(r.resumen_interaccion);
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

    // Prepara prompt
    const resumen = { usuariosUnicos, tiposCliente, tematicas };
    const prompt = `
Eres un analista de datos de hoteles. Basándote en este resumen de métricas:
${JSON.stringify(resumen, null, 2)}

Genera un informe con:
1. Resumen de Tendencias (texto formateado como en el ejemplo).
2. Recomendaciones y Campañas Potenciales basadas en estas tendencias.

Formato de ejemplo:
✅ Resumen de Tendencias Manager Insights (Hotel X)
Número de usuarios únicos:
→ ${usuariosUnicos} usuarios

Tipos de perfiles detectados:
• Grupo de amigos: 14 interacciones (23.3%)
…

Temáticas y focos de interés más consultados:
• Ofertas: 9 interacciones (15.0%)
…

🎯 Recomendaciones y Campañas Potenciales
1. Paquetes para grupos/eventos: …
2. Promociones de Ofertas Especiales: …
3. Comunicación clara de check-in y late check-out: …
4. Upselling en spa, wifi premium y excursiones: …

Devuélvelo como texto formateado, sin JSON extra.
`;

    // Llamada a OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un asistente experto en análisis de datos de hoteles." },
        { role: "user", content: prompt }
      ]
    });

    const informe = response.choices[0].message.content;
    return res.status(200).json({ informe });

  } catch (err) {
    console.error("generate-report error:", err);
    return res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
}


