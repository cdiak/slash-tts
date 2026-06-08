/*
INPUTS
└── raw_markdown: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: strip to speakable text  │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── speakable_text: string
*/

export function markdownToSpeakable(raw) {
  let text = raw.replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (!trimmed) {
      out.push("");
      continue;
    }
    let spoken = line.replace(/`([^`]+)`/g, "$1");
    spoken = spoken.replace(/\*\*([^*]+)\*\*/g, "$1");
    spoken = spoken.replace(/\*([^*]+)\*/g, "$1");
    spoken = spoken.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    out.push(spoken.trim());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}