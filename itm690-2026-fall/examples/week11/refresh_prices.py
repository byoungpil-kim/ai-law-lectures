# -*- coding: utf-8 -*-
"""ETF 시세와 백필용 프록시 시세를 야후 파이낸스에서 받아 asset-manager 캐시 형식으로 저장한다.

사용: python refresh_prices.py [저장 폴더 ...]
  저장 폴더를 주지 않으면 이 파일 옆의 data/prices/ 에 저장한다.
  asset-manager 의 data/prices/ 를 함께 주면 그 앱의 캐시도 같은 내용으로 갱신된다.

형식(asset-manager server/yahoo.ts 와 동일):
  {"ticker","currency","fetchedAt","adj":[[날짜,수정종가],...],"raw":[[날짜,종가],...]}
"""
import json, os, sys, time, urllib.request, datetime as dt

TICKERS = [
    "379800.KS",  # KODEX 미국S&P500
    "411060.KS",  # ACE KRX금현물
    "357870.KS",  # TIGER CD금리투자KIS(합성)
    "456610.KS",  # TIGER 미국달러SOFR금리액티브(합성)
    "^SP500TR",   # 백필: S&P500 총수익
    "GC=F",       # 백필: 국제 금 선물
    "^IRX",       # 백필: 미국 13주 국채 금리 (일할 누적)
    "KRW=X",      # 백필: 원/달러
]

def fetch(ticker):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}"
           "?period1=0&period2=9999999999&interval=1d&events=div%2Csplit")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            j = json.load(urllib.request.urlopen(req, timeout=60))
            break
        except Exception as e:
            if attempt == 2: raise
            time.sleep(2)
    r = j["chart"]["result"][0]
    ts = r["timestamp"]
    close = r["indicators"]["quote"][0].get("close", [])
    adjc = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose", [])
    raw, adj = [], []
    for i, t in enumerate(ts):
        d = dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%d")
        c = close[i] if i < len(close) else None
        if isinstance(c, (int, float)): raw.append([d, c])
        a = adjc[i] if i < len(adjc) and adjc[i] is not None else c
        if isinstance(a, (int, float)): adj.append([d, a])
    if not raw: raise RuntimeError(f"{ticker}: 유효한 종가 없음")
    return {"ticker": ticker, "currency": r.get("meta", {}).get("currency", ""),
            "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "adj": adj, "raw": raw}

def safe_name(t):
    return "".join(ch if (ch.isalnum() or ch in "._^=-") else "_" for ch in t) + ".json"

if __name__ == "__main__":
    import urllib.parse
    here = os.path.dirname(os.path.abspath(__file__))
    outs = sys.argv[1:] or [os.path.join(here, "data", "prices")]
    for o in outs: os.makedirs(o, exist_ok=True)
    for t in TICKERS:
        s = fetch(t)
        txt = json.dumps(s, ensure_ascii=False, separators=(",", ":"))
        for o in outs:
            with open(os.path.join(o, safe_name(t)), "w", encoding="utf-8") as f: f.write(txt)
        print(f"{t:10s} {len(s['raw']):6d} rows  {s['raw'][0][0]} ~ {s['raw'][-1][0]}  last={s['raw'][-1][1]}")
