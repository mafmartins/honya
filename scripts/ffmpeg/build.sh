#!/usr/bin/env bash
# build.sh <target>: build ffmpeg for mac-arm64, mac-x86_64, win or linux into
# out/<target>/ffmpeg[.exe], with the configure line in out/<target>/configure-line.txt.
set -euo pipefail
target="$1"
root="$(cd "$(dirname "$0")/../.." && pwd)"
pins() { node "$root/scripts/ffmpeg/pins.ts" "$1"; }
source "$root/scripts/ffmpeg/flags.sh"

"$root/scripts/ffmpeg/build-deps.sh" "$target"
unset CFLAGS LDFLAGS

work="$root/out/work/$target"
prefix="$root/out/$target/deps"
version="$(pins ffmpeg.version)"
tarball="$("$root/scripts/ffmpeg/fetch-source.sh" "https://ffmpeg.org/releases/ffmpeg-$version.tar.xz" "$(pins ffmpeg.sha256)" "$root/out/sources")"
tar -xJf "$tarball" -C "$work"

export PKG_CONFIG_PATH="$prefix/lib/pkgconfig"
args=("${FFMPEG_FLAGS[@]}" --prefix="$prefix" --pkg-config-flags=--static)
binary="ffmpeg"
case "$target" in
  mac-arm64)
    args+=(--arch=arm64 --extra-cflags="-arch arm64 -mmacosx-version-min=$MACOS_MIN" --extra-ldflags="-arch arm64 -mmacosx-version-min=$MACOS_MIN")
    ;;
  mac-x86_64)
    args+=(--arch=x86_64 --target-os=darwin --enable-cross-compile --cc="clang -arch x86_64" --extra-cflags="-mmacosx-version-min=$MACOS_MIN" --extra-ldflags="-mmacosx-version-min=$MACOS_MIN")
    ;;
  win)
    args+=(--target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32- --pkg-config=pkg-config --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static")
    binary="ffmpeg.exe"
    ;;
  linux)
    args+=(--extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static")
    ;;
  *)
    echo "Unknown target: $target" >&2
    exit 2
    ;;
esac

(
  cd "$work/ffmpeg-$version"
  ./configure "${args[@]}"
  make -j"$(getconf _NPROCESSORS_ONLN)" "$binary"
  cp "$binary" "$root/out/$target/$binary"
)
printf '%s\n' "./configure ${args[*]}" > "$root/out/$target/configure-line.txt"
echo "Built $root/out/$target/$binary"
