# Notes for Firefox add-on reviewers

Paste this into "Notes to Reviewer" and upload `dist/source.zip` as the source code.

---

**What it does:** this is a voice-input helper for the word game at https://krillion.io/party. The content script only matches `https://krillion.io/*`. The add-on requests no permissions and makes no network requests other than loading its own packaged files.

**How to build it:** run `./build.sh` from the source zip. It needs bash, curl, npm, python3, shasum and zip. The script fetches the two third-party inputs, checks each one against a fixed SHA-256, and produces `dist/firefox.zip` byte-for-byte.
- `vosk.js`: vosk-browser 0.0.8 from npm (https://www.npmjs.com/package/vosk-browser/v/0.0.8). The original `dist/vosk.js` has SHA-256 `29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c`. Apache-2.0.
- `model.tar.gz`: the Vosk small English model 0.15 from https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz, SHA-256 `f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8`. It's a data file (speech model), not code. Apache-2.0.

**Generated files.** `tools/extract_worker.py` (about 20 lines) processes vosk-browser's `vosk.js`:
- `vosk-worker.js` is the Web Worker that vosk.js embeds as one base64 string, decoded exactly as vosk.js's own `createURL()` does it. We ship it as a file because extension pages may not start workers from `blob:` URLs. SHA-256 `7150f32b…99c04`.
- `vosk.js` in the package is the npm file with only that base64 string emptied. Every other byte is unchanged. That keeps it under the validator's 5 MB parse limit, and the string is unused because `engine.js` starts `vosk-worker.js` instead. SHA-256 `ff2c85bc…6a8b1`.

**Why `'unsafe-eval'` is in the CSP:** the Vosk worker is an Emscripten build of Kaldi/Vosk, and its runtime builds functions with `Function()`. That's the `DANGEROUS_EVAL` warning in `vosk-worker.js`. Without `'unsafe-eval'` the worker fails with "call to Function() blocked by CSP", and speech recognition can't start. No remote or user-supplied strings are ever evaluated. The worker only receives audio samples and the model file. `'wasm-unsafe-eval'` is needed to compile the WebAssembly. The CSP allows no remote sources.

**How the parts fit:**
- `content.js` (our code) watches the game page, types the recognized answer into the answer box and presses send, only when it's the player's turn.
- `speech-vosk.js` (our code) captures the mic in the content script, after the user clicks the extension's MIC button. It streams audio samples over a MessageChannel to the hidden extension page `engine.html`.
- `engine.js` (our code) runs Vosk in that page. It accepts a connection only from `https://krillion.io` (it checks `event.origin`) and sends back recognized text only.
- Recognition is entirely on-device, and no audio or text leaves the browser.

**Testing it:** open https://krillion.io/party/KRLP?preview=rated-round (the game's built-in demo, no account needed) and click the MIC button at the top right. Allow the microphone. The first start takes about 2 seconds to load the model. Say "whipped cream", and the status beside the button shows what was heard and "sent: whipped cream".
