// Loading and defensive validation of the public question bank. The publish step
// already validates everything; this guards against a corrupt or tampered file.
// Invalid questions are dropped (never shown half-broken).

import { resolveParams } from '../visuals/registry.js';

const TOP = ['schema', 'mode', 'bank_id', 'chapters', 'questions', 'glossary', 'templates', 'sections', 'topics', 'book'];

function termRefs(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => termRefs(v, out));
  else if (value && typeof value === 'object') {
    if (typeof value.term === 'string') out.push(value.term);
    for (const k of ['steps', 'note']) if (k in value) termRefs(value[k], out);
  }
  return out;
}

export function validateQuestion(q, bank) {
  const errors = [];
  if (typeof q.id !== 'string' || !Number.isInteger(q.rev)) errors.push('id/rev');
  if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('options');
  const ids = (q.options || []).map((o) => o.id);
  if (new Set(ids).size !== ids.length) errors.push('option ids');
  if (!Array.isArray(q.correct) || q.correct.length !== 1 || !ids.includes(q.correct[0])) errors.push('correct');
  if (!bank.chapters.some((c) => c.number === q.chapter && c.status === 'available')) errors.push('chapter');
  const refs = termRefs([q.context, q.stem, q.explanation, ...(q.options || []).flatMap((o) => [o.content, o.feedback])]);
  for (const t of refs) if (!bank.glossary[t]) errors.push(`term ${t}`);
  if (q.visual) {
    const tpl = bank.templates[`${q.visual.template}@${q.visual.version}`];
    const r1 = resolveParams(q.visual, tpl, 'before');
    const r2 = resolveParams(q.visual, tpl, 'after');
    errors.push(...r1.errors, ...r2.errors);
  }
  return errors;
}

export function validateBank(bank) {
  if (!bank || typeof bank !== 'object') return { ok: false, error: 'Spørsmålsbanken kunne ikke leses.' };
  for (const k of TOP) if (!(k in bank)) return { ok: false, error: `Spørsmålsbanken mangler feltet «${k}».` };
  if (bank.schema !== 1) return { ok: false, error: 'Spørsmålsbanken har en ukjent versjon.' };
  const dropped = [];
  const questions = bank.questions.filter((q) => {
    const errs = validateQuestion(q, bank);
    if (errs.length) dropped.push({ id: q.id, errs });
    return errs.length === 0;
  });
  const counts = new Map();
  for (const q of questions) counts.set(q.chapter, (counts.get(q.chapter) || 0) + 1);
  const chapters = bank.chapters.map((c) => ({
    ...c,
    questions: counts.get(c.number) || 0,
    status: c.status === 'available' && !counts.get(c.number) ? 'no_questions' : c.status,
  }));
  return { ok: true, bank: { ...bank, questions, chapters }, dropped };
}

export async function loadBank(url = 'data/bank.json') {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    return { ok: false, error: 'Kunne ikke hente spørsmålene. Sjekk nettforbindelsen og last siden på nytt.' };
  }
  if (!res.ok) return { ok: false, error: `Kunne ikke hente spørsmålene (HTTP ${res.status}).` };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Spørsmålsbanken er skadet og kan ikke leses.' };
  }
  return validateBank(data);
}
