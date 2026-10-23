"""그림 카드(J·Q·K) 가운데 판을 만든다 — 트럼프처럼 인물 윗몸을 위아래로 뒤집어 붙인다. 조커는 한 사람 그대로.
    python3 tools/build_court.py      (raw/ct_*.png → public/img/court_*.webp)
"""
from PIL import Image, ImageDraw
W, H = 420, 640          # 판 크기 (카드 안쪽 틀 비율 ≈ 2:3)
HALF = H // 2

def trim(im):
    return im.crop(im.getbbox())

for k in 'JQK':
    fig = trim(Image.open(f'raw/ct_{k}.png').convert('RGBA'))
    # 머리부터 허리 언저리까지 — 판 반쪽 높이에 맞춰 너비를 정한다
    sc = min((W * 0.98) / fig.width, (HALF - 6) / (fig.height * 0.52))
    f = fig.resize((round(fig.width * sc), round(fig.height * sc)), Image.LANCZOS)
    top = f.crop((0, 0, f.width, min(f.height, HALF)))
    half = Image.new('RGBA', (W, HALF), (0, 0, 0, 0))
    half.paste(top, ((W - top.width) // 2, 6), top)
    can = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    can.paste(half, (0, 0), half)
    bot = half.rotate(180)
    can.paste(bot, (0, HALF), bot)
    d = ImageDraw.Draw(can)
    d.line([(10, HALF), (W - 10, HALF)], fill=(150, 112, 40, 255), width=3)
    can.save(f'public/img/court_{k}.webp', quality=86, method=6)
    print(k, can.size)

fig = trim(Image.open('raw/ct_X.png').convert('RGBA'))
sc = min((W * 0.96) / fig.width, (H * 0.96) / fig.height)
f = fig.resize((round(fig.width * sc), round(fig.height * sc)), Image.LANCZOS)
can = Image.new('RGBA', (W, H), (0, 0, 0, 0))
can.paste(f, ((W - f.width) // 2, H - f.height), f)
can.save('public/img/court_X.webp', quality=86, method=6)
print('X', can.size)

# 계급 얼굴 — 자리 · 대기실에 쓰는 작은 그림
for n in ['king', 'rich', 'mid', 'poor', 'beggar']:
    im = trim(Image.open(f'raw/rk_{n}.png').convert('RGBA'))
    sc = 360 / max(im.size)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    can = Image.new('RGBA', (360, 360), (0, 0, 0, 0))
    can.paste(im, ((360 - im.width) // 2, 360 - im.height), im)
    can.save(f'public/img/rk_{n}.webp', quality=86, method=6)
