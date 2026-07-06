/*
INPUTS
├── kind: pydoc | man
└── topic: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: fetch source document    │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── raw_doc: string
*/

import { execSync } from "child_process";

export function fetchPydoc(topic) {
  try {
    return execSync("pydoc", [topic], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const msg = err.stderr?.toString() || err.stdout?.toString() || err.message;
    throw new Error(msg.trim() || `No pydoc entry for ${topic}`);
  }
}

export function fetchMan(topic) {
  try {
    const raw = execSync("man", [topic], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return execSync("col", ["-b"], { input: raw, encoding: "utf8" });
  } catch (err) {
    const out = err.stdout?.toString() || "";
    if (/No manual entry|nothing appropriate/i.test(out)) {
      throw new Error(`No manual entry for ${topic}`);
    }
    if (out.trim()) return out;
    throw new Error(err.message || `man failed for ${topic}`);
  }
}