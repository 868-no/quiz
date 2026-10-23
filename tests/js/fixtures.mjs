// Synthetic public banks for JS tests. Clearly labelled; not real content.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
const templatesJson = JSON.parse(readFileSync(join(ROOT, 'content', 'visuals', 'templates.json'), 'utf8'));
export const TEMPLATES = Object.fromEntries(templatesJson.templates.map((t) => [`${t.id}@${t.version}`, t]));

function question(id, chapter, section, extra = {}) {
  return {
    id, rev: 1, chapter, sections: [section], topics: [], difficulty: 'easy', style: 'concept', priority: 'normal',
    context: [], stem: [`SYNTETISK spørsmål ${id}?`],
    options: [
      { id: 'o1', content: [`Riktig ${id}`], feedback: [] },
      { id: 'o2', content: [`Feil A ${id}`], feedback: ['Fordi A.'] },
      { id: 'o3', content: [`Feil B ${id}`], feedback: ['Fordi B.'] },
      { id: 'o4', content: [`Feil C ${id}`], feedback: ['Fordi C.'] },
    ],
    correct: ['o1'], explanation: [`Forklaring ${id}.`], visual: null, glossary_after_answer: [],
    ref: { chapter, section: null, pages: [`${chapter}-1`] },
    ...extra,
  };
}

export function makeBank({ perChapter = { 2: 6, 3: 3, 6: 2 } } = {}) {
  const questions = [];
  for (const [ch, n] of Object.entries(perChapter)) {
    for (let i = 0; i < n; i++) questions.push(question(`q-${ch}${String(i).padStart(3, '0')}`, Number(ch), `s${ch}-${i % 2}`));
  }
  const counts = {};
  questions.forEach((q) => { counts[q.chapter] = (counts[q.chapter] || 0) + 1; });
  return {
    schema: 1, mode: 'production', built_at: 'x', bank_id: 'test', book: { title: 'Testbok' },
    chapters: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      number: n, title: n <= 6 ? `Kapittel-tittel ${n}` : null,
      status: counts[n] ? 'available' : n <= 6 ? 'no_questions' : 'upcoming', questions: counts[n] || 0,
    })),
    sections: {}, topics: {},
    glossary: {
      strom: { id: 'strom', nb: ['strøm'], en: ['current'], definition: 'Ladning som flyter per tidsenhet.', related: [] },
      hemmelig: { id: 'hemmelig', nb: ['hemmelig'], en: ['secret'], definition: 'Avslører svaret.', related: [] },
    },
    templates: { 'dc-circuit@1': TEMPLATES['dc-circuit@1'] },
    questions,
  };
}

export { question };
