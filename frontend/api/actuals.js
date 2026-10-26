const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1/datasets';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { date_from = '2026-01-01', date_to = '2026-01-31' } = req.query || {};

  try {
    const url = `${ELEXON_BASE}/FUELHH/stream?settlementDateFrom=${date_from}&settlementDateTo=${date_to}&fuelType=WIND&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Elexon API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const raw = Array.isArray(data) ? data : data.data || [];

    const results = raw
      .filter((r) => String(r.fuelType).toUpperCase() === 'WIND')
      .map((r) => ({
        startTime: r.startTime || r.settlementDate,
        generation: Number(r.generation),
      }))
      .filter((r) => r.startTime && !isNaN(r.generation));

    return res.status(200).json(results);
  } catch (error) {
    console.error('Actuals API Error:', error);
    return res.status(500).json({ detail: error.message });
  }
}
