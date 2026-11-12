# -*- coding: utf-8 -*-
"""스냅샷 JSON의 탭을 구글 시트(원장)에 추가한다. 서비스 계정 키로 Sheets API를 쓴다.

사용: python add_sheet_tabs.py data/snapshots-2026-09-to-11.json
  - 시트 ID는 .env 의 PORTFOLIO_SHEET(주소 또는 ID)에서 읽는다.
  - 서비스 계정 키는 GOOGLE_APPLICATION_CREDENTIALS 경로, 없으면 C:/claude/asset-manager/secrets/ 의 첫 서비스 계정 JSON.
  - 같은 이름의 탭이 이미 있으면 건너뛴다.
"""
import json, os, re, sys, time, glob
import jwt, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))

def load_env():
    p = os.path.join(HERE, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m and m.group(1) not in os.environ: os.environ[m.group(1)] = m.group(2).strip().strip('"\'')

def sheet_id():
    v = os.environ.get("PORTFOLIO_SHEET", "")
    m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", v)
    return m.group(1) if m else v

def service_account():
    cand = [os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")] if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") else []
    cand += sorted(glob.glob("C:/claude/asset-manager/secrets/*.json"))
    for p in cand:
        try:
            j = json.load(open(p, encoding="utf-8"))
            if j.get("type") == "service_account" and j.get("client_email") and j.get("private_key"): return j
        except Exception: pass
    raise SystemExit("서비스 계정 키를 찾지 못했다")

def token(acc):
    now = int(time.time())
    claim = {"iss": acc["client_email"], "scope": "https://www.googleapis.com/auth/spreadsheets",
             "aud": "https://oauth2.googleapis.com/token", "exp": now + 3600, "iat": now}
    assertion = jwt.encode(claim, acc["private_key"], algorithm="RS256")
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode()
    r = json.load(urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), timeout=30))
    return r["access_token"], acc["client_email"]

def api(tok, method, path, payload=None):
    req = urllib.request.Request("https://sheets.googleapis.com/v4/spreadsheets/" + path, method=method,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} {method} {path}: {e.read()[:400]}")

if __name__ == "__main__":
    load_env()
    sid = sheet_id()
    snaps = json.load(open(sys.argv[1], encoding="utf-8"))
    tok, email = token(service_account())
    print("서비스 계정:", email, "| 시트:", sid)
    meta = api(tok, "GET", f"{sid}?fields=sheets.properties.title")
    existing = [s["properties"]["title"] for s in meta["sheets"]]
    print("기존 탭:", existing)
    todo = [s for s in snaps if s["tabName"] not in existing]
    if not todo: print("추가할 탭 없음"); sys.exit(0)
    api(tok, "POST", f"{sid}:batchUpdate", {"requests": [{"addSheet": {"properties": {"title": s["tabName"]}}} for s in todo]})
    data = []
    for s in todo:
        rows = [["종목명", "종목코드", "보유량", "평균매입가"]] + [[h["name"], h["code"], h["quantity"], h["avgPrice"]] for h in s["holdings"]]
        data.append({"range": f"'{s['tabName']}'!A1:D{len(rows)}", "values": rows})
    api(tok, "POST", f"{sid}/values:batchUpdate", {"valueInputOption": "RAW", "data": data})
    for s in todo:
        got = api(tok, "GET", f"{sid}/values/{urllib.parse.quote(s['tabName'])}!A1:D5")
        print("추가됨:", s["tabName"], got.get("values"))
