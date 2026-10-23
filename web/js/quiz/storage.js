// Optional persistence of an in-progress quiz in this browser only. It stores
// question ids, option order and answers - nothing else. Every access is
// wrapped, because storage can be unavailable (private mode, blocked cookies).

const KEY = 'radioquiz.session.v1';

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    const s = store();
    if (s) s.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the quiz still works without it */
  }
}

export function loadSession() {
  try {
    const s = store();
    return s ? s.getItem(KEY) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    const s = store();
    if (s) s.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
