<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>IA Manager Insights</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 2em auto; }
    button { margin-right: .5em; padding: .5em 1em; }
    #output {
      white-space: pre-wrap;
      background: #f9f9f9;
      border: 1px solid #ddd;
      padding: 1em;
      border-radius: 4px;
      margin-top: 1em;
    }
    #loading { color: #888; }
    #error { color: crimson; }
  </style>
</head>
<body>

  <h1>IA Manager Insights</h1>

  <div>
    <button id="b7">Últimos 7 días</button>
    <button id="b30">Últimos 30 días</button>
    <button id="ball">Todo el período</button>
  </div>

  <p id="loading" style="display:none;">Cargando informe…</p>
  <p id="error" style="display:none;"></p>

  <div id="output"></div>

  <script>
    const loadingEl = document.getElementById('loading');
    const errorEl   = document.getElementById('error');
    const outputEl  = document.getElementById('output');

    async function fetchInforme(period) {
      loadingEl.style.display = 'block';
      errorEl.style.display   = 'none';
      outputEl.textContent     = '';
      try {
        const res = await fetch(`/api/generate-report?period=${period}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text||res.statusText);
        }
        const { informe } = await res.json();
        outputEl.textContent = informe;
      } catch (err) {
        errorEl.textContent   = 'Error: ' + err.message;
        errorEl.style.display = 'block';
      } finally {
        loadingEl.style.display = 'none';
      }
    }

    document.getElementById('b7').addEventListener('click', () => fetchInforme('7'));
    document.getElementById('b30').addEventListener('click', () => fetchInforme('30'));
    document.getElementById('ball').addEventListener('click', () => fetchInforme('all'));
  </script>

</body>
</html>
