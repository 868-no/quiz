// Questions answered wrong in this browser. A question is added when it is
// answered wrong and removed the next time it is answered right. Pure functions;
// storage lives in storage.js.

/** Parse the stored list; anything malformed counts as empty. Shape: {qid: timestamp}. */
export function parseMissed(raw) {
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
    const out = {};
    for (const [qid, at] of Object.entries(m)) if (/^q-\d+$/.test(qid) && Number.isFinite(at)) out[qid] = at;
    return out;
  } catch {
    return {};
  }
}

/** Returns a new list with the answer recorded. */
export function recordAnswer(missed, qid, correct, now = Date.now()) {
  const out = { ...missed };
  if (correct) delete out[qid];
  else out[qid] = now;
  return out;
}

/** Ids on the list that are still published in an available chapter, oldest mistake first. */
export function missedIds(missed, bank) {
  const available = new Set(bank.chapters.filter((c) => c.status === 'available').map((c) => c.number));
  const published = new Set(bank.questions.filter((q) => available.has(q.chapter)).map((q) => q.id));
  return Object.keys(missed).filter((id) => published.has(id)).sort((a, b) => missed[a] - missed[b]);
}
