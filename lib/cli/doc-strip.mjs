/*
INPUTS
└── raw_doc: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: pydoc/man to speakable    │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── speakable_text: string
*/

export function docToSpeakable(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (/^-{8,}$/.test(trimmed)) continue;
    if (/^={8,}$/.test(trimmed)) continue;
    if (/^https?:\/\/\S+$/.test(trimmed)) continue;
    out.push(line.trimEnd());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}