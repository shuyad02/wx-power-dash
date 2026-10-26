const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1/datasets';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const actualsUrl = `${ELEXON_BASE}/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-01-31&fuelType=WIND&format=json`;
    const forecastsUrl = `${ELEXON_BASE}/WINDFOR/stream?publishDateTimeFrom=2025-12-30T00:00:00Z&publishDateTimeTo=2026-01-31T23:59:59Z&format=json`;

    const [actRes, fcstRes] = await Promise.all([
      fetch(actualsUrl),
      fetch(forecastsUrl),
    ]);

    if (!actRes.ok || !fcstRes.ok) {
      throw new Error(`Upstream Elexon API error: Act ${actRes.status}, Fcst ${fcstRes.status}`);
    }

    const [actData, fcstData] = await Promise.all([
      actRes.json(),
      fcstRes.json(),
    ]);

    const actualsRaw = Array.isArray(actData) ? actData : actData.data || [];
    const forecastsRaw = Array.isArray(fcstData) ? fcstData : fcstData.data || [];

    const actuals = actualsRaw
      .filter((r) => String(r.fuelType).toUpperCase() === 'WIND')
      .map((r) => ({
        startTime: r.startTime || r.settlementDate,
        generation: Number(r.generation),
      }))
      .filter((r) => r.startTime && !isNaN(r.generation));

    const forecasts = forecastsRaw
      .map((r) => ({
        startTime: r.startTime,
        publishTime: r.publishTime || r.publishDateTime,
        generation: Number(r.generation),
      }))
      .filter((r) => r.startTime && r.publishTime && !isNaN(r.generation));

    // Index forecasts by startTime
    const fcstByStart = new Map();
    forecasts.forEach((f) => {
      if (!fcstByStart.has(f.startTime)) {
        fcstByStart.set(f.startTime, []);
      }
      fcstByStart.get(f.startTime).push(f);
    });

    const matched = [];
    actuals.forEach((act) => {
      const list = fcstByStart.get(act.startTime);
      if (!list || !list.length) return;

      // Cutoff: delivery date - 1 day + 12:00:00 UTC
      const dDate = new Date(act.startTime);
      const cutoff = new Date(
        Date.UTC(dDate.getUTCFullYear(), dDate.getUTCMonth(), dDate.getUTCDate() - 1, 12, 0, 0)
      );

      const eligible = list.filter((f) => new Date(f.publishTime) <= cutoff);
      if (!eligible.length) return;

      eligible.sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime));
      const chosen = eligible[0];

      const error = chosen.generation - act.generation;
      const absError = Math.abs(error);

      matched.push({
        startTime: act.startTime,
        hour: new Date(act.startTime).getUTCHours(),
        actual: act.generation,
        forecast: chosen.generation,
        error,
        abs_error: absError,
      });
    });

    if (!matched.length) {
      return res.status(200).json({
        overall: { mae: 0, rmse: 0, bias: 0, mape: 0, correlation: 0, n_matched: 0 },
        by_hour: [],
        timeseries: [],
      });
    }

    const n = matched.length;
    const mae = matched.reduce((a, b) => a + b.abs_error, 0) / n;
    const rmse = Math.sqrt(matched.reduce((a, b) => a + b.error * b.error, 0) / n);
    const bias = matched.reduce((a, b) => a + b.error, 0) / n;

    // MAPE (actual > 1 MW)
    const nonZero = matched.filter((m) => m.actual > 1);
    const mape = nonZero.length
      ? (nonZero.reduce((a, b) => a + b.abs_error / b.actual, 0) / nonZero.length) * 100
      : 0;

    // Pearson Correlation
    const meanAct = matched.reduce((a, b) => a + b.actual, 0) / n;
    const meanFcst = matched.reduce((a, b) => a + b.forecast, 0) / n;
    let num = 0, d1 = 0, d2 = 0;
    matched.forEach((m) => {
      const da = m.actual - meanAct;
      const df = m.forecast - meanFcst;
      num += da * df;
      d1 += da * da;
      d2 += df * df;
    });
    const correlation = d1 > 0 && d2 > 0 ? num / Math.sqrt(d1 * d2) : 1;

    // Diurnal Hour grouping
    const hourMap = new Map();
    for (let h = 0; h < 24; h++) hourMap.set(h, []);
    matched.forEach((m) => hourMap.get(m.hour).push(m));

    const by_hour = [];
    for (let h = 0; h < 24; h++) {
      const arr = hourMap.get(h);
      if (!arr.length) continue;
      const hMae = arr.reduce((a, b) => a + b.abs_error, 0) / arr.length;
      const hRmse = Math.sqrt(arr.reduce((a, b) => a + b.error * b.error, 0) / arr.length);
      by_hour.push({
        hour: h,
        mae: Math.round(hMae),
        rmse: Math.round(hRmse),
        count: arr.length,
      });
    }

    return res.status(200).json({
      overall: {
        mae: Math.round(mae),
        rmse: Math.round(rmse),
        bias: Math.round(bias),
        mape: Number(mape.toFixed(1)),
        correlation: Number(correlation.toFixed(3)),
        n_matched: n,
      },
      by_hour,
      timeseries: matched,
    });
  } catch (error) {
    console.error('Accuracy API Error:', error);
    return res.status(500).json({ detail: error.message });
  }
}
