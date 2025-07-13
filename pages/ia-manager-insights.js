// /pages/ia-manager-insights.js
import { useState } from "react";

export default function IAManagerInsights() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [informe, setInforme] = useState("");

  const fetchInforme = async (period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate-report?period=${period}`);
      if (!res.ok) throw new Error(await res.text());
      const { informe } = await res.json();
      setInforme(informe);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1>IA Manager Insights</h1>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => fetchInforme("7")} disabled={loading}>
          Últimos 7 días
        </button>
        <button onClick={() => fetchInforme("30")} disabled={loading} style={{ marginLeft: 10 }}>
          Últimos 30 días
        </button>
        <button onClick={() => fetchInforme("all")} disabled={loading} style={{ marginLeft: 10 }}>
          Todo el período
        </button>
      </div>

      {loading && <p>Cargando informe…</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {informe && (
        <div
          style={{
            whiteSpace: "pre-wrap",
            background: "#f9f9f9",
            padding: 15,
            borderRadius: 4,
            border: "1px solid #ddd",
          }}
        >
          {informe}
        </div>
      )}
    </div>
  );
}
