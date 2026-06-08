/*
INPUTS
└── task: async function
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

export function enqueueSpeak(task) {
  return new Promise((resolve, reject) => {
    speakQueue.push({ task, resolve, reject });
    drainSpeakQueue();
  });
}

async function drainSpeakQueue() {
  if (speakBusy || speakQueue.length === 0) return;
  speakBusy = true;
  const { task, resolve, reject } = speakQueue.shift();
  try {
    await task();
    resolve();
  } catch (err) {
    reject(err);
  } finally {
    speakBusy = false;
    drainSpeakQueue();
  }
}