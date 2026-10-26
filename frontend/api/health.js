export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.status(200).json({ status: 'ok', service: 'wind-energy-forecast-api', version: '1.0.0' });
}
