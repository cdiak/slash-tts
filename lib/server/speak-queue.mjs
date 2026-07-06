/*
INPUTS
├── task: async function(signal)
└── replace: boolean
          │
          ▼
┌────────────────────────────────────────┐
│  TRANSFORMER: enqueue speak request    │
└────────────────────────────────────────┘
          │
          ▼
OUTPUT
└── completion: void
*/

const speakQueue = [];
let speakBusy = false;
let currentCancel = null;
let currentSession = null;
let generation = 0;

export function getSpeakStatus() {
  return {
    queueBusy: speakBusy,
    queueDepth: speakQueue.length,
    playing: speakBusy || !!currentSession,
    clientPid: currentSession?.clientPid ?? null,
    chunkIndex: currentSession?.chunkIndex ?? null,
  };
}

export function setSpeakSessionMeta(meta) {
  currentSession = meta;
}

export function clearSpeakSessionMeta() {
  currentSession = null;
}

export function cancelActiveAndClear() {
  generation++;
  if (currentCancel) {
    try {
      currentCancel();
    } catch {}
    currentCancel = null;
  }
  if (currentSession?.abort) {
    try {
      currentSession.abort();
    } catch {}
  }
  for (const item of speakQueue) {
    item.reject(new Error("Speak queue cleared"));
  }
  speakQueue.length = 0;
  speakBusy = false;
  clearSpeakSessionMeta();
  drainSpeakQueue();
}

export function cancelCurrentSpeak() {
  const had = speakBusy || speakQueue.length > 0 || currentSession;
  cancelActiveAndClear();
  return !!had;
}

export function enqueueSpeak(task, { replace = false } = {}) {
  if (replace) cancelActiveAndClear();
  return new Promise((resolve, reject) => {
    speakQueue.push({ task, resolve, reject, gen: generation });
    drainSpeakQueue();
  });
}

async function drainSpeakQueue() {
  if (speakBusy || speakQueue.length === 0) return;
  speakBusy = true;
  const { task, resolve, reject, gen } = speakQueue.shift();
  const ac = new AbortController();
  currentCancel = () => ac.abort();
  try {
    await task(ac.signal);
    resolve();
  } catch (err) {
    if (ac.signal.aborted || gen !== generation) resolve();
    else reject(err);
  } finally {
    currentCancel = null;
    speakBusy = false;
    drainSpeakQueue();
  }
}