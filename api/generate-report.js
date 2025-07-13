// Archivo: /api/generate-report.js

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Inicializa cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Inicializa cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
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
    // 1) Parámetro y rango de fechas
    const { period } = req.query;
    let fromDate = null;
    if (period === "7" || period === "30") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - parseInt(period, 10));
    }

    // 2) Consulta interacciones desde Supabase
    let query = supabase
      .from("conversaciones_hoteles")
      .select("fecha_hora, canal, resumen_interaccion, meta")
      .order("fecha_hora", { ascending: false });
    if (fromDate) query = query.gte("fecha_hora", fromDate.toISOString());

    const { data: rows, error } = await query;
    if (error) throw error;

    // 3) Prepara array de interacciones con guardas para null
    const interactions = rows.map((r, i) => {
      // Manejo seguro de resumen_interaccion
      const raw = r.resumen_interaccion;
      let texto = "";
      if (raw) {
        if (typeof raw === "object") {
          texto = raw.pregunta ?? JSON.stringify(raw);
        } else {
          texto = String(raw);
        }
      }
      return {
        index: i,
        fecha: r.fecha_hora,
        canal: r.canal,
        idioma: r.meta?.idioma || "unknown",
        texto
      };
    });

    // 4) Clasificación con GPT: tipo_cliente y tematica
    const classifyPrompt = `
Eres un clasificador de interacciones de clientes de hotel.
Recibe un array de objetos { index, texto } y devuelve un array JSON con objetos { index, tipo_cliente, tematica }.
Los tipos posibles son: familiar, romántico, individual, trabajo, grupo de amigos, eventos, etc.
Las temáticas posibles: excursiones, spa, habitaciones, precio, wifi, check-in, restaurante, desayuno, parking, etc.
Devuélvelo **solo** como JSON, ejemplo:
[
  { "index": 0, "tipo_cliente": "familiar", "tematica": "excursiones" },
  ...
]
---
Interacciones originales:
${JSON.stringify(
      interactions.map(({ index, texto }) => ({ index, texto })),
      null,
      2
    )}
`;

    const classifyResp = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un asistente experto en clasificación de interacciones." },
        { role: "user", content: classifyPrompt }
      ]
    });
    const classification = JSON.parse(classifyResp.choices[0].message.content);

    // 5) Fusiona clasificación en interacciones
    classification.forEach(c => {
      const it = interactions.find(x => x.index === c.index);
      if (it) {
        it.tipo_cliente = c.tipo_cliente;
        it.tematica = c.tematica;
      }
    });

    // 6) Cálculo de métricas
    const total = interactions.length;
    const userWindows = new Set();
    const tiposCount = {};
    const tematicasCount = {};

    interactions.forEach(it => {
      // Ventanas de 10 minutos
      const d = new Date(it.fecha);
      d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);
      userWindows.add(d.toISOString());

      const tipo = it.tipo_cliente || "Desconocido";
      const tema = it.tematica || "General";

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

    // 7) Prompt final y generación de informe
    const resumen = { usuariosUnicos, tiposCliente, tematicas };
    const finalPrompt = `
Eres un analista de datos de hoteles.
Basándote en este resumen de métricas:
${JSON.stringify(resumen, null, 2)}

1) Redacta un **Resumen de Tendencias** formateado como en el ejemplo.
2) A continuación, **Recomendaciones y Campañas Potenciales** basadas en esas tendencias.

Formato de ejemplo:
✅ Resumen de Tendencias Manager Insights (Hotel Sierra de Cazorla)
Número de usuarios únicos:
→ 38 usuarios

Tipos de perfiles detectados:
• Grupo de amigos: 14 interacciones (23.3%)
…

Temáticas y focos de interés más consultados:
• Ofertas: 9 interacciones (15.0%)
…

🎯 Recomendaciones y Campañas Potenciales
1. Paquetes para grupos/eventos: …
2. Promociones de Ofertas Especiales: …
`;

    const finalResp = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un asistente experto en análisis de datos de hoteles." },
        { role: "user", content: finalPrompt }
      ]
    });

    const informe = finalResp.choices[0].message.content;

    // 8) Respuesta
    return res.status(200).json({ informe, resumen });

  } catch (err) {
    console.error("generate-report error:", err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}


