# Note to Krillion's developer (send at launch)

**To:** support@krillion.io
**Subject:** A small voice-input extension for Puffer Party

Hi,

I've really enjoyed Puffer Party with my friends. I made a small browser extension that lets players say their answers instead of typing them, and I've just published it in the Chrome Web Store and Firefox Add-ons (unlisted, so it's only shared by link): https://github.com/vshsht/puffer-party-voice

A few things you might want to know:
- **What it does:** it only acts on the player's own turn, typing what they said into the answer box and pressing send. When it isn't their turn, it can press a few buttons by voice (start, play again, rematch, new table, keep playing). It never touches leave, report or ban.
- **Nothing hidden:** answers go through a normal scripted input event, so your input report records them as `synthetic`. The extension doesn't fake keystrokes or typing rhythm. If you'd like voice answers flagged some other way, I'm happy to change it.
- **Your name:** the extension is clearly labelled unofficial and not affiliated with Krillion. It uses the game's name only to say what it works with.

If you'd rather it didn't exist, would like it treated differently in rated games, or want the wording or name changed, just reply and I'll do that, including taking it down.

Thanks for making the game!
