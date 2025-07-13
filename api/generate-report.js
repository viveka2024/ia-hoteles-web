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
    // 1) Rango de fechas
    const { period } = req.query;
    let fromDate = null;
    if (period === "7" || period === "30") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - parseInt(period, 10));
    }

    // 2) Trae las interacciones
    let q = supabase
      .from("conversaciones_hoteles")
      .select("fecha_hora, canal, resumen_interaccion, meta")
      .order("fecha_hora", { ascending: false });
    if (fromDate) q = q.gte("fecha_hora", fromDate.toISOString());
    const { data: rows, error } = await q;
    if (error) throw error;

    // 3) Prepara array de { index, texto } usando resumen_interaccion
    const interactions = rows.map((r, i) => {
      let texto = "";
      if (r.resumen_interaccion) {
        if (typeof r.resumen_interaccion === "object") {
          texto = r.resumen_interaccion.pregunta ?? "";
        } else {
          texto = String(r.resumen_interaccion);
        }
      }
      return { index: i, texto };
    });

    // 4) Pide a GPT clasificación de cada texto en tipo_cliente y tematica
    const classifyPrompt = `
Eres un clasificador de interacciones de clientes para un hotel.
Recibes un array JSON de objetos con { index, texto } donde texto viene de la columna resumen_interaccion.
Devuelve **solo** un array JSON con objetos { index, tipo_cliente, tematica }.
Ejemplo de salida EXACTA:
[
  { "index": 0, "tipo_cliente": "familiar", "tematica": "excursiones" },
  ...
]
---
Interacciones a clasificar:
${JSON.stringify(interactions, null, 2)}
`;
    const classifyResp = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un experto en clasificación de interacciones." },
        { role: "user", content: classifyPrompt }
      ]
    });
    const raw = classifyResp.choices[0].message.content;
    const match = raw.match(/\[[\s\S]*\]/);
    let classification = [];
    if (match) {
      try {
        classification = JSON.parse(match[0]);
      } catch (e) {
        console.warn("Error parsing classification JSON:", e);
      }
    }

    // 5) Fusiona la clasificación en líneas originales
    classification.forEach(c => {
      const it = interactions.find(x => x.index === c.index);
      if (it) {
        it.tipo_cliente = c.tipo_cliente;
        it.tematica = c.tematica;
      }
    });

    // 6) Calcula métricas finales
    const total = interactions.length;
    const userWindows = new Set();
    const tiposCount = {};
    const tematicasCount = {};

    rows.forEach((r, i) => {
      // ventana 10 min → usuarios únicos
      const d = new Date(r.fecha_hora);
      d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);
      userWindows.add(d.toISOString());

      // Busca la clasificación en interactions
      const it = interactions.find(x => x.index === i);
      const tipo = it?.tipo_cliente || "Desconocido";
      const tema = it?.tematica    || "General";

      tiposCount[tipo]       = (tiposCount[tipo] || 0) + 1;
      tematicasCount[tema]   = (tematicasCount[tema] || 0) + 1;
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

    // 7) Prompt final para el informe
    const resumen = { usuariosUnicos, tiposCliente, tematicas };
    const finalPrompt = `
Eres un analista de datos de hoteles.
Basándote en este resumen:
${JSON.stringify(resumen, null, 2)}

1) Redacta el Resumen de Tendencias con cifras y formato de ejemplo.
2) Luego, las Recomendaciones y Campañas Potenciales.
`;
    const finalResp = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un asistente experto en análisis de datos de hoteles." },
        { role: "user",   content: finalPrompt }
      ]
    });
    const informe = finalResp.choices[0].message.content;

    return res.status(200).json({ informe, resumen });
  }
  catch (err) {
    console.error("generate-report error:", err);
    return res.status(500).json({ error: err.message });
  }
}



