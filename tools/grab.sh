#!/bin/sh
# 방금 받은 제미나이 그림 하나를 raw/<이름>.png 로 옮긴다 (맥) — 다운로드 폴더의 다른 파일은 건드리지 않는다
d="$(cd "$(dirname "$0")/.." && pwd)"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  f=$(find ~/Downloads -maxdepth 1 -name 'Gemini_Generated_Image_*' -mmin -2 -print0 | xargs -0 ls -t 2>/dev/null | head -1)
  [ -n "$f" ] && break; sleep 2
done
[ -z "$f" ] && { echo none; exit 1; }
mv "$f" "$d/raw/$1.png" && python3 -c "from PIL import Image;im=Image.open('$d/raw/$1.png');print('$1',im.size)"
