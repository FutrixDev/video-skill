#!/bin/zsh
# Render all frames in K parallel Playwright workers and concat. Run from the project root.
# Usage: render_all.sh [K]   (frame count is read from the renderer itself)
set -e; setopt +o nomatch
export NODE_PATH=${NODE_PATH:-/opt/homebrew/lib/node_modules}
K=${1:-4}; mkdir -p out
N=$(node "$(dirname "$0")/render.js" --frames)
echo "frames: $N, workers: $K"
STEP=$(( (N + K - 1) / K ))
rm -f out/part*.mp4 out/parts.txt
for i in $(seq 0 $((K-1))); do
  F=$((i*STEP)); T=$(( (i+1)*STEP )); [ $T -gt $N ] && T=$N
  node "$(dirname "$0")/render.js" --from $F --to $T --out out/part$i.mp4 2> out/part$i.log &
done
wait
for i in $(seq 0 $((K-1))); do echo "file 'part$i.mp4'" >> out/parts.txt; done
ffmpeg -loglevel error -y -f concat -safe 0 -i out/parts.txt -c copy out/video_silent.mp4
echo RENDER_DONE $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/video_silent.mp4)s
