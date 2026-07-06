/*
INPUTS
├── cli_opts: object
└── raw_markdown: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: invoke kokoro-speak      │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── playback_result: ok | failed
*/

import { execSync, spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { parseArgs, readInput } from "./args.mjs";
import { markdownToSpeakable } from "./markdown-strip.mjs";
import { ensureServer } from "./server-lifecycle.mjs";
import { speakStream, concatWav } from "./stream-playback.mjs";
import {
  clearPid,
  clearState,
  readState,
  writePid,
} from "./playback-state.mjs";
import {
  pausePlayer,
  resumePlayer,
  stopPlayer,
  playerBackend,
} from "./player.mjs";
import { runControl } from "./control.mjs";

function installSignalHandlers(abort) {
  const onStop = () => {
    stopPlayer();
    abort.abort();
  };
  const onPause = () => {
    if (!pausePlayer()) {
      console.error("[kokoro-speak] Pause requires ffplay (brew install ffmpeg).");
    }
  };
  const onResume = () => {
    if (!resumePlayer()) {
      console.error("[kokoro-speak] Resume requires an active ffplay session.");
    }
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);
  process.on("SIGUSR1", onPause);
  process.on("SIGUSR2", onResume);
  return () => {
    process.removeListener("SIGTERM", onStop);
    process.removeListener("SIGINT", onStop);
    process.removeListener("SIGUSR1", onPause);
    process.removeListener("SIGUSR2", onResume);
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
  console.error(`[kokoro-speak] Detached pid ${child.pid}`);
}

function cancelStaleClients() {
  if (process.env.KOKORO_KILL_STALE_CLIENTS === "0") return;
  try {
    const out = execSync('pgrep -f "lib/cli/speak.mjs"', { encoding: "utf8" }).trim();
    if (!out) return;
    for (const pid of out.split("\n")) {
      const n = Number(pid);
      if (n && n !== process.pid) {
        try {
          process.kill(n, "SIGTERM");
        } catch {}
      }
    }
  } catch {}
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.detach && !opts.child) {
    return detachSelf();
  }

  if (opts.resume && !opts.file && !opts.text) {
    const saved = await readState();
    if (saved?.source) opts.file = saved.source;
  }

  const raw = await readInput(opts);
  const speakable = markdownToSpeakable(raw);
  if (!speakable) {
    console.error("[kokoro-speak] No speakable text.");
    process.exit(1);
  }

  let startChunk = 0;
  if (opts.resume) {
    const saved = await readState();
    if (saved?.chunkIndex != null) {
      startChunk = saved.chunkIndex + 1;
      console.error(`[kokoro-speak] Resuming from chunk ${startChunk}`);
    }
  }

  console.error(
    `[kokoro-speak] ${speakable.length} chars, voice=${opts.voice}, player=${playerBackend()}`
  );
  cancelStaleClients();
  await writePid(process.pid);
  await ensureServer(opts);
  const abort = new AbortController();
  const removeHandlers = installSignalHandlers(abort);
  opts.t0 = Date.now();

  try {
    const wavParts = await speakStream(opts, speakable, {
      signal: abort.signal,
      startChunk,
    });
    if (opts.out || !opts.play) {
      const combined = concatWav(wavParts);
      const outPath =
        opts.out || path.join(os.tmpdir(), `kokoro-speak-${Date.now()}.wav`);
      await fs.writeFile(outPath, combined);
      console.error(`[kokoro-speak] Wrote ${outPath}`);
    }
    await clearState();
    console.error(
      `[kokoro-speak] Finished in ${((Date.now() - opts.t0) / 1000).toFixed(1)}s`
    );
  } catch (err) {
    if (abort.signal.aborted) {
      console.error("[kokoro-speak] Stopped.");
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
    console.error("[kokoro-speak] Error:", err.message || err);
    process.exit(1);
  });
}