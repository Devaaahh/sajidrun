"""Prepare game sprites from the original photos.

- runner.png      -> game/assets/runner.png  (dark background removed)
- catcher 1.png   -> game/assets/ashwin.png  (round face badge)
- catcher 2.png   -> game/assets/pranav.png  (round face badge)
- *.mp3           -> copied to game/assets/

Needs Pillow:  pip install pillow
"""
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "game" / "assets"

# Face crop boxes for the catchers: (centre x, centre y, radius) in the source photo.
FACES = {
    "ashwin.png": ("catcher 1.png", 175, 200, 148),
    "pranav.png": ("catcher 2.png", 105, 140, 100),
}

AUDIO = {
    "start.mp3": "starting audio.mp3",
    "run.mp3": "audio between run.mp3",
    "caught.mp3": "audio when catched.mp3",
}


def cut_runner(src: Path, dst: Path) -> None:
    """Flood-fill the dark sticker background from the edges and make it transparent."""
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[0, 0][:3]

    def is_bg(c):
        return c[3] == 0 or sum(abs(c[i] - bg[i]) for i in range(3)) < 45

    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
            continue
        seen[x][y] = True
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    im.crop(im.getbbox()).save(dst)


def face_badge(src: Path, dst: Path, cx: int, cy: int, r: int) -> None:
    im = Image.open(src).convert("RGBA")
    crop = im.crop((cx - r, cy - r, cx + r, cy + r)).resize((256, 256), Image.LANCZOS)
    mask = Image.new("L", (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((8, 8, 248, 248), fill=255)
    out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ImageDraw.Draw(out).ellipse((0, 0, 255, 255), fill=(255, 255, 255, 255))
    out.paste(crop, (0, 0), mask)
    out.save(dst)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cut_runner(ROOT / "runner.png", OUT / "runner.png")
    for name, (src, cx, cy, r) in FACES.items():
        face_badge(ROOT / src, OUT / name, cx, cy, r)
    for name, src in AUDIO.items():
        shutil.copyfile(ROOT / src, OUT / name)
    print("Assets written to", OUT)


if __name__ == "__main__":
    main()
