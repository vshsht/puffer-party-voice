// Offline speech for browsers with no built-in recognizer (Firefox). The Vosk
// engine runs on this computer in a hidden extension page (engine.html), because
// its classes don't work inside a Firefox content script. This file captures the
// mic, streams it there, and mimics the SpeechRecognition API content.js uses.
(() => {
  "use strict";

  const BUFFER_SIZE = 2048; // about 40ms of audio, keeps partial results quick
  const ENGINE_URL = browser.runtime.getURL("engine.html");
  let enginePort = null; // the engine and its loaded model are kept for the whole page
  let enginePromise = null;
  let onEngineMessage = null;

  function connectEngine() {
    if (!enginePromise) {
      enginePromise = new Promise((resolve, reject) => {
        const frame = document.createElement("iframe");
        frame.src = ENGINE_URL;
        frame.hidden = true;
        frame.style.display = "none";
        frame.addEventListener("load", () => {
          const channel = new MessageChannel();
          enginePort = channel.port1;
          enginePort.onmessage = (event) => onEngineMessage?.(event.data);
          frame.contentWindow.postMessage("connect", new URL(ENGINE_URL).origin, [channel.port2]);
          resolve();
        });
        frame.addEventListener("error", () => reject(new Error("engine page failed to load")));
        document.documentElement.appendChild(frame);
      }).catch((error) => {
        enginePromise = null;
        throw error;
      });
    }
    return enginePromise;
  }

  class OfflineSpeechRecognition {
    constructor() {
      this.results = [];
      this.active = false;
    }

    emitResult(text, isFinal) {
      const last = this.results[this.results.length - 1];
      if (last && !last.isFinal) this.results.pop();
      this.results.push(Object.assign([{ transcript: text }], { isFinal }));
      this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
    }

    fail(code, error) {
      if (!this.active) return;
      if (error) console.error("Puffer Party Voice:", error);
      this.onerror?.({ error: code });
    }

    async start() {
      this.active = true;
      this.results = [];
      this.engineReady = false;
      try {
        this.onstatus?.("loading speech model…");
        await connectEngine();
        if (!this.active) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        if (!this.active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.stream = stream;
        this.audioContext = new AudioContext();

        onEngineMessage = (message) => this.handleEngineMessage(message);
        enginePort.postMessage({ type: "start", sampleRate: this.audioContext.sampleRate });

        this.source = this.audioContext.createMediaStreamSource(stream);
        this.processor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        this.processor.onaudioprocess = (event) => {
          if (!this.engineReady) return; // nothing to hear with until the model is up
          const samples = new Float32Array(event.inputBuffer.getChannelData(0));
          enginePort.postMessage({ type: "audio", samples }, [samples.buffer]);
        };
        const silent = this.audioContext.createGain();
        silent.gain.value = 0; // the processor must reach an output to run, but stays inaudible
        this.source.connect(this.processor);
        this.processor.connect(silent);
        silent.connect(this.audioContext.destination);
        await this.audioContext.resume();
      } catch (error) {
        const name = error && error.name;
        this.fail(
          name === "NotAllowedError" ? "not-allowed" : name === "NotFoundError" ? "audio-capture" : "engine-failed",
          error
        );
      }
    }

    handleEngineMessage(message) {
      if (!this.active) return;
      if (message.type === "ready") {
        this.engineReady = true;
        this.onstart?.();
        this.onstatus?.("listening");
      } else if (message.type === "partial") {
        this.emitResult(message.text, false);
      } else if (message.type === "final") {
        this.emitResult(message.text, true);
      } else if (message.type === "error") {
        this.fail("engine-failed", new Error(message.message));
      }
    }

    abort() {
      this.active = false;
      this.engineReady = false;
      onEngineMessage = null;
      if (this.processor) this.processor.onaudioprocess = null;
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.audioContext?.close();
      enginePort?.postMessage({ type: "stop" });
      this.processor = this.source = this.stream = this.audioContext = null;
    }

    stop() {
      this.abort();
    }
  }

  window.PufferOfflineSpeech = OfflineSpeechRecognition;
})();
