// Session policies: how a quiz presents the same question records.
// Only `learning` is offered in the MVP. `exam` is defined so that adding it later
// is a presentation change, not a content change.

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
    enabled: false, // not part of the MVP
  },
};

export function getPolicy(id) {
  const p = POLICIES[id];
  if (!p) throw new Error(`unknown session policy ${id}`);
  return p;
}
