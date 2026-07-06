/*
INPUTS
├── kind: pydoc | man
└── topic: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: fetch doc and play aloud  │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── playback_started: void
*/

import { spawn } from "child_process";
import * as path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { docToSpeakable } from "./doc-strip.mjs";
import { chunkText } from "./chunk-text.mjs";
import { fetchPydoc, fetchMan } from "./fetch-doc.mjs";
import { ensureServer } from "./server-lifecycle.mjs";
import { speakChunks } from "./stream-playback.mjs";
import { clearPid, writePid } from "./playback-state.mjs";
import { stopPlayer, pausePlayer, resumePlayer, playerBackend } from "./player.mjs";
import { runControl } from "./control.mjs";

const DEFAULT_PORT = 19200;
const DEFAULT_VOICE = "af_sky";

function usage() {
  console.error(`Usage: kokoro-read [--detach] pydoc TOPIC
       kokoro-read [--detach] man PAGE
  --port N     HTTP port (default ${DEFAULT_PORT})
  --voice ID   Kokoro voice (default ${DEFAULT_VOICE})
  --server-dir Path to lib/server/`);
}

function parseArgs(argv) {
  const opts = {
    kind: null,
    topic: null,
    port: Number(process.env.KOKORO_PORT) || DEFAULT_PORT,
    voice: process.env.KOKORO_VOICE || DEFAULT_VOICE,
    serverDir: process.env.KOKORO_SERVER_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../server"),
    detach: false,
    child: false,
    replace: process.env.KOKORO_REPLACE_QUEUE !== "0",
    play: true,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--detach") opts.detach = true;
    else if (a === "--child") opts.child = true;
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--voice") opts.voice = argv[++i] ?? DEFAULT_VOICE;
    else if (a === "--server-dir") opts.serverDir = path.resolve(argv[++i] ?? "");
    else if (a === "-h" || a === "--help") {
      usage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      console.error("Unknown option:", a);
      usage();
      process.exit(1);
    } else positional.push(a);
  }
  if (positional.length >= 2) {
    opts.kind = positional[0];
    opts.topic = positional.slice(1).join(" ");
  }
  return opts;
}

function installSignalHandlers(abort) {
  const onStop = () => {
    stopPlayer();
    abort.abort();
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);
  process.on("SIGUSR1", () => pausePlayer());
  process.on("SIGUSR2", () => resumePlayer());
  return () => {
    process.removeListener("SIGTERM", onStop);
    process.removeListener("SIGINT", onStop);
  };
}

async function detachSelf() {
  const script = fileURLToPath(import.meta.url);
  const childArgs = process.argv.slice(2).filter((a) => a !== "--detach");
  childArgs.push("--child");
  const child = spawn(process.execPath, [script, ...childArgs], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  await writePid(child.pid);
  console.error(`[kokoro-read] Detached pid ${child.pid}`);
}

async function loadDoc(opts) {
  if (opts.kind === "pydoc") return fetchPydoc(opts.topic);
  if (opts.kind === "man") return fetchMan(opts.topic);
  throw new Error(`Expected 'pydoc TOPIC' or 'man PAGE', got: ${opts.kind} ${opts.topic}`);
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.kind || !opts.topic) {
    usage();
    process.exit(1);
  }
  if (opts.detach && !opts.child) return detachSelf();

  const raw = await loadDoc(opts);
  const speakable = docToSpeakable(raw);
  const chunks = chunkText(speakable);
  console.error(
    `[kokoro-read] ${opts.kind} ${opts.topic}: ${speakable.length} chars, ${chunks.length} chunks, player=${playerBackend()}`
  );

  await writePid(process.pid);
  await ensureServer(opts);
  const abort = new AbortController();
  const removeHandlers = installSignalHandlers(abort);
  opts.t0 = Date.now();

  try {
    await speakChunks(opts, chunks, { signal: abort.signal });
    console.error(
      `[kokoro-read] Finished in ${((Date.now() - opts.t0) / 1000).toFixed(1)}s`
    );
  } catch (err) {
    if (abort.signal.aborted) {
      console.error("[kokoro-read] Stopped.");
      process.exit(0);
    }
    throw err;
  } finally {
    removeHandlers();
    stopPlayer();
    await clearPid();
  }
}

export async function controlMain(command) {
  const result = await runControl(command);
  console.error(`[kokoro-${command}] ${result.message}`);
  process.exit(result.ok ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error("[kokoro-read] Error:", err.message || err);
    process.exit(1);
  });
}