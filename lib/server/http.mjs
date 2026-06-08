/*
INPUTS
├── status_code: number
└── payload: object
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: emit json response       │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── http_response: bytes
*/

export function corsOrigin(req) {
  return req?.headers?.origin || "*";
}

export function sendJSON(res, statusCode, obj, req = null) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin(req),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function writeNdjsonLine(res, obj) {
  return new Promise((resolve, reject) => {
    const line = JSON.stringify(obj) + "\n";
    if (res.write(line)) return resolve();
    res.once("drain", resolve);
    res.once("error", reject);
  });
}

export function handleOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}