// Puffer Party Voice: turns speech into answers in Krillion's Puffer Party.
// Text is entered as an ordinary scripted input event. The game's input report
// counts it as `synthetic`, and this extension deliberately leaves that accurate.
(() => {
  "use strict";

  const TURN_PLACEHOLDER = "your puffer";
  // Treat an unchanged interim phrase as finished after this much silence.
  // A lone word waits longer, since it may be the start of "toy story 3".
  const SILENCE_FLUSH_MS = 700;
  const SILENCE_FLUSH_ONE_WORD_MS = 1000;
  const SEND_WAIT_MS = 1500; // SEND stays disabled while an earlier answer awaits the server
  const RESTART_DELAY_MS = 150;

  // Only buttons that move the game forward. Leave, report and ban stay manual.
  const COMMANDS = [
    { say: /^(start|start (the )?game|wake (up )?(the )?puffer)$/, button: /WAKE THE PUFFER/ },
    { say: /^(play again|again|rematch|next game|join next game)$/, button: /^(PLAY AGAIN|REMATCH|JOIN NEXT GAME)$/ },
    { say: /^(new table|new opponent)$/, button: /^(NEW TABLE|NEW OPPONENT)$/ },
    { say: /^keep playing$/, button: /^KEEP PLAYING$/ },
  ];

  // PufferOfflineSpeech only exists in the Firefox build (speech-vosk.js). It goes
  // first there: Firefox's own engine shows nothing until you stop talking, while
  // Vosk streams words as you speak, so answers arrive sooner.
  const SpeechRecognition =
    window.PufferOfflineSpeech || window.SpeechRecognition || window.webkitSpeechRecognition;

  let listening = false;
  let recognition = null;
  let lastFinalIndex = -1; // last final result processed in this session
  let utteranceSent = ""; // what a silence flush already sent for the current utterance
  let flushTimer = null;
  let sending = false;
  let pendingText = null; // newest phrase that arrived during a send
  let pendingStart = null; // a mic start still preparing its engine

  // ---------- game page ----------

  const answerInput = () => document.querySelector('input[aria-label="Your answer"]');
  const sendButton = () => document.querySelector('button[aria-label="Send answer"]');

  function isMyTurn() {
    const input = answerInput();
    return !!input && !input.disabled && input.placeholder.includes(TURN_PLACEHOLDER);
  }

  function setAnswerText(input, text) {
    // React ignores a plain `.value =` unless it goes through the native setter.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function waitForSendEnabled() {
    return new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        const button = sendButton();
        if (button && !button.disabled) return resolve(button);
        if (!isMyTurn() || performance.now() - started > SEND_WAIT_MS) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async function submitAnswer(text) {
    if (sending) {
      pendingText = text;
      return;
    }
    const input = answerInput();
    if (!input) return;
    sending = true;
    try {
      const entered = text.slice(0, input.maxLength > 0 ? input.maxLength : 60);
      setAnswerText(input, entered);
      const button = await waitForSendEnabled();
      if (button && isMyTurn()) {
        button.click();
        setStatus(`sent: ${text}`);
      } else {
        // The turn moved on while waiting, so don't leave stale text in the box.
        if (input.value === entered) setAnswerText(input, "");
        setStatus(`couldn't send: ${text}`);
      }
    } finally {
      sending = false;
    }
    if (pendingText !== null) {
      const next = pendingText;
      pendingText = null;
      if (isMyTurn()) submitAnswer(next);
    }
  }

  function runCommand(spoken) {
    const command = COMMANDS.find((c) => c.say.test(spoken));
    if (!command) return false;
    const button = [...document.querySelectorAll("button")].find(
      (b) => !b.disabled && b.offsetParent !== null && command.button.test(b.textContent.trim())
    );
    if (!button) return false;
    button.click();
    setStatus(`pressed: ${button.textContent.trim()}`);
    return true;
  }

  // On your turn everything is an answer, so an answer like "start" can't press
  // a button. Off-turn speech is dropped unless it is a command, so talking to
  // people in the room never reaches the game.
  const cleanPhrase = (raw) => raw.trim().replace(/[.,!?;:]+$/, "").trim();
  const phraseKey = (raw) => raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

  function handlePhrase(raw) {
    const text = cleanPhrase(raw);
    if (!text) return;
    if (isMyTurn()) {
      submitAnswer(text);
    } else if (!runCommand(text.toLowerCase())) {
      setStatus(`not your turn, ignored: ${text}`);
    }
  }

  // ---------- speech ----------

  function clearFlush() {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Browsers with the newer API say whether a language works and whether its
  // model is already on this computer. Firefox only recognizes on-device, and
  // only after a one-time model download that must start from a click or key
  // press, which is why this runs at the start of the mic toggle.
  async function prepareEngine(Engine, lang) {
    if (typeof Engine.available !== "function") return { lang, processLocally: false };
    const check = (langs, processLocally) =>
      Engine.available({ langs, processLocally }).catch(() => "unavailable");

    if ((await check([lang], false)) === "available") return { lang, processLocally: false };
    let local = await check([lang], true);
    if (local === "unavailable" && lang !== "en-US") {
      lang = "en-US";
      if ((await check([lang], false)) === "available") return { lang, processLocally: false };
      local = await check([lang], true);
    }
    if (local === "unavailable") throw new Error("speech isn't supported for this language");
    if (local !== "available") {
      setStatus("downloading speech model (one time)…");
      const installed = await Engine.install({ langs: [lang], processLocally: true });
      if (!installed) throw new Error("speech model download failed");
    }
    return { lang, processLocally: true };
  }

  function createRecognition(Engine, { lang, processLocally }) {
    const rec = new Engine();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    if (processLocally) rec.processLocally = true;
    rec.onstatus = setStatus; // only the offline engine reports loading progress

    rec.onstart = () => {
      lastFinalIndex = -1; // result indexes restart with each session
      utteranceSent = "";
    };

    rec.onresult = (event) => {
      // Chrome can split one spoken phrase across several interim results, so
      // everything after the last final result is joined into a single phrase.
      let interim = "";
      for (let i = lastFinalIndex + 1; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          lastFinalIndex = i;
          interim = "";
          clearFlush();
          // The final is the full phrase, so it corrects a partial flush.
          const alreadySent = phraseKey(result[0].transcript) === phraseKey(utteranceSent);
          utteranceSent = "";
          if (!alreadySent) handlePhrase(result[0].transcript);
        } else {
          interim += result[0].transcript;
        }
      }

      clearFlush();
      const phrase = interim.trim();
      if (!phrase) return;
      setStatus(`… ${phrase}`);
      if (phraseKey(phrase) === phraseKey(utteranceSent)) return;

      // Final results can lag by a second, which is costly on a short fuse.
      const oneWord = !/\s/.test(phrase);
      flushTimer = setTimeout(() => {
        utteranceSent = phrase;
        handlePhrase(phrase);
      }, oneWord ? SILENCE_FLUSH_ONE_WORD_MS : SILENCE_FLUSH_MS);
    };

    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopListening("microphone blocked: allow it for krillion.io");
      } else if (event.error === "audio-capture") {
        stopListening("no microphone found");
      } else if (event.error === "network") {
        stopListening("speech service unreachable");
      } else {
        setStatus(`speech error: ${event.error}`);
      }
    };

    // Chrome ends sessions on its own after silence, so restart while enabled.
    rec.onend = () => {
      clearFlush();
      if (listening && recognition === rec) {
        setTimeout(() => {
          if (!listening || recognition !== rec) return;
          try {
            rec.start();
          } catch {
            stopListening("speech service stopped");
          }
        }, RESTART_DELAY_MS);
      }
    };

    return rec;
  }

  async function startListening() {
    if (!SpeechRecognition) {
      setStatus("this browser has no speech recognition");
      return;
    }
    if (listening) return;
    listening = true;
    render();
    const attempt = {};
    pendingStart = attempt;

    let Engine = SpeechRecognition;
    let settings;
    try {
      settings = await prepareEngine(Engine, navigator.language || "en-US");
    } catch (error) {
      if (pendingStart !== attempt) return; // turned off meanwhile
      // The Firefox build carries its own offline engine for exactly this case.
      if (window.PufferOfflineSpeech && Engine !== window.PufferOfflineSpeech) {
        Engine = window.PufferOfflineSpeech;
        settings = { lang: "en-US", processLocally: false };
      } else {
        stopListening(error.message);
        return;
      }
    }
    if (pendingStart !== attempt) return;
    pendingStart = null;

    recognition = createRecognition(Engine, settings);
    try {
      // Set first: an engine that is still loading reports its own status after this.
      setStatus("listening");
      recognition.start();
    } catch {
      stopListening("couldn't start the microphone");
    }
    render();
  }

  function stopListening(message = "mic off") {
    listening = false;
    pendingStart = null;
    clearFlush();
    const rec = recognition;
    recognition = null;
    if (rec) rec.abort();
    setStatus(message);
    render();
  }

  const toggleListening = () => (listening ? stopListening() : startListening());

  // ---------- on-screen control ----------

  const host = document.createElement("div");
  host.id = "puffer-party-voice";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      /* Top right: the site pins a full-width ad bar over the bottom of the window. */
      :host { all: initial; position: fixed; right: 12px; top: 12px; z-index: 2147483647; }      .box { display: flex; align-items: center; gap: 8px; max-width: min(320px, calc(100vw - 24px));
             padding: 6px; background: #0b1626; color: #e6f1ff; border: 1px solid #2c4a6e;
             border-radius: 8px; font: 13px/1.3 ui-monospace, Menlo, monospace; }
      button { flex: none; min-height: 32px; padding: 0 10px; font: inherit; font-weight: 700; cursor: pointer;
               color: #e6f1ff; background: #1b3350; border: 1px solid #2c4a6e; border-radius: 6px; }
      button[aria-pressed="true"] { color: #04121f; background: #4de3ff; border-color: #4de3ff; }
      button.turn { background: #ffd166; border-color: #ffd166; color: #04121f; }
      button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      .status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* Mid-width windows: the game's FLOATING counter reaches the corner, so show only the button. */
      @media (min-width: 1001px) and (max-width: 1300px) {
        .status { display: none; }
      }
      /* Narrow screens: sit compactly in the gap between the game's two button rows. */
      @media (max-width: 1000px) {
        :host { top: 68px; right: auto; left: 50%; transform: translateX(-50%); }
        .box { max-width: calc(100vw - 204px); padding: 0; gap: 6px; border: 0; background: none; font-size: 12px; }
        button { min-height: 30px; padding: 0 8px; }
        .status { padding: 2px 4px; background: #0b1626; border-radius: 4px; }
      }
    </style>
    <div class="box">
      <button type="button" title="Toggle voice (Alt+V)" aria-pressed="false">MIC OFF</button>
      <span class="status" role="status" aria-live="polite">Alt+V to talk</span>
    </div>`;
  const micButton = shadow.querySelector("button");
  const statusEl = shadow.querySelector(".status");

  function setStatus(message) {
    statusEl.textContent = message;
    statusEl.title = message;
  }

  function render() {
    const myTurn = listening && isMyTurn();
    micButton.textContent = myTurn ? "SAY IT!" : listening ? "MIC ON" : "MIC OFF";
    micButton.setAttribute("aria-pressed", String(listening));
    micButton.classList.toggle("turn", myTurn);
  }

  micButton.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the game's focus
  micButton.addEventListener("click", toggleListening);

  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyV") {
      if (!location.pathname.startsWith("/party")) return;
      e.preventDefault();
      toggleListening();
    }
  });

  // The site navigates without page reloads, so follow the route from here.
  function tick() {
    const onParty = location.pathname.startsWith("/party");
    if (onParty && !host.isConnected) document.documentElement.appendChild(host);
    if (!onParty && host.isConnected) {
      if (listening) stopListening();
      host.remove();
    }
    if (onParty) render();
  }
  setInterval(tick, 200);
  tick();
})();
