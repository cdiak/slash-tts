/*
INPUTS
├── platform: string
└── env_overrides: object
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: resolve model load config │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── load_opts: object
*/

const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export function getLoadOptions() {
  const dtype = process.env.KOKORO_DTYPE || "q4";
  const session_options = {
    executionProviders:
      process.platform === "darwin" ? ["coreml", "cpu"] : ["cpu"],
    intraOpNumThreads: Math.min(
      6,
      Number(process.env.KOKORO_THREADS) || 4
    ),
  };
  return {
    modelId: process.env.KOKORO_MODEL_ID || DEFAULT_MODEL_ID,
    dtype,
    device: "cpu",
    session_options,
  };
}