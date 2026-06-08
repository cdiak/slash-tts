/*
INPUTS
├── port: number
└── host: string
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: bind http listener       │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── http_server: Server
*/

import http from "http";
import { loadModel } from "./engine.mjs";
import { handleOptions } from "./http.mjs";
import {
  handleStatus,
  handleSynthesize,
  handleSpeak,
  handleNotFound,
} from "./routes.mjs";

const DEFAULT_PORT = 19200;
const DEFAULT_HOST = "127.0.0.1";

function parsePort(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) return parseInt(argv[i + 1], 10);
  }
  return DEFAULT_PORT;
}

const port = parsePort(process.argv.slice(2));
loadModel().catch(() => {});

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return handleOptions(res);
  const url = req.url?.split("?")[0];
  if (req.method === "GET" && url === "/status") return handleStatus(res, req);
  if (req.method === "POST" && url === "/synthesize") return handleSynthesize(req, res);
  if (req.method === "POST" && url === "/speak") return handleSpeak(req, res);
  return handleNotFound(res, req);
});

server.listen(port, DEFAULT_HOST, () => {
  console.log(`[tts] http://${DEFAULT_HOST}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);