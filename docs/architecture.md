# Architecture — grok-build-cli-tts

Handcrafted layout for portable Grok Build `/tts` playback. Spec is truth; code is residue.

**Related:** `PRD.md`, FD sets (conversation), `spec.md` (module FD headers, TBD at Phase 1).

---

## Design constraints (handcrafted)

| Directive | How it applies here |
|-----------|---------------------|
| Diagram before code | Every `lib/` file opens with one FD; no file without a diagram in `spec.md` first |
| One job per file | No file does parse *and* play *and* synthesize |
| ≤150 LOC / file | Split at 120 LOC; largest candidates: `routes-speak`, `stream-client` |
| State in `var/` only | PID, logs, fixtures — not HF weights (external cache) |
| Fail loud | Errors propagate; HTTP/NDJSON `error` events; no silent skip |
| Stochastic edge once | Model download/load only in `model-loader.mjs` → `validate-engine.mjs` |
| Interface projects `lib/` | `bin/` is argv + `node lib/...` only |

---

## Repository tree

```text
grok-build-cli-tts/
├── bin/                          # ENTRY ONLY — no decisions
│   ├── install                   # verify node, npm ci, print PATH hint
│   ├── kokoro-speak              # exec node lib/cli/speak.mjs "$@"
│   └── kokoro-server             # exec node lib/cli/server-daemon.mjs
│
├── lib/
│   ├── cli/                      # Client: markdown → HTTP → audio out
│   │   ├── speak.mjs             # Wire pipeline; export main()
│   │   ├── parse-args.mjs        # Parse argv → cli_opts
│   │   ├── read-input.mjs        # Read file | stdin | --text
│   │   ├── markdown-strip.mjs    # Markdown → speakable_text
│   │   ├── resolve-server.mjs    # Build server URL from port/host
│   │   ├── server-lifecycle.mjs    # Poll /status; spawn if down
│   │   ├── stream-client.mjs       # POST /speak; read NDJSON lines
│   │   ├── play-chunk.mjs          # Platform playback (afplay v1)
│   │   └── concat-wav.mjs          # Merge chunk WAVs for --out
│   │
│   └── server/                   # Server: HTTP → Kokoro → WAV
│       ├── index.mjs             # Bind listener; delegate to dispatch
│       ├── http-dispatch.mjs     # Method + path → handler fn
│       ├── http-read-body.mjs    # Read POST body string
│       ├── http-send-json.mjs    # JSON response + CORS headers
│       ├── http-send-ndjson.mjs  # Stream one NDJSON line
│       ├── routes-status.mjs     # GET /status handler
│       ├── routes-synthesize.mjs # POST /synthesize handler
│       ├── routes-speak.mjs      # POST /speak handler (orchestration)
│       ├── speak-queue.mjs       # Serialize concurrent /speak jobs
│       ├── speak-stream.mjs      # Kokoro stream() → per-sentence audio
│       ├── synthesize-one.mjs    # Kokoro generate() → float32 audio
│       ├── model-config.mjs      # Resolve dtype, EP, model ID from env
│       ├── model-loader.mjs      # **STOCHASTIC** from_pretrained
│       ├── validate-engine.mjs   # Fail closed if engine null / no voices
│       ├── engine-state.mjs      # Read/write ready flag + load meta
│       └── wav-encode.mjs        # float32 PCM → WAV Buffer
│
├── var/                          # OUR runtime state (gitignored)
│   ├── .gitkeep
│   ├── README.md                 # What belongs here vs HF cache
│   ├── server.pid                # Written by server-daemon (optional)
│   ├── server.log                # Daemon stdout/stderr (optional)
│   └── fixtures/                 # KOKORO_FIXTURE=1 deterministic mode
│       └── status-ready.json
│
├── docs/
│   ├── PRD.md
│   ├── architecture.md           # this file
│   ├── spec.md                   # Per-module FDs (implement before code)
│   ├── SETUP.md                  # User install + model download
│   └── API.md                    # HTTP contract
│
├── .grok/
│   └── skills/
│       └── tts/
│           ├── SKILL.md          # Agent narration + playback invoke
│           └── references/
│               └── setup-summary.md
│
├── .gitignore
├── package.json                  # type: module; deps: kokoro-js
├── LICENSE
└── README.md
```

