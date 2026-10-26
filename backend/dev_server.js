/**
 * Lightweight native Node.js development server for local testing.
 * Implements the exact same API contracts and Elexon BMRS stream logic as app/main.py.
 * Zero external npm dependencies (uses native fetch and http).
 */

import http from 'http';
import { URL } from 'url';

const PORT = 8000;
const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1/datasets';

// Simple in-memory cache
const cache = new Map();

async function fetchCachedJson(url) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Elexon HTTP ${res.status}`);
  }
  const data = await res.json();
  const records = Array.isArray(data) ? data : data.data || [];
  cache.set(url, records);
  return records;
}

// 1. Fetch Actuals
async function getActuals(dateFrom = '2026-01-01', dateTo = '2026-01-31') {
  const url = `${ELEXON_BASE}/FUELHH/stream?settlementDateFrom=${dateFrom}&settlementDateTo=${dateTo}&fuelType=WIND&format=json`;
  const raw = await fetchCachedJson(url);
  return raw
    .filter((r) => String(r.fuelType).toUpperCase() === 'WIND')
    .map((r) => ({
      startTime: r.startTime || r.settlementDate,
      generation: Number(r.generation),
    }))
    .filter((r) => r.startTime && !isNaN(r.generation));
}

// 2. Fetch Forecasts
async function getForecasts(
  publishFrom = '2025-12-30T00:00:00Z',
  publishTo = '2026-01-31T23:59:59Z'
) {
  const url = `${ELEXON_BASE}/WINDFOR/stream?publishDateTimeFrom=${publishFrom}&publishDateTimeTo=${publishTo}&format=json`;
  const raw = await fetchCachedJson(url);
  return raw
    .map((r) => ({
      startTime: r.startTime,
      publishTime: r.publishTime || r.publishDateTime,
      generation: Number(r.generation),
    }))
    .filter((r) => r.startTime && r.publishTime && !isNaN(r.generation));
}

// 3. Compute Accuracy Analytics
async function computeAccuracy() {
  const [actuals, forecasts] = await Promise.all([
    getActuals('2026-01-01', '2026-01-31'),
    getForecasts('2025-12-30T00:00:00Z', '2026-01-31T23:59:59Z'),
  ]);

  // Index forecasts by startTime -> array of {publishTime, generation}
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
    return {
      overall: { mae: 0, rmse: 0, bias: 0, mape: 0, correlation: 0, n_matched: 0 },
      by_hour: [],
      timeseries: [],
    };
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

  // Correlation
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

  // By Hour
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

  return {
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
  };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  try {
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'wind-energy-forecast-api', version: '1.0.0' }));
      return;
    }

    if (pathname === '/api/actuals' || pathname === '/actuals') {
      const dateFrom = reqUrl.searchParams.get('date_from') || '2026-01-01';
      const dateTo = reqUrl.searchParams.get('date_to') || '2026-01-31';
      const data = await getActuals(dateFrom, dateTo);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/forecasts/latest' || pathname === '/forecasts/latest') {
      const forecasts = await getForecasts();
      if (!forecasts.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      let maxPt = '';
      forecasts.forEach((f) => {
        if (f.publishTime > maxPt) maxPt = f.publishTime;
      });
      const latest = forecasts.filter((f) => f.publishTime === maxPt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(latest));
      return;
    }

    if (pathname === '/api/forecasts/evolution' || pathname === '/forecasts/evolution') {
      const date = reqUrl.searchParams.get('delivery_date') || '2026-01-15';
      const forecasts = await getForecasts();
      const targetingDate = forecasts.filter((f) => f.startTime.startsWith(date));

      const groups = new Map();
      targetingDate.forEach((f) => {
        if (!groups.has(f.publishTime)) groups.set(f.publishTime, []);
        groups.get(f.publishTime).push(f);
      });

      const result = Array.from(groups.entries())
        .map(([publishTime, list]) => ({ publishTime, forecasts: list }))
        .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime))
        .slice(-5); // Return latest 5 forecast runs

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/accuracy' || pathname === '/accuracy') {
      const data = await computeAccuracy();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Not Found' }));
  } catch (err) {
    console.error('API Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Backend API live at http://localhost:${PORT}`);
});
