// api/oi.js — Vercel Serverless Function
// Proxies Coinglass + Binance OI data to avoid CORS issues

const BINANCE_BASE = 'https://fapi.binance.com';
const COINGLASS_BASE = 'https://open-api.coinglass.com/public/v2';

// Top symbols to monitor by default
const DEFAULT_SYMBOLS = [
  'BTC','ETH','SOL','BNB','ARB','DOGE','SUI','AVAX',
  'LDO','OP','INJ','TIA','JUP','WLD','PENDLE','ONDO',
  'SEI','APT','NEAR','FTM','ATOM','LINK','UNI','AAVE',
  'MKR','SNX','CRV','1000PEPE','WIF','BONK'
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
      oiRes.json(),
      priceRes.json(),
      frRes.ok ? frRes.json() : Promise.resolve([])
    ]);

    return {
      symbol,
      exchange: 'Binance',
      oi: parseFloat(oi.openInterest),
      oiUsd: parseFloat(oi.openInterest) * parseFloat(price.price),
      price: parseFloat(price.price),
      fundingRate: fr.length > 0 ? parseFloat(fr[0].fundingRate) : 0,
      ts: Date.now()
    };
  } catch {
    return null;
  }
}

async function fetchBinanceOIHistory(symbol, period = '5m', limit = 13) {
  // limit=13 gives us: now, -5m, -10m... enough to calc 5m/30m/1h changes
  const sym = symbol + 'USDT';
  try {
    const res = await fetch(
      `${BINANCE_BASE}/futures/data/openInterestHist?symbol=${sym}&period=${period}&limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(d => ({
      ts: d.timestamp,
      oi: parseFloat(d.sumOpenInterest),
      oiUsd: parseFloat(d.sumOpenInterestValue)
    }));
  } catch {
    return [];
  }
}

async function fetchCoinglassOI(symbol, apiKey) {
  try {
    const res = await fetch(
      `${COINGLASS_BASE}/open_interest?symbol=${symbol}`,
      { headers: { 'coinglassSecret': apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data) return null;

    // Aggregate across all exchanges
    const exchanges = data.data;
    let totalOiUsd = 0;
    let weightedFR = 0;
    let frWeight = 0;
    const exchangeBreakdown = [];

    for (const ex of exchanges) {
      const oiUsd = parseFloat(ex.oiUsd || 0);
      totalOiUsd += oiUsd;
      if (ex.fundingRate !== undefined) {
        weightedFR += parseFloat(ex.fundingRate) * oiUsd;
        frWeight += oiUsd;
      }
      exchangeBreakdown.push({
        exchange: ex.exchangeName,
        oiUsd,
        fundingRate: parseFloat(ex.fundingRate || 0)
      });
    }

    return {
      symbol,
      source: 'coinglass',
      oiUsd: totalOiUsd,
      fundingRate: frWeight > 0 ? weightedFR / frWeight : 0,
      exchanges: exchangeBreakdown.sort((a,b) => b.oiUsd - a.oiUsd).slice(0, 6)
    };
  } catch {
    return null;
  }
}

function calcChanges(history) {
  // history is newest-first from Binance
  if (!history || history.length === 0) return { chg5m: 0, chg30m: 0, chg1h: 0, sparkline: [] };

  const now = history[0]?.oiUsd || 0;
  const get = (idx) => history[idx]?.oiUsd || now;

  const chg = (old) => old === 0 ? 0 : ((now - old) / old) * 100;

  // 5m period history: idx 1 = 5m ago, idx 6 = 30m ago, idx 12 = 1h ago
  return {
    chg5m:  parseFloat(chg(get(1)).toFixed(3)),
    chg30m: parseFloat(chg(get(6)).toFixed(3)),
    chg1h:  parseFloat(chg(get(12)).toFixed(3)),
    sparkline: history.slice(0, 13).reverse().map(d => d.oiUsd)
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.status(200).end();
    return;
  }

  const { symbols: symParam, coinglassKey } = req.query;
  const symbols = symParam ? symParam.split(',') : DEFAULT_SYMBOLS;

  // Fetch all in parallel — cap at 30 to avoid timeout
  const targets = symbols.slice(0, 30);

  const [binanceResults, historyResults] = await Promise.all([
    Promise.all(targets.map(s => fetchBinanceOI(s))),
    Promise.all(targets.map(s => fetchBinanceOIHistory(s, '5m', 13)))
  ]);

  // If Coinglass key provided, fetch aggregate OI
  let coinglassMap = {};
  if (coinglassKey && coinglassKey.length > 10) {
    const cgResults = await Promise.all(
      targets.map(s => fetchCoinglassOI(s, coinglassKey))
    );
    targets.forEach((s, i) => {
      if (cgResults[i]) coinglassMap[s] = cgResults[i];
    });
  }

  const combined = targets.map((symbol, i) => {
    const bn = binanceResults[i];
    const hist = historyResults[i];
    const cg = coinglassMap[symbol];
    const changes = calcChanges(hist);

    if (!bn) return null;

    return {
      symbol,
      price: bn.price,
      // Use Coinglass total OI if available, else Binance only
      oiUsd: cg ? cg.oiUsd : bn.oiUsd,
      oiBinance: bn.oiUsd,
      fundingRate: cg ? cg.fundingRate : bn.fundingRate,
      ...changes,
      exchanges: cg?.exchanges || [{ exchange: 'Binance', oiUsd: bn.oiUsd }],
      hasCG: !!cg,
      ts: bn.ts
    };
  }).filter(Boolean);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');
  res.status(200).json({ ok: true, data: combined, fetchedAt: Date.now() });
}
