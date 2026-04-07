const CG_BASE = 'https://open-api.coinglass.com/public/v2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { coinglassKey } = req.query;
  if (!coinglassKey) {
    res.status(400).json({ ok: false, error: 'Missing key' });
    return;
  }

  try {
    const response = await fetch(`${CG_BASE}/open_interest?symbol=BTC`, {
      headers: { 'coinglassSecret': coinglassKey }
    });
    const text = await response.text();
    res.status(200).json({ status: response.status, body: text.slice(0, 500) });
  } catch (err) {
    res.status(200).json({ error: err.message });
  }
}