**File count:** 28 `lib/` modules + 3 `bin/` wrappers. Each leaf targets 20–80 LOC; none over 150.

---

## Layer responsibilities

```text
┌─────────────────────────────────────────────────────────────┐
│  .grok/skills/tts/SKILL.md   (agent prompt — not code)      │
└────────────────────────────┬────────────────────────────────┘
                             │ invokes
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  bin/kokoro-speak            (thin entry)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/cli/*                   (client pipeline)              │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP localhost
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/server/*                (server pipeline)              │
└────────────────────────────┬────────────────────────────────┘
                             │ one guarded edge
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  kokoro-js + HuggingFace cache   (external; not in var/)    │
└─────────────────────────────────────────────────────────────┘
```

---

## `bin/` — entry only

| Script | Does | Must not do |
|--------|------|-------------|
| `install` | `node --version`, `npm ci`, echo PATH export | Download model, start server |
| `kokoro-speak` | `exec node "$ROOT/lib/cli/speak.mjs" "$@"` | Parse markdown, HTTP |
| `kokoro-server` | `exec node "$ROOT/lib/cli/server-daemon.mjs"` | Load Kokoro |

`server-daemon.mjs` lives under `lib/cli/` because it has logic (wait loop, pid file); the `bin/` script stays a one-liner wrapper.

---

## `lib/cli/` — client pipeline

Wired by `speak.mjs` in this order (matches FD Set E):

```text
parse-args → read-input → markdown-strip → server-lifecycle
    → stream-client → play-chunk (or concat-wav if --out / --no-play)
```

| Module | One-line job | FD transformer |
|--------|--------------|----------------|
| `parse-args.mjs` | Parse argv into cli_opts | parse cli arguments |
| `read-input.mjs` | Load raw markdown from file/stdin/text | read markdown input |
| `markdown-strip.mjs` | Strip headers, fences, comments | strip to speakable text |
| `resolve-server.mjs` | Build `http://127.0.0.1:${port}` | resolve server base URL |
| `server-lifecycle.mjs` | Ensure server ready before POST | spawn server if absent |
| `stream-client.mjs` | POST /speak; yield parsed NDJSON events | post speak stream |
| `play-chunk.mjs` | Write temp WAV; call afplay | play chunk via afplay |
| `concat-wav.mjs` | Concatenate chunk buffers to one WAV | merge wav chunks |
| `speak.mjs` | Wire above; export `main()` | *(orchestration only — no leaf FD)* |

**Platform gate:** `play-chunk.mjs` throws on non-darwin v1 (fail loud). Linux uses `--no-play --out`.

---

## `lib/server/` — server pipeline

Boot sequence in `index.mjs`:

```text
model-config → model-loader → validate-engine → engine-state (ready=true)
    → bind http → http-dispatch
```

Per-request paths:

| Route | Handler chain |
|-------|----------------|
| `GET /status` | `routes-status` ← `engine-state` |
| `POST /synthesize` | `routes-synthesize` → `synthesize-one` → `wav-encode` → `http-send-json` |
| `POST /speak` | `routes-speak` → `speak-queue` → `speak-stream` → `wav-encode` → `http-send-ndjson` |

| Module | One-line job |
|--------|--------------|
| `model-config.mjs` | Resolve model ID, dtype, execution providers |
| `model-loader.mjs` | Call `KokoroTTS.from_pretrained` (**only network edge**) |
| `validate-engine.mjs` | Reject null engine; require voices map |
| `engine-state.mjs` | Hold `{ ttsEngine, isReady, loadMeta, loadError }` in module closure |
| `speak-queue.mjs` | FIFO mutex for /speak (one inference at a time) |
| `speak-stream.mjs` | `TextSplitterStream` + `ttsEngine.stream()` loop |
| `synthesize-one.mjs` | `ttsEngine.generate()` for batch endpoint |
| `wav-encode.mjs` | float32 → 16-bit WAV |
| `http-dispatch.mjs` | Match method+path; no business rules |
| `index.mjs` | `createServer` + startup load + signal handlers |

