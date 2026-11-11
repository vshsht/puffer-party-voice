# Store listing text

Use the same text in both stores unless noted. Visibility: **Unlisted** in Chrome, **On your own** (self-distributed) in Firefox.

## Name
Voice input for Puffer Party (unofficial)

## Short description (Chrome summary, max 132 characters)
Say your answers in Krillion's Puffer Party instead of typing them. Unofficial; not affiliated with Krillion.

## Full description
Play Krillion's Puffer Party with your voice. When it's your turn, say your answer and the extension types it into the game and sends it.

How it works
• Turn it on with the MIC button at the top of the game, or press Alt+V.
• On your turn, whatever you say is sent as your answer. Multi-word answers like "flying squirrel" work.
• When it isn't your turn, talking is ignored, so you can chat with people around you. A few spoken commands still work: "start", "play again", "rematch", "next game", "new table", "new opponent", "keep playing". Leave, report and ban are never voice-controlled.

Privacy
• The extension only runs on krillion.io, only listens after you turn it on, and collects nothing.
• Chrome: speech is recognized by Chrome's built-in service, which may send audio to Google.
• Firefox: speech is recognized on your computer by the bundled Vosk engine, so audio never leaves your device.

Good to know
• English only for now.
• The game can tell answers weren't typed key by key: its input report marks them as scripted (synthetic). The extension doesn't hide that.
• This is an unofficial project. It isn't affiliated with, endorsed by or sponsored by Krillion.

Source code and privacy policy: https://github.com/vshsht/puffer-party-voice

## Category
Chrome: Accessibility (alternatively Fun). Firefox: Games & Entertainment.

## Images (in this folder)
- Icon: `assets/icon128.png` (128×128)
- Screenshots (1280×800): `screenshot-1-your-turn.png`, `screenshot-2-lobby.png`. Both were taken on the game's own preview pages, which use demo players.
- Chrome small promo tile (440×280): `promo-tile-440x280.png`

## Links
- Homepage / support: https://github.com/vshsht/puffer-party-voice
- Privacy policy: https://vshsht.github.io/puffer-party-voice/privacy

## Chrome Web Store "Privacy practices" tab
- **Single purpose:** Lets players enter answers in Krillion's Puffer Party by voice instead of typing.
- **Permissions:** The extension requests no API permissions. Its content script runs only on https://krillion.io/* to read whether it's the player's turn, fill in the answer box and press the game's send button.
- **Remote code:** No. All code is in the package.
- **Data usage:** collects none of the listed data types. Leave every box unticked.
- **Certifications:** tick all three (no selling or transfer of data, no use unrelated to the single purpose, no use for creditworthiness or lending).
- **Note on the microphone:** speech recognition is done by Chrome's built-in Web Speech API. The extension never receives or transmits audio. This is stated in the privacy policy.

## Firefox "Data collection" answer
The manifest declares `data_collection_permissions: none`. The extension doesn't collect or transmit data.
