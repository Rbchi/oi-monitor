const BINANCE_BASE = 'https://fapi.binance.com';

const DEFAULT_SYMBOLS = [
  'BTC','ETH','SOL','BNB','ARB','DOGE','SUI','AVAX',
  'LDO','OP','INJ','TIA','JUP','WLD','PENDLE','ONDO',
  'SEI','APT','NEAR','FTM','ATOM','LINK','UNI','AAVE','1000PEPE','WIF'
];

async function fetchBinanceOI(symbol) {
  const sym = symbol + 'USDT';
  try {
    const [oiRes, priceRes, frRes] = await Promise.all([
      fetch(`${BINANCE_BASE}/fapi/v1/openInterest?symbol=${sym}`),
      fetch(`${BINANCE_BASE}/fapi/v1/ticker/price?symbol=${sym}`),
      fetch(`${BINANCE_BASE}/fapi/v1/fundingRate?symbol=${sym}&limit=1`)
    ]);
    if (!oiRes.ok || !priceRes.ok) return null;
    const [oi, price, fr] = await Promise.all([
      oiRes.json(), priceRes.json(), frRes.ok ? frRes.json() : Promise.resolve([])
    ]);
    return {
      symbol,
      price: parseFloat(price.price),
      oiUsd: parseFloat(oi.openInterest) * parseFloat(price.price),
      fundingRate: fr.length > 0 ? parseFloat(fr[0].fundingRate) : 0,
      ts: Date.now()
    };
  } catch { return null; }
}

async function fetchBinanceOIHistory(symbol) {
  const sym = symbol + 'USDT';
  try {
    const res = await fetch(
      `${BINANCE_BASE}/futures/data/openInterestHist?symbol=${sym}&period=5m&limit=13`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(d => ({ ts: d.timestamp, oiUsd: parseFloat(d.sumOpenInterestValue) }));
  } catch { return []; }
}

function calcChanges(history) {
  if (!history || history.length === 0) return { chg5m:0, chg30m:0, chg1h:0, sparkline:[] };
  const now = history[0]?.oiUsd || 0;
  const get = (idx) => history[idx]?.oiUsd || now;
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
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbols: symParam } = req.query;
  const symbols = symParam
    ? symParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS;

  const targets = symbols.slice(0, 30);

  const [binanceResults, historyResults] = await Promise.all([
    Promise.all(targets.map(s => fetchBinanceOI(s))),
    Promise.all(targets.map(s => fetchBinanceOIHistory(s)))
  ]);

  const combined = targets.map((symbol, i) => {
    const bn = binanceResults[i];
    const hist = historyResults[i];
    if (!bn) return null;
    const changes = calcChanges(hist);
    return {
      symbol,
      price: bn.price,
      oiUsd: bn.oiUsd,
      fundingRate: bn.fundingRate,
      hasCG: false,
      ...changes,
      ts: bn.ts
    };
  }).filter(Boolean);

  res.setHeader('Cache-Control', 's-maxage=30');
  res.status(200).json({ ok: true, data: combined, fetchedAt: Date.now() });
}
