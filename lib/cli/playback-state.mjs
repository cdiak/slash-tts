/*
INPUTS
├── action: read | write | clear
└── state: object | null
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: persist playback state   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── state: object | null
*/

import * as fs from "fs/promises";
import { pidFile, stateFile } from "./paths.mjs";

export async function writePid(pid) {
  await fs.writeFile(pidFile(), `${pid}\n`);
}

export async function readPid() {
  try {
    const raw = await fs.readFile(pidFile(), "utf8");
    const pid = Number(raw.trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function clearPid() {
  try {
    await fs.unlink(pidFile());
  } catch {}
}

export async function writeState(state) {
  await fs.writeFile(stateFile(), JSON.stringify(state, null, 2));
}

export async function readState() {
  try {
    const raw = await fs.readFile(stateFile(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearState() {
  try {
    await fs.unlink(stateFile());
  } catch {}
}

export function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}