#!/usr/bin/env bash
# Shared ffmpeg configure flags: a decoder-only, LGPL build that opens common
# video containers and writes one PNG frame. Every platform uses this list.

# Electron 44 requires macOS 13 (Ventura) or later.
export MACOS_MIN="13.0"

# Commas below separate components inside one flag, not array elements.
# shellcheck disable=SC2054,SC2034
FFMPEG_FLAGS=(
  --disable-everything
  --disable-autodetect
  --disable-doc
  --disable-network
  --disable-debug
  --disable-gpl
  --disable-nonfree
  --enable-static
  --disable-shared
  --disable-ffprobe
  --disable-ffplay
  --enable-ffmpeg
  --enable-protocol=file,pipe
  --enable-demuxer=matroska,mov,avi,mpegts
  --enable-parser=h264,hevc,vp8,vp9,mpeg4video,mpegvideo,av1
  --enable-decoder=h264,hevc,vp8,vp9,mpeg4,mpeg2video,libdav1d
  --enable-libdav1d
  --enable-zlib
  --enable-encoder=png
  --enable-muxer=image2pipe,image2
  --enable-filter=scale,format,null,buffer,buffersink
  --enable-swscale
)
