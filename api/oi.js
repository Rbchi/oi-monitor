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
    if (!json.data) return null;
    let totalOiUsd = 0, weightedFR = 0, frWeight = 0, price = 0;
    for (const ex of json.data) {
      const oiUsd = parseFloat(ex.oiUsd || 0);
      totalOiUsd += oiUsd;
      if (ex.price) price = parseFloat(ex.price);
      if (ex.fundingRate !== undefined) {
        weightedFR += parseFloat(ex.fundingRate) * oiUsd;
        frWeight += oiUsd;
      }
    }
    return { symbol, price, oiUsd: totalOiUsd, fundingRate: frWeight > 0 ? weightedFR / frWeight : 0 };
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
    return json.data.map(d => ({ ts: d.t, oiUsd: parseFloat(d.o || d.oiUsd || 0) })).reverse();
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
  if (req.method === 'OPTIONS') { res.status(200).end(); retur


