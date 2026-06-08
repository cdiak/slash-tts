# grok-build-cli-tts

Local Kokoro TTS playback for Grok Build `/tts`. Turns markdown narration scripts into streamed speech via `kokoro-speak`.

## Prerequisites

- Node.js ≥ 18
- macOS for audible playback (Linux: use `--no-play --out file.wav`)
- ~500 MB disk for Kokoro weights (auto-downloaded on first run)
- Network on first run only

## Install

```bash
git clone https://github.com/cdiak/grok-build-cli-tts.git
cd grok-build-cli-tts
./bin/install
export PATH="$PWD/bin:$PATH"
export GROK_TTS_HOME="$PWD"
```

## Install the `/tts` skill

```bash
cp -r .grok/skills/tts ~/.grok/skills/tts
```

Or add to `~/.grok/config.toml`:

```toml
[skills]
paths = ["/path/to/grok-build-cli-tts/.grok/skills/tts"]
```

Restart Grok or wait a few seconds for skill reload.

## Smoke test

```bash
kokoro-speak --text "Grok Build TTS is working."
```

First run downloads `onnx-community/Kokoro-82M-v1.0-ONNX` to your Hugging Face cache (~1–3 min), then loads the model (~5–20 s).

Check server status:

```bash
curl -s http://127.0.0.1:19200/status | python3 -m json.tool
```

## Usage in Grok Build

```
/tts recent
/tts no-play src/main.ts
/tts ./my-project
```

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `GROK_TTS_HOME` | — | Repo root; resolves `bin/kokoro-speak` |
| `KOKORO_PORT` | `19200` | HTTP server port |
| `KOKORO_VOICE` | `af_sky` | Kokoro voice id |
| `KOKORO_SERVER_DIR` | `lib/server` | Server entry directory |
| `KOKORO_KEEP_SERVER` | `1` | Keep server process between runs |
| `HF_HOME` | `~/.cache/huggingface` | Model cache location |

## CLI reference

```bash
kokoro-speak script.md          # play markdown script
kokoro-speak --text "hello"     # play inline text
kokoro-speak --no-play --out out.wav script.md
kokoro-server                   # pre-warm daemon
```