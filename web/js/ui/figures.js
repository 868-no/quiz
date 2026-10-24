// Keeps figures readable on narrow screens. The stylesheet lets a figure shrink
// to its template's minimum scale (data-min-scale, via --fig-min) and no further;
// a figure that is then wider than its frame scrolls sideways, gets a hint, and
// can be scrolled with the keyboard.

export function fitFigures(root) {
  for (const fig of root.querySelectorAll('figure.fig')) {
    const svg = fig.querySelector('.fig-svg');
    const canvas = fig.querySelector('.fig-canvas');
    const hint = fig.querySelector('.fig-pan-hint');
    if (!svg || !canvas) continue;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const minScale = Number(fig.dataset.minScale) || 0.6;
    if (vb && vb.width) svg.style.setProperty('--fig-min', `${Math.round(vb.width * minScale)}px`);
    const wide = canvas.scrollWidth > canvas.clientWidth + 1;
    if (hint) hint.hidden = !wide;
    if (wide) {
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('role', 'region');
      canvas.setAttribute('aria-label', 'Figur som kan rulles sideveis');
    } else {
      canvas.removeAttribute('tabindex');
      canvas.removeAttribute('role');
      canvas.removeAttribute('aria-label');
    }
  }
}
