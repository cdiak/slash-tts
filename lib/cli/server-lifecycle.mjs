/*
INPUTS
├── port: number
└── server_dir: path
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: spawn server if absent   │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── live_server: { port, ready }
*/

import { spawn } from "child_process";
import * as fsSync from "fs";
import * as path from "path";

async function waitForReady(port, maxMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/status`);
      if (res.ok) {
        const j = await res.json();
        if (j?.ready) return j;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function ensureServer(opts) {
  try {
    const res = await fetch(`http://127.0.0.1:${opts.port}/status`);
    if (res.ok) {
      const j = await res.json();
      if (j?.ready) return j;
    }
  } catch {}
  const script = path.join(opts.serverDir, "index.mjs");
  if (!fsSync.existsSync(script)) throw new Error(`Server not found: ${script}`);
  console.error(`[kokoro-speak] Starting server :${opts.port}…`);
  const child = spawn(opts.nodePath, [script, "--port", String(opts.port)], {
    cwd: opts.serverDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: opts.keepServer,
  });
  if (opts.keepServer) child.unref();
  else {
    child.stdout?.on("data", (d) => process.stderr.write(d));
    child.stderr?.on("data", (d) => process.stderr.write(d));
  }
  const meta = await waitForReady(opts.port);
  if (!meta) {
    if (!opts.keepServer) try { child.kill("SIGTERM"); } catch {}
    throw new Error("Server did not become ready in time");
  }
  return meta;
}