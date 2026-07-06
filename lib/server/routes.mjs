/*
INPUTS
├── http_request: object
└── tts_engine: KokoroTTS
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: dispatch route handler   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── http_response: bytes
*/

import { TextSplitterStream } from "kokoro-js";
import { getEngineState } from "./engine.mjs";
import { float32ToWavBuffer } from "./wav-encode.mjs";
import {
  enqueueSpeak,
  getSpeakStatus,
  setSpeakSessionMeta,
  clearSpeakSessionMeta,
  cancelCurrentSpeak,
} from "./speak-queue.mjs";
import { corsOrigin, sendJSON, readBody, writeNdjsonLine } from "./http.mjs";

async function runSpeakStream(res, text, voice, speed, signal, session) {
  const { ttsEngine } = getEngineState();
  const started = Date.now();
  let index = 0;
  const splitter = new TextSplitterStream();
  const audioStream = ttsEngine.stream(splitter, { voice, speed });
  splitter.push(text);
  splitter.close();
  for await (const part of audioStream) {
    if (signal?.aborted || session?.aborted) return;
    const t0 = Date.now();
    const wav = float32ToWavBuffer(part.audio.audio, part.audio.sampling_rate);
    if (session) session.chunkIndex = index;
    await writeNdjsonLine(res, {
      type: "chunk",
      index: index++,
      audio: wav.toString("base64"),
      text: part.text || "",
      synthesisMs: Date.now() - t0,
      elapsedMs: Date.now() - started,
    });
    if (signal?.aborted || session?.aborted) return;
  }
  await writeNdjsonLine(res, {
    type: "done",
    chunks: index,
    totalMs: Date.now() - started,
    voice,
    speed,
  });
}

export function handleStatus(res, req = null) {
  const { ttsEngine, isReady, loadError, loadMeta } = getEngineState();
  sendJSON(res, 200, {
    ok: true,
    ready: isReady,
    error: loadError?.message || null,
    voices: ttsEngine ? Object.keys(ttsEngine.voices || {}) : [],
    pid: process.pid,
    ...loadMeta,
    ...getSpeakStatus(),
    endpoints: ["GET /status", "POST /synthesize", "POST /speak", "POST /cancel"],
  }, req);
}

export async function handleCancel(req, res) {
  const cancelled = cancelCurrentSpeak();
  sendJSON(res, 200, { ok: true, cancelled }, req);
}

export async function handleSynthesize(req, res) {
  const { isReady, loadError, ttsEngine } = getEngineState();
  if (!isReady) {
    return sendJSON(res, 503, { ok: false, error: loadError?.message || "Model still loading" }, req);
  }
  try {
    const payload = JSON.parse((await readBody(req)) || "{}");
    const text = (payload.text || "").trim();
    if (!text) return sendJSON(res, 400, { ok: false, error: "No text provided" }, req);
    const voice = payload.voice || "af_sky";
    const speed = Number(payload.speed) || 1.0;
    const t0 = Date.now();
    const result = await ttsEngine.generate(text, { voice, speed });
    const wav = float32ToWavBuffer(result.audio, result.sampling_rate);
    sendJSON(res, 200, {
      ok: true,
      audio: wav.toString("base64"),
      sampleRate: 24000,
      durationSec: (wav.length - 44) / 2 / 24000,
      voiceUsed: voice,
      speedUsed: speed,
      synthesisMs: Date.now() - t0,
    }, req);
  } catch (err) {
    sendJSON(res, 500, { ok: false, error: err.message }, req);
  }
}

export async function handleSpeak(req, res) {
  const { isReady, loadError } = getEngineState();
  if (!isReady) {
    return sendJSON(res, 503, { ok: false, error: loadError?.message || "Model still loading" }, req);
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch (err) {
    return sendJSON(res, 400, { ok: false, error: err.message }, req);
  }
  const text = (payload.text || "").trim();
  if (!text) return sendJSON(res, 400, { ok: false, error: "No text provided" }, req);
  const voice = payload.voice || "af_sky";
  const speed = Number(payload.speed) || 1.0;
  const replace = payload.replace !== false;
  const clientPid = Number(payload.clientPid) || null;
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Accel-Buffering": "no",
  });
  const timeoutMs = Number(process.env.KOKORO_SPEAK_TIMEOUT_MS) || 600000;
  await enqueueSpeak(
    async (signal) => {
      const session = {
        aborted: false,
        clientPid,
        chunkIndex: null,
        abort() {
          this.aborted = true;
          try {
            res.destroy();
          } catch {}
        },
      };
      setSpeakSessionMeta(session);
      const timer = setTimeout(() => session.abort(), timeoutMs);
      const onAbort = () => session.abort();
      signal?.addEventListener("abort", onAbort);
      req.on("close", onAbort);
      try {
        await runSpeakStream(res, text, voice, speed, signal, session);
      } catch (err) {
        if (!signal?.aborted && !session.aborted) {
          try {
            await writeNdjsonLine(res, { type: "error", error: err.message });
          } catch {}
        }
      } finally {
        signal?.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        clearSpeakSessionMeta();
        if (!res.writableEnded) res.end();
      }
    },
    { replace }
  );
}

export function handleNotFound(res, req) {
  sendJSON(res, 404, { ok: false, error: "Not found" }, req);
}