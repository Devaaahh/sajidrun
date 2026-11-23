"""Sajid Run - game server.

Serves the game in ./game and keeps the high-score leaderboard.

Storage:
  * Supabase table `scores` (when SUPABASE_URL and SUPABASE_KEY are set in .env)
  * Excel workbook scores.xlsx - rewritten from the leaderboard after every saved score
  * scores.json - local fallback when Supabase is not configured / unreachable

    python server.py            # then open http://localhost:8000
    python server.py 9000       # use another port
"""
import json
import os
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GAME_DIR = ROOT / "game"
SCORES_JSON = ROOT / "scores.json"
SCORES_XLSX = ROOT / "scores.xlsx"
TOP_N = 10
_lock = threading.Lock()


# ---------------------------------------------------------------- config
def load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_TABLE = os.environ.get("SUPABASE_TABLE", "scores")


# ---------------------------------------------------------------- supabase
def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _supabase(method: str, query: str = "", body=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}{query}",
        method=method,
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read() or b"[]")


def supabase_top(limit: int):
    return _supabase("GET", f"?select=name,score,coins,distance,created_at&order=score.desc&limit={limit}")


def supabase_all():
    return _supabase("GET", "?select=name,score,coins,distance,created_at&order=score.desc&limit=10000")


# ---------------------------------------------------------------- local json
def json_all() -> list:
    try:
        data = json.loads(SCORES_JSON.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def json_add(entry: dict):
    scores = json_all()
    scores.append(entry)
    scores.sort(key=lambda s: s["score"], reverse=True)
    SCORES_JSON.write_text(json.dumps(scores, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- excel
def write_excel(rows: list, source: str):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
    except ImportError:
        print("openpyxl not installed - skipping scores.xlsx (pip install openpyxl)")
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "High Scores"
    ws.append(["Rank", "Name", "Score", "Coins", "Distance (m)", "Date"])
    head_fill = PatternFill("solid", fgColor="FF7A00")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = head_fill
        c.alignment = Alignment(horizontal="center")
    for i, r in enumerate(rows, 1):
        ws.append([i, r.get("name"), r.get("score"), r.get("coins"), r.get("distance"),
                   (r.get("created_at") or "")[:19].replace("T", " ")])
    for col, width in zip("ABCDEF", (7, 20, 12, 10, 14, 22)):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"
    info = wb.create_sheet("Info")
    info.append(["Game", "Sajid Run - can he escape from Pranav and Ashwin?"])
    info.append(["Source", source])
    info.append(["Updated", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    try:
        wb.save(SCORES_XLSX)
    except PermissionError:
        print("scores.xlsx is open in Excel - close it so it can be updated")


# ---------------------------------------------------------------- leaderboard
def get_top() -> list:
    if supabase_enabled():
        try:
            return supabase_top(TOP_N)
        except (urllib.error.URLError, ValueError, OSError) as e:
            print("Supabase read failed, using local scores:", e)
    return json_all()[:TOP_N]


def add_score(entry: dict) -> list:
    with _lock:
        rows, source = None, "local scores.json"
        if supabase_enabled():
            try:
                _supabase("POST", "", entry)
                rows, source = supabase_all(), f"Supabase table '{SUPABASE_TABLE}'"
            except (urllib.error.URLError, ValueError, OSError) as e:
                print("Supabase write failed, saving locally:", e)
        if rows is None:
            json_add(entry)
            rows = json_all()
        write_excel(rows, source)
        return rows[:TOP_N]


# ---------------------------------------------------------------- http
class GameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(GAME_DIR), **kwargs)

    def _json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/scores":
            return self._json(get_top())
        if path == "/api/scores.xlsx":
            if not SCORES_XLSX.exists():
                return self._json({"error": "no scores yet"}, HTTPStatus.NOT_FOUND)
            data = SCORES_XLSX.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type",
                             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", 'attachment; filename="sajid-run-scores.xlsx"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/scores":
            return self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 4096)
            data = json.loads(self.rfile.read(length) or b"{}")
            entry = {
                "name": str(data.get("name", "")).strip()[:16] or "Anonymous",
                "score": max(0, int(data.get("score", 0))),
                "coins": max(0, int(data.get("coins", 0))),
                "distance": max(0, int(data.get("distance", 0))),
                "created_at": datetime.now().isoformat(timespec="seconds"),
            }
        except (ValueError, TypeError):
            return self._json({"error": "bad request"}, HTTPStatus.BAD_REQUEST)
        return self._json(add_score(entry))

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            super().log_message(fmt, *args)


def ensure_assets():
    needed = ["runner.png", "pranav.png", "ashwin.png", "start.mp3", "run.mp3", "caught.mp3"]
    if all((GAME_DIR / "assets" / n).exists() for n in needed):
        return
    print("Preparing game assets...")
    import prepare_assets  # needs Pillow

    prepare_assets.main()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8000
    ensure_assets()
    for p in range(port, port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", p), GameHandler)
            break
        except OSError:
            continue
    else:
        sys.exit("No free port found")
    url = f"http://localhost:{server.server_address[1]}"
    print(f"SAJID RUN is live at {url}  (Ctrl+C to stop)")
    print("High scores ->", f"Supabase ({SUPABASE_URL})" if supabase_enabled() else "scores.json",
          "+ scores.xlsx")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBye!")


if __name__ == "__main__":
    main()
