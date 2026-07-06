/*
INPUTS
├── text: string
└── limits: { firstMax, max }
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: split for fast first play │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── chunks: string[]
*/

export function chunkText(text, { firstMax = 700, max = 1800 } = {}) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let limit = firstMax;

  let buf = "";
  for (const para of paragraphs) {
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= limit) {
      buf = candidate;
      continue;
    }
    if (buf) chunks.push(buf);
    if (para.length <= limit) {
      buf = para;
    } else {
      for (let i = 0; i < para.length; i += limit) {
        chunks.push(para.slice(i, i + limit));
      }
      buf = "";
    }
    limit = max;
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text];
}