// Session policies: how a quiz presents the same question records.
// `learning`: feedback after each answer. `exam` (prøveeksamen): no feedback until
// the end, questions can be skipped, and the result is pass/fail.

export const POLICIES = {
  learning: {
    id: 'learning',
    label: 'Øvingsmodus',
    feedback: 'immediate', // feedback shown right after each submission
    allowAdvanceBeforeFeedback: false,
    showReferences: true,
    enabled: true,
  },
  exam: {
    id: 'exam',
    label: 'Eksamensmodus',
    feedback: 'deferred', // all feedback after the final submission
    allowAdvanceBeforeFeedback: true,
    showReferences: true,
    enabled: true,
  },
};

export function getPolicy(id) {
  const p = POLICIES[id];
  if (!p) throw new Error(`unknown session policy ${id}`);
  return p;
}
