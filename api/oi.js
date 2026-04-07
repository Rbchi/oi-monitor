const CG_BASE = 'https://open-api.coinglass.com/public/v2';

const DEFAULT_SYMBOLS = [
  'BTC','ETH','SOL','BNB','ARB','DOGE','SUI','AVAX',
  'LDO','OP','INJ','TIA','JUP','WLD','PENDLE','ONDO',
  'SEI','APT','NEAR','FTM','ATOM','LINK','UNI','AAVE','PEPE','WIF'
];

async function fetchCGOI(symbol, apiKey) {
  try {
    const res = await fetch(`${CG_BASE}/open_interest?symbol=${symbol}`, {
      headers: { 'coinglassSecret': apiKey }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) return null;

    const d = json.data[0];
    return {
      symbol,
      price: parseFloat(d.price || 0),
      oiUsd: parseFloat(d.openInterest || 0),
      fundingRate: parseFloat(d.avgFundingRateBySymbol || 0)
    };
  } catch { return null; }
}

async function fetchCGOIHistory(symbol, apiKey) {
  try {
    const res = await fetch(
      `${CG_BASE}/open_interest_history?symbol=${symbol}&interval=5m&limit=13`,
      { headers: { 'coinglassSecret': apiKey } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.data) return [];
    const list = json.data.dateList
      ? json.data.dateList.map((t, i) => ({ ts: t, oiUsd: parseFloat(json.data.dataMap?.all?.[i] || 0) }))
      : json.data.map(d => ({ ts: d.t || d.time, oiUsd: parseFloat(d.o || d.openInterest || d.oiUsd || 0) }));
    return list.reverse();
  } catch { return []; }
}

function calcChanges(history) {
  if (!history || history.length < 2) return { chg5m:0, chg30m:0, chg1h:0, sparkline:[] };
  const now = history[0]?.oiUsd || 0;
  const get = (idx) => history[Math.min(idx, history.length-1)]?.oiUsd || now;
  const chg = (old) => old === 0 ? 0 : ((now - old) / old) * 100;
  return {
    chg5m:  parseFloat(chg(get(1)).toFixed(3)),
    chg30m: parseFloat(chg(get(6)).toFixed(3)),
    chg1h:  parseFloat(chg(get(12)).toFixed(3)),
    sparkline: history.slice(0,13).reverse().map(d => d.oiUsd)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbols: symParam, coinglassKey } = req.query;
  const apiKey = coinglassKey || process.env.COINGLASS_KEY || '';

  if (!apiKey) {
    res.status(400).json({ ok: false, error: 'Missing Coinglass API key' });
    return;
  }

  const symbols = symParam
    ? symParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  const targets = symbols.slice(0, 30);

  const results = await Promise.all(
    targets.map(async s => {
      const [oi, hist] = await Promise.all([
        fetchCGOI(s, apiKey),
        fetchCGOIHistory(s, apiKey)
      ]);
      if (!oi) return null;
      const changes = calcChanges(hist);
      return { symbol: s, price: oi.price, oiUsd: oi.oiUsd, fundingRate: oi.fundingRate, hasCG: true, ...changes, ts: Date.now() };
    })
  );

  const combined = results.filter(Boolean).filter(r => r.oiUsd > 0);
  res.setHeader('Cache-Control', 's-maxage=30');
  res.status(200).json({ ok: true, data: combined, fetchedAt: Date.now() });
}
