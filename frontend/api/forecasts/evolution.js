const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1/datasets';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { delivery_date = '2026-01-15' } = req.query || {};

  try {
    const url = `${ELEXON_BASE}/WINDFOR/stream?publishDateTimeFrom=2025-12-30T00:00:00Z&publishDateTimeTo=2026-01-31T23:59:59Z&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Elexon API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const raw = Array.isArray(data) ? data : data.data || [];

    const forecasts = raw
      .map((r) => ({
        startTime: r.startTime,
        publishTime: r.publishTime || r.publishDateTime,
        generation: Number(r.generation),
      }))
      .filter((r) => r.startTime && r.publishTime && !isNaN(r.generation));

    const targetingDate = forecasts.filter((f) => f.startTime.startsWith(delivery_date));

    const groups = new Map();
    targetingDate.forEach((f) => {
      if (!groups.has(f.publishTime)) groups.set(f.publishTime, []);
      groups.get(f.publishTime).push(f);
    });

    const result = Array.from(groups.entries())
      .map(([publishTime, list]) => ({ publishTime, forecasts: list }))
      .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime))
      .slice(-5); // latest 5 publish runs

    return res.status(200).json(result);
  } catch (error) {
    console.error('Forecast Evolution API Error:', error);
    return res.status(500).json({ detail: error.message });
  }
}
