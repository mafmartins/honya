#!/usr/bin/env bash
# make-clips.sh <dir>: one-second test clips for the smoke test, made with any ffmpeg
# that has the encoders (these clips are never shipped).
set -euo pipefail
export SVT_LOG=1
dir="$1"
mkdir -p "$dir"
src=(-y -hide_banner -loglevel error -f lavfi -i testsrc2=size=320x240:rate=24 -t 1)
ffmpeg "${src[@]}" -c:v libx264 -pix_fmt yuv420p "$dir/h264.mp4"
ffmpeg "${src[@]}" -c:v libx265 -pix_fmt yuv420p10le -x265-params log-level=error "$dir/hevc10.mkv"
ffmpeg "${src[@]}" -c:v libvpx-vp9 -b:v 200k "$dir/vp9.webm"
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
  ffmpeg "${src[@]}" -c:v libsvtav1 -preset 12 "$dir/av1.mkv"
else
  ffmpeg "${src[@]}" -c:v libaom-av1 -cpu-used 8 -b:v 200k "$dir/av1.mkv"
fi
ffmpeg "${src[@]}" -c:v mpeg4 "$dir/mpeg4.avi"
ffmpeg "${src[@]}" -c:v mpeg2video "$dir/mpeg2.ts"
ls "$dir"
