/*
INPUTS
├── command: stop | pause | resume
└── port: number
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: signal client + server   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── result: { ok, message }
*/

import { clearPid, clearState, isAlive, readPid } from "./playback-state.mjs";

const SIGNALS = { pause: "SIGUSR1", resume: "SIGUSR2", stop: "SIGTERM" };

async function postCancel(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/cancel`, { method: "POST" });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

export async function runControl(command, port = Number(process.env.KOKORO_PORT) || 19200) {
  const pid = await readPid();
  if (!pid || !isAlive(pid)) {
    await clearPid();
    const cancelled = await postCancel(port);
    if (cancelled?.ok) {
      return { ok: true, message: "Stopped server synthesis (no active client)." };
    }
    return { ok: false, message: "No active kokoro-speak process." };
  }

  if (command === "stop") {
    await postCancel(port);
    try {
      process.kill(pid, "SIGTERM");
    } catch (err) {
      return { ok: false, message: err.message };
    }
    await clearPid();
    await clearState();
    return { ok: true, message: `Stopped playback (pid ${pid}).` };
  }

  const sig = SIGNALS[command];
  try {
    process.kill(pid, sig);
  } catch (err) {
    await clearPid();
    return { ok: false, message: err.message };
  }
  const label = command === "pause" ? "Paused" : "Resumed";
  return { ok: true, message: `${label} playback (pid ${pid}).` };
}