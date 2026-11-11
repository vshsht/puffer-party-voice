# Voice input for Puffer Party (unofficial)

A browser extension for [Krillion's Puffer Party](https://krillion.io/party): say your answer and it's typed and sent for you. Unofficial and not affiliated with Krillion.

- **Your turn:** anything you say is sent as your answer.
- **Not your turn:** speech is ignored, except a few spoken commands: `start`, `play again`, `rematch`, `next game`, `new table`, `new opponent`, `keep playing`. Leave, report and ban are never voice-controlled.
- **Toggle:** the **MIC** button on the page, or **Alt+V**.

| Browser | Speech engine | Where audio goes |
|---|---|---|
| Chrome | Chrome's built-in speech recognition | Chrome may send it to Google to transcribe |
| Firefox | [Vosk](https://alphacephei.com/vosk/), bundled | Stays on your computer |

Answers are entered as ordinary scripted input. The game's input report records them as `synthetic`, and this extension doesn't hide that. See the [privacy policy](https://vshsht.github.io/puffer-party-voice/privacy).

## Build
```sh
./build.sh
```
This needs `bash`, `curl`, `npm`, `python3`, `shasum` and `zip`. It downloads vosk-browser 0.0.8 from npm and the Vosk model into `vendor/`, checks both against fixed SHA-256 sums, and writes:

- `dist/chrome.zip`: Chrome Web Store upload (built from `chrome/` and `src/`)
- `dist/firefox.zip`: addons.mozilla.org upload (built from `firefox/`, `src/` and the downloaded files)
- `dist/source.zip`: this source, for Firefox's reviewers

To try a build without a store, load `build/chrome` at `chrome://extensions` (Developer mode → Load unpacked) or `build/firefox/manifest.json` at `about:debugging#/runtime/this-firefox` (Load Temporary Add-on).

## Layout
- `src/content.js`: everything on the game page (turn detection, sending answers, commands, mic control). Shared by both builds.
- `firefox/speech-vosk.js`: offline engine for Firefox, shaped like the browser's `SpeechRecognition` API.
- `firefox/engine.html`, `firefox/engine.js`: hidden extension page that runs Vosk. It only accepts connections from krillion.io.
- `tools/extract_worker.py`: turns the worker that vosk.js embeds into a regular file.

Licensed under MIT (see `LICENSE`). Third-party notices are in `NOTICE`.
