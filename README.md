# OI Monitor — 合約 OI 監控系統

即時監控全市場合約未平倉量（OI），整合 Binance Futures + Coinglass API，並支援 Telegram Bot 警報推送。

## 功能

- **多時間框架 OI 變化**：5分鐘、30分鐘、1小時
- **全市場彙總**：一次監控 30 個幣種
- **Coinglass 整合**：有 Key 時顯示全市場所有交易所彙總 OI（而非只有 Binance）
- **四大警報觸發條件**：
  - OI 5分鐘暴增/暴跌 > X%
  - OI 1小時累積變化 > X%
  - 資金費率極端（極端正/負）
  - OI/價格背離訊號
- **Telegram Bot 即時推送**
- **本地 localStorage 記憶設定**（重開頁面不需重填）

---

## 部署到 Vercel（5分鐘）

### 1. 上傳到 GitHub

```bash
git init
git add .
git commit -m "init oi monitor"
# 在 GitHub 建立 repo，然後：
git remote add origin https://github.com/你的帳號/oi-monitor.git
git push -u origin main
```

### 2. 連接 Vercel

1. 前往 https://vercel.com → Import Project
2. 選擇你的 GitHub repo
3. 不需要任何環境變數設定（API Key 從前端填入）
4. 點 Deploy

部署完成後會拿到一個 `https://oi-monitor-xxx.vercel.app` 的網址。

---

## Telegram Bot 設定

1. 在 Telegram 搜尋 `@BotFather`
2. 發送 `/newbot`，取得 **Bot Token**（格式：`123456789:AAA...`）
3. 取得 Chat ID：
   - 把 bot 加入你的群組或頻道
   - 發送任意訊息後，前往：`https://api.telegram.org/bot{TOKEN}/getUpdates`
   - 找到 `chat.id`（群組通常是負數，如 `-100123456789`）
4. 將 Bot Token 和 Chat ID 填入左側欄，點「測試發送」

---

## Coinglass API Key

免費版：https://www.coinglass.com/zh/pricing  
取得 Key 後填入左側欄「Coinglass API Key」欄位。

有 Key 時：顯示全市場（Binance + OKX + Bybit + ...）彙總 OI，標記 `CG` 徽章。  
無 Key 時：僅顯示 Binance Futures 的 OI，仍可正常使用。

---

## 本地開發

需要 Node.js 18+：

```bash
npm install -g vercel
vercel dev   # 本地啟動，含 serverless functions
```

瀏覽器開啟 http://localhost:3000

---

## 架構說明

```
oi-monitor/
├── index.html          # 主 Dashboard（純 HTML/CSS/JS）
├── api/
│   ├── oi.js           # Serverless Function：代理 Binance + Coinglass
│   └── alert.js        # Serverless Function：推送 Telegram 通知
├── vercel.json         # Vercel routing 設定
└── package.json
```

### 為什麼需要 Serverless Function？
瀏覽器直接呼叫 Coinglass API 會遇到 CORS 錯誤。  
`api/oi.js` 作為中間層，在伺服器端呼叫 API，再回傳給前端。

### OI 歷史計算方式
使用 Binance `openInterestHist?period=5m&limit=13`：
- idx 1 = 5分鐘前的 OI
- idx 6 = 30分鐘前的 OI  
- idx 12 = 60分鐘前的 OI

計算公式：`(現在 - 過去) / 過去 × 100%`

---

## 警報邏輯

| 條件 | 說明 |
|------|------|
| OI 5分鐘暴變 | `abs(chg5m) >= 閾值` |
| OI 1小時累積 | `abs(chg1h) >= 閾值` |
| 資金費率極端 | `abs(fundingRate) >= 閾值` |
| OI/價格背離 | OI 1H > +2% 且 OI 30M < -1%（短線反向）或反之 |

每次 fetch 週期內，同一幣種同一條件只觸發一次（去重）。  
多個警報會合併成一條 Telegram 訊息發送。
