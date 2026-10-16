#!/usr/bin/env bash
# build-deps.sh <target>: build static zlib (not on macOS, which has a system zlib)
# and dav1d into out/<target>/deps. Targets: mac-arm64 mac-x86_64 win linux.
set -euo pipefail
target="$1"
root="$(cd "$(dirname "$0")/../.." && pwd)"
pins() { node "$root/scripts/ffmpeg/pins.ts" "$1"; }
source "$root/scripts/ffmpeg/flags.sh"

work="$root/out/work/$target"
prefix="$root/out/$target/deps"
sources="$root/out/sources"
rm -rf "$work" "$prefix"
mkdir -p "$work" "$prefix"

zlib_version="$(pins zlib.version)"
dav1d_version="$(pins dav1d.version)"
zlib_tar="$("$root/scripts/ffmpeg/fetch-source.sh" "https://zlib.net/zlib-$zlib_version.tar.gz" "$(pins zlib.sha256)" "$sources")"
dav1d_tar="$("$root/scripts/ffmpeg/fetch-source.sh" "https://downloads.videolan.org/pub/videolan/dav1d/$dav1d_version/dav1d-$dav1d_version.tar.xz" "$(pins dav1d.sha256)" "$sources")"

if [ "$target" = "win" ] || [ "$target" = "linux" ]; then
  tar -xzf "$zlib_tar" -C "$work"
  (
    cd "$work/zlib-$zlib_version"
    if [ "$target" = "win" ]; then
      CHOST=x86_64-w64-mingw32 ./configure --static --prefix="$prefix"
    else
      ./configure --static --prefix="$prefix"
    fi
    make -j"$(getconf _NPROCESSORS_ONLN)" install
  )
fi

tar -xJf "$dav1d_tar" -C "$work"
cross=()
case "$target" in
  mac-arm64)
    export CFLAGS="-arch arm64 -mmacosx-version-min=$MACOS_MIN"
    export LDFLAGS="$CFLAGS"
    ;;
  mac-x86_64)
    cat > "$work/cross.txt" <<CROSS
[binaries]
c = ['clang', '-arch', 'x86_64', '-mmacosx-version-min=$MACOS_MIN']
ar = 'ar'
strip = 'strip'
nasm = 'nasm'

[host_machine]
system = 'darwin'
cpu_family = 'x86_64'
cpu = 'x86_64'
endian = 'little'
CROSS
    cross=(--cross-file "$work/cross.txt")
    ;;
  win)
    cat > "$work/cross.txt" <<CROSS
[binaries]
c = 'x86_64-w64-mingw32-gcc'
ar = 'x86_64-w64-mingw32-ar'
strip = 'x86_64-w64-mingw32-strip'
windres = 'x86_64-w64-mingw32-windres'
nasm = 'nasm'

[host_machine]
system = 'windows'
cpu_family = 'x86_64'
cpu = 'x86_64'
endian = 'little'
CROSS
    cross=(--cross-file "$work/cross.txt")
    ;;
esac

meson setup "$work/dav1d-build" "$work/dav1d-$dav1d_version" \
  ${cross[@]+"${cross[@]}"} \
  --prefix="$prefix" --libdir=lib \
  --default-library=static --buildtype=release \
  -Denable_tools=false -Denable_tests=false -Denable_examples=false
ninja -C "$work/dav1d-build" install
