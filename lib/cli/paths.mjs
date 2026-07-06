/*
INPUTS
└── env: process.env
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: resolve repo var paths   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── paths: { root, varDir, pidFile, stateFile }
*/

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  if (process.env.GROK_TTS_HOME) return path.resolve(process.env.GROK_TTS_HOME);
  return path.resolve(__dirname, "../..");
}

export function varDir() {
  const dir = path.join(repoRoot(), "var");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function pidFile() {
  return path.join(varDir(), "kokoro-client.pid");
}

export function stateFile() {
  return path.join(varDir(), "playback-state.json");
}