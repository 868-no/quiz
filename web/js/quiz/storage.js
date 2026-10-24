// Optional persistence in this browser only: an in-progress quiz (question ids,
// option order and answers), the list of questions answered wrong, the questions
// answered right at least once (progress), and the last chosen mode (practice or
// practice exam). Nothing else is stored. Every access is wrapped, because storage can be unavailable
// (private mode, blocked cookies).

const SESSION_KEY = 'radioquiz.session.v1';
const MISSED_KEY = 'radioquiz.missed.v1';
const SOLVED_KEY = 'radioquiz.solved.v1';
const MODE_KEY = 'radioquiz.mode.v1';

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    const s = store();
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    const s = store();
    if (s) s.setItem(key, value);
  } catch {
    /* storage full or blocked: the quiz still works without it */
  }
}

function remove(key) {
  try {
    const s = store();
    if (s) s.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const saveSession = (session) => write(SESSION_KEY, JSON.stringify(session));
export const loadSession = () => read(SESSION_KEY);
export const clearSession = () => remove(SESSION_KEY);

export const saveMissed = (missed) => write(MISSED_KEY, JSON.stringify(missed));
export const loadMissed = () => read(MISSED_KEY);
export const clearMissed = () => remove(MISSED_KEY);

export const saveSolved = (solved) => write(SOLVED_KEY, JSON.stringify(solved));
export const loadSolved = () => read(SOLVED_KEY);
export const clearSolved = () => remove(SOLVED_KEY);

export const saveMode = (mode) => write(MODE_KEY, mode);
export const loadMode = () => read(MODE_KEY);
