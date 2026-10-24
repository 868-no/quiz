// What this browser remembers about answers, as {qid: timestamp} lists:
// * missed: answered wrong and not answered right since (added on a wrong
//   answer, removed on the next right one);
// * solved: answered right at least once (progress per chapter).
// Pure functions; storage lives in storage.js.

/** Parse a stored list; anything malformed counts as empty. Shape: {qid: timestamp}. */
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

/** Returns a new solved list with the answer recorded (a wrong answer changes nothing). */
export function recordSolved(solved, qid, correct, now = Date.now()) {
  if (!correct || qid in solved) return solved;
  return { ...solved, [qid]: now };
}

/** {chapter: number of its published questions answered right at least once}. */
export function solvedByChapter(solved, bank) {
  const out = {};
  for (const q of bank.questions) if (q.id in solved) out[q.chapter] = (out[q.chapter] || 0) + 1;
  return out;
}
