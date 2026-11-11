// Hidden extension page that runs the Vosk engine. It only receives audio from
// the content script and sends text back. Nothing here uses the network.
"use strict";

// vosk.js starts its worker from a generated URL, which extension pages forbid,
// so it gets the same code from the packaged file instead. The build removes the
// embedded copy from vosk.js (see tools/extract_worker.py).
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(_url, options) {
    super(browser.runtime.getURL("vosk-worker.js"), options);
  }
};

// Only the game's page may connect, so other sites can't use this engine.
const ALLOWED_ORIGINS = ["https://krillion.io"];

let port = null;
let modelPromise = null;
let recognizer = null;
let recognizerRate = 0;
let session = 0;
let lastPartial = "";

// Vosk.createModel only settles on success, so failures are caught here instead.
function loadModel() {
  if (!modelPromise) {
    modelPromise = new Promise((resolve, reject) => {
      const model = new Vosk.Model(browser.runtime.getURL("model.tar.gz"), -1);
      model.on("load", (message) => (message.result ? resolve(model) : reject(new Error("speech model failed to load"))));
      model.on("error", (message) => reject(new Error(`speech engine: ${message.error}`)));
    }).catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

function stopRecognizer() {
  session++;
  recognizer?.remove();
  recognizer = null;
  lastPartial = "";
}

async function startRecognizer(sampleRate) {
  stopRecognizer();
  const thisSession = session;
  try {
    const model = await loadModel();
    if (thisSession !== session) return;
    const rec = new model.KaldiRecognizer(sampleRate);
    rec.on("partialresult", (message) => {
      // The engine repeats partials through silence. Only changes count, or the
      // silence timer in content.js would keep restarting.
      const text = message.result.partial.trim();
      if (recognizer !== rec || !text || text === lastPartial) return;
      lastPartial = text;
      port.postMessage({ type: "partial", text });
    });
    rec.on("result", (message) => {
      const text = message.result.text.trim();
      if (recognizer !== rec) return;
      lastPartial = "";
      if (text) port.postMessage({ type: "final", text });
    });
    recognizer = rec;
    recognizerRate = sampleRate;
    port.postMessage({ type: "ready" });
  } catch (error) {
    port.postMessage({ type: "error", message: String((error && error.message) || error) });
  }
}

window.addEventListener("message", (event) => {
  if (port || !ALLOWED_ORIGINS.includes(event.origin) || !event.ports[0]) return;
  port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data.type === "start") startRecognizer(data.sampleRate);
    else if (data.type === "stop") stopRecognizer();
    else if (data.type === "audio" && recognizer) recognizer.acceptWaveformFloat(data.samples, recognizerRate);
  };
});
