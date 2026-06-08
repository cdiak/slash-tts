/*
INPUTS
├── load_opts: object
└── hf_cache_dir: path
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: fetch weights via kokoro-js│
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── tts_engine: KokoroTTS
*/

import { KokoroTTS } from "kokoro-js";
import { getLoadOptions } from "./model-config.mjs";

let ttsEngine = null;
let isReady = false;
let loadError = null;
let loadMeta = {};

export function getEngineState() {
  return { ttsEngine, isReady, loadError, loadMeta };
}

export async function loadModel() {
  const opts = getLoadOptions();
  const start = Date.now();
  console.log(`[tts] Loading Kokoro (${opts.dtype})…`);
  try {
    ttsEngine = await KokoroTTS.from_pretrained(opts.modelId, {
      dtype: opts.dtype,
      device: opts.device,
      session_options: opts.session_options,
    });
    if (!Object.keys(ttsEngine.voices || {}).length) {
      throw new Error("Kokoro engine loaded without voices");
    }
    isReady = true;
    loadMeta = {
      dtype: opts.dtype,
      executionProviders: opts.session_options.executionProviders,
      loadSec: Number(((Date.now() - start) / 1000).toFixed(1)),
    };
    console.log(`[tts] Ready in ${loadMeta.loadSec}s`);
  } catch (err) {
    loadError = err;
    isReady = false;
    console.error("[tts] Failed:", err);
    throw err;
  }
}