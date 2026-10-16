#!/usr/bin/env bash
# fetch-source.sh <url> <sha256> <dest-dir>: download a tarball once, verify it, print its path.
set -euo pipefail
url="$1"
expected="$2"
dest="$3"
mkdir -p "$dest"
file="$dest/$(basename "$url")"
if [ ! -f "$file" ]; then
  curl -fsSL --retry 3 -o "$file.part" "$url"
  mv "$file.part" "$file"
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$file" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$file" | cut -d' ' -f1)"
fi
if [ "$actual" != "$expected" ]; then
  rm -f "$file"
  echo "Checksum mismatch for $url: expected $expected, got $actual" >&2
  exit 1
fi
echo "$file"
