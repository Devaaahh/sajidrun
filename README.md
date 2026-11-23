# SAJID RUN
*Can he escape from Pranav and Ashwin?*

A lane-runner game through an imaginary college. Sajid runs, and Pranav and Ashwin chase him.

## Run it
```powershell
pip install -r requirements.txt
python server.py
```
Your browser opens at http://localhost:8000.

## Controls
| Action | Keyboard | Phone |
|---|---|---|
| Change lane | ← → or A D | swipe left/right |
| Jump (over EXAMS hurdles, desks) | ↑, W or Space | swipe up |
| Slide (under banners) | ↓ or S | swipe down |
| Pause / Mute | P / M | buttons at top right |

Switch lanes to get around college buses. If you clip the side of an obstacle, Pranav and Ashwin catch up with you. Stumble again while they're close and you're caught. Grab the 🧲 magnet to pull in coins.

## Audio
| File | When it plays |
|---|---|
| `starting audio.mp3` | when a run starts |
| `audio between run.mp3` | loops while running |
| `audio when catched.mp3` | when Sajid is caught |

## High scores: Supabase + Excel
After every saved score, the server rewrites **`scores.xlsx`** with the full leaderboard. You can also download it from the in-game *High scores → Download Excel* link.

To store scores in **Supabase**:
1. Create a project at supabase.com.
2. Open SQL Editor, paste `supabase_setup.sql` and run it.
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_KEY` (Project Settings → API, anon key).
4. Restart `python server.py`. Scores now go to Supabase, and `scores.xlsx` is rebuilt from the Supabase table.

Without `.env`, scores are kept in `scores.json` and `scores.xlsx` is still updated.

## Files
- `server.py`: Python server for the game, the score API, Supabase sync and the Excel export
- `prepare_assets.py`: cuts the runner out of his photo, makes round face badges for the catchers, and copies the audio into `game/assets`
- `game/index.html`, `game/style.css`, `game/game.js`: the game (three.js)

To change who's who, edit `FACES` in `prepare_assets.py`, then run `python prepare_assets.py`.