**Note on `engine-state.mjs`:** In-process mutable state for the server process. Handcrafted `var/` is for *disk-persisted* session state (pid, logs). The loaded model lives in memory inside `engine-state.mjs` — analogous to a single-owner register in SICP, not a hidden global scattered across files.

---

## `var/` — what we own on disk

| Path | Writer | Purpose |
|------|--------|---------|
| `var/server.pid` | `server-daemon.mjs` | Daemon identity for status checks |
| `var/server.log` | `server-daemon.mjs` | Tail-friendly server output |
| `var/fixtures/*` | committed | `KOKORO_FIXTURE=1` bypasses real model |

**Not in `var/`:** Hugging Face weights (`~/.cache/huggingface` or `HF_HOME`). Documented in `var/README.md` as an external boundary.

---

## Stochastic boundary (directive 7 + 11)

Single chokepoint — no other file imports `kokoro-js` directly:

```text
lib/server/model-loader.mjs
    │  TRANSFORMER: fetch weights via kokoro-js
    ▼
lib/server/validate-engine.mjs
    │  TRANSFORMER: validate engine ready
    ▼
lib/server/engine-state.mjs
```

**Fixture mode:** `KOKORO_FIXTURE=1` → `model-loader` reads `var/fixtures/` stub instead of Hub. Enables CI and offline dev without touching production path.

---

## Skill package (not `lib/`)

`.grok/skills/tts/` is an **agent interface**, not application code:

| File | Role |
|------|------|
| `SKILL.md` | Narration rules, modes, quality bar |
| `references/setup-summary.md` | Short prerequisite block for agent context |

Playback step in skill: resolve bin → save temp md → shell `kokoro-speak` (no logic in skill).

**Tool resolution** (documented in SKILL.md, not coded):

1. `$GROK_TTS_HOME/bin/kokoro-speak`
2. `kokoro-speak` on `PATH`
3. `<repo-root>/bin/kokoro-speak` when skill is repo-scoped

---

## Dependencies

| Dep | Where | Why |
|-----|-------|-----|
| `kokoro-js` | `lib/server/model-loader.mjs` only | TTS inference |
| Node ≥18 builtins | everywhere else | fs, http, child_process |

No Obsidian, no esbuild, no express. `bin/install` runs `npm ci` at repo root.

---

## Working protocol (per feature)

1. Add leaf FD to `docs/spec.md`
2. Create `lib/...` file with FD header comment matching spec
3. Implement smallest transform (~10 LOC target per fn when clear)
4. Verify: `kokoro-speak --text "smoke"` + `curl /status`
5. `wc -l` ≤ 150; reconcile spec if drift

**Phase 1 build order:**

```text
1. lib/server/model-config, wav-encode, engine-state
2. lib/server/model-loader, validate-engine
3. lib/server/synthesize-one, routes-synthesize, routes-status
4. lib/server/speak-stream, speak-queue, routes-speak, http-*, index
5. lib/cli/* (bottom-up: strip → lifecycle → stream → play)
6. bin wrappers + install
7. .grok/skills/tts/SKILL.md rewrite
```

---

## Stop conditions (refuse to merge)

- [ ] Any `lib/` file without FD header
- [ ] Any `lib/` file >150 lines
- [ ] Logic in `bin/` beyond exec/wrapper
- [ ] `kokoro-js` imported outside `model-loader.mjs` / `speak-stream.mjs` / `synthesize-one.mjs`
- [ ] Swallowed errors in playback or synthesis paths
- [ ] SKILL.md contains user-specific absolute paths