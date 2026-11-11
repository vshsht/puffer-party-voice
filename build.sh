#!/usr/bin/env bash
# Builds both extensions from this repo.
#   dist/chrome.zip   Chrome Web Store upload
#   dist/firefox.zip  addons.mozilla.org upload
#   dist/source.zip   source for Firefox's reviewers
# Needs: bash, curl, npm, python3, shasum, zip. Third-party files are downloaded
# into vendor/ and checked against fixed SHA-256 sums, so every build is identical.
set -euo pipefail
cd "$(dirname "$0")"

VOSK_VERSION="0.0.8"
VOSK_JS_SHA="29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c"
WORKER_SHA="7150f32b072e067a087830ba83a9904b8d0feab7ee1393135e4d32033ee99c04"
SLIM_VOSK_JS_SHA="ff2c85bcba0997588c5ef6504f8455f6a80b5bb7ef06afcfb6ac38dfeca6a8b1" # vosk.js with its unused embedded worker removed
MODEL_URL="https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz"
MODEL_SHA="f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8"

check() { # file expected-sha256
  local actual
  actual=$(shasum -a 256 "$1" | awk '{print $1}')
  if [ "$actual" != "$2" ]; then
    echo "checksum mismatch for $1: got $actual, expected $2" >&2
    exit 1
  fi
}

mkdir -p vendor
if [ ! -f vendor/vosk.js ]; then
  echo "Fetching vosk-browser@$VOSK_VERSION from npm"
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack "vosk-browser@$VOSK_VERSION" --silent >/dev/null && tar xzf "vosk-browser-$VOSK_VERSION.tgz")
  cp "$tmp/package/dist/vosk.js" vendor/vosk.js
  rm -rf "$tmp"
fi
check vendor/vosk.js "$VOSK_JS_SHA"

if [ ! -f vendor/model.tar.gz ]; then
  echo "Fetching the Vosk small English model"
  curl -fsSL -o vendor/model.tar.gz.part "$MODEL_URL"
  mv vendor/model.tar.gz.part vendor/model.tar.gz
fi
check vendor/model.tar.gz "$MODEL_SHA"

rm -rf build dist
mkdir -p build/chrome build/firefox dist

cp chrome/manifest.json src/content.js assets/icon128.png build/chrome/

cp firefox/manifest.json firefox/engine.html firefox/engine.js firefox/speech-vosk.js \
   src/content.js assets/icon128.png build/firefox/
cp vendor/model.tar.gz build/firefox/
python3 tools/extract_worker.py vendor/vosk.js build/firefox/vosk-worker.js build/firefox/vosk.js
check build/firefox/vosk-worker.js "$WORKER_SHA"
check build/firefox/vosk.js "$SLIM_VOSK_JS_SHA"

(cd build/chrome && zip -qrX ../../dist/chrome.zip .)
(cd build/firefox && zip -qrX ../../dist/firefox.zip .)
zip -qrX dist/source.zip build.sh README.md LICENSE NOTICE .gitignore src chrome firefox assets tools docs store

echo "Built:"
ls -l dist | awk 'NR > 1 {printf "  %-12s %s bytes\n", $9, $5}'
