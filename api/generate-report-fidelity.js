// /api/generate-report-fidelity.js

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

    // 2) Trae las interacciones de fidelización
    let q = supabase
      .from("interacciones_fidelity")
      .select("fecha_hora, canal, resumen_interaccion, meta")
      .order("fecha_hora", { ascending: false });
    if (fromDate) q = q.gte("fecha_hora", fromDate.toISOString());
    const { data: rows, error } = await q;
    if (error) throw error;

    // 3) Prepara array de { index, texto } usando resumen_interaccion.preguntas
    const interactions = rows.map((r, i) => {
      let texto = "";
      if (r.resumen_interaccion && Array.isArray(r.resumen_interaccion.preguntas)) {
        texto = r.resumen_interaccion.preguntas.join(" | ");
      }
      return { index: i, texto };
    });

    // 4) Clasifica cada texto (igual que generate-report.js)
    const classifyPrompt = `
Eres un clasificador de interacciones de clientes para un hotel.
Recibes un array JSON de objetos con { index, texto } donde texto es lo que el huésped preguntó.
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
      } catch {}
    }
    classification.forEach(c => {
      const it = interactions.find(x => x.index === c.index);
      if (it) {
        it.tipo_cliente = c.tipo_cliente;
        it.tematica = c.tematica;
      }
    });

    // 5) Calcula métricas finales
    const total = interactions.length;
    const userWindows = new Set();
    const tiposCount = {};
    const tematicasCount = {};

    rows.forEach((r, i) => {
      const d = new Date(r.fecha_hora);
      d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);
      userWindows.add(d.toISOString());

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

    // 6) Prompt final para el informe
    const resumen = { usuariosUnicos, tiposCliente, tematicas };
    const finalPrompt = `
Eres un analista de datos de hoteles.
Basándote en este resumen de interacciones Fidelity:
${JSON.stringify(resumen, null, 2)}

1) Redacta el Resumen de Tendencias con cifras y formato claro.
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
    console.error("generate-report-fidelity error:", err);
    return res.status(500).json({ error: err.message });
  }
}
