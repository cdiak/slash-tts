/*
INPUTS
├── wav_path: string
└── abort_signal: AbortSignal | null
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: play wav with controls   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── playback_done: void
*/

import { spawn, spawnSync } from "child_process";

let current = null;
let paused = false;

function hasFfplay() {
  if (process.platform !== "darwin") return false;
  const r = spawnSync("which", ["ffplay"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim();
}

export function playerBackend() {
  return hasFfplay() ? "ffplay" : process.platform === "darwin" ? "afplay" : "none";
}

function killCurrent() {
  if (!current) return;
  const { proc } = current;
  current = null;
  paused = false;
  try {
    proc.kill("SIGTERM");
  } catch {}
}

export function stopPlayer() {
  killCurrent();
}

export function pausePlayer() {
  if (!current?.canPause || !current.proc.stdin) return false;
  try {
    current.proc.stdin.write("p");
    paused = !paused;
    return true;
  } catch {
    return false;
  }
}

export function resumePlayer() {
  if (!current?.canPause || !paused) return false;
  return pausePlayer();
}

export function isPaused() {
  return paused;
}

export async function playWav(filePath, { signal } = {}) {
  if (process.platform !== "darwin") {
    throw new Error("Playback requires macOS (or use --no-play)");
  }
  const useFfplay = hasFfplay();
  const args = useFfplay
    ? ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath]
    : [filePath];
  const cmd = useFfplay ? "ffplay" : "afplay";
  const proc = spawn(cmd, args, {
    stdio: useFfplay ? ["pipe", "ignore", "ignore"] : "ignore",
  });
  current = { proc, path: filePath, canPause: useFfplay };
  paused = false;

  const onAbort = () => killCurrent();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await new Promise((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", (code, sig) => {
        current = null;
        paused = false;
        if (sig === "SIGTERM") return resolve();
        if (code === 0) return resolve();
        reject(new Error(`${cmd} exit ${code}`));
      });
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (current?.proc === proc) current = null;
  }
}