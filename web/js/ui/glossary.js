// Accessible glossary popovers for <button class="term" data-term="…"> elements.
//
// * hover (mouse), keyboard focus: preview, closes when the pointer/focus leaves;
// * click / tap / Enter / Space: pins it open until Escape, the close button, a
//   second click or a tap elsewhere;
// * the popover is inserted right after its button, so Tab order stays natural;
// * clicks inside a term or popover never reach an enclosing <label>, so opening
//   an explanation cannot select an answer.

const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 250;

export function createGlossary(getGlossary, doc = document) {
  let pop = null;
  let activeBtn = null;
  let pinned = false;
  let openTimer = 0;
  let closeTimer = 0;

  function build(term) {
    const el = doc.createElement('span');
    el.className = 'term-pop';
    el.id = 'term-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-labelledby', 'term-pop-title');
    const title = doc.createElement('span');
    title.className = 'term-pop-title';
    title.id = 'term-pop-title';
    title.textContent = term.nb[0];
    el.appendChild(title);
    const en = doc.createElement('span');
    en.className = 'term-pop-en';
    en.append('Engelsk: ');
    const enTxt = doc.createElement('span');
    enTxt.lang = 'en';
    enTxt.textContent = term.en.join(', ');
    en.appendChild(enTxt);
    el.appendChild(en);
    const def = doc.createElement('span');
    def.className = 'term-pop-def';
    def.textContent = term.definition;
    el.appendChild(def);
    const glossary = getGlossary();
    const related = (term.related || []).map((r) => glossary[r] && glossary[r].nb[0]).filter(Boolean);
    if (related.length) {
      const rel = doc.createElement('span');
      rel.className = 'term-pop-rel';
      rel.textContent = `Se også: ${related.join(', ')}`;
      el.appendChild(rel);
    }
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'term-pop-close';
    close.setAttribute('aria-label', 'Lukk ordforklaring');
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
    });
    el.addEventListener('click', (e) => {
      // never let a click in the popover activate an enclosing <label>
      if (e.target !== close) e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    el.addEventListener('mouseleave', () => scheduleClose());
    el.addEventListener('focusout', (e) => {
      if (!pinned && !el.contains(e.relatedTarget) && e.relatedTarget !== activeBtn) hide(false);
    });
    return el;
  }

  function position() {
    if (!pop || !activeBtn) return;
    const parent = pop.offsetParent || doc.body;
    const pr = parent.getBoundingClientRect();
    const br = activeBtn.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const width = Math.min(320, vw - 32);
    pop.style.width = `${width}px`;
    let left = br.left;
    if (left + width > vw - 16) left = vw - 16 - width;
    left = Math.max(16, left);
    pop.style.left = `${left - pr.left + (parent.scrollLeft || 0)}px`;
    pop.style.top = `${br.bottom - pr.top + 6 + (parent.scrollTop || 0)}px`;
  }

  function show(btn, pin) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    const term = getGlossary()[btn.dataset.term];
    if (!term) return;
    if (activeBtn !== btn) hide(false);
    if (!pop) {
      pop = build(term);
      btn.insertAdjacentElement('afterend', pop);
    }
    activeBtn = btn;
    pinned = pinned || pin;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', 'term-pop');
    btn.classList.toggle('is-pinned', pinned);
    position();
  }

  function hide(returnFocus) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    const btn = activeBtn;
    if (pop) pop.remove();
    pop = null;
    pinned = false;
    activeBtn = null;
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-controls');
      btn.classList.remove('is-pinned');
      if (returnFocus) btn.focus();
    }
  }

  function scheduleClose() {
    clearTimeout(closeTimer);
    if (!pinned) closeTimer = setTimeout(() => hide(false), HOVER_CLOSE_MS);
  }

  const termOf = (e) => (e.target instanceof Element ? e.target.closest('button.term') : null);

  function onClick(e) {
    const btn = termOf(e);
    if (btn) {
      e.preventDefault(); // inside a <label>: do not select the answer
      e.stopPropagation();
      if (activeBtn === btn && pinned) hide(false);
      else show(btn, true);
      return;
    }
    if (pop && pinned && !pop.contains(e.target)) hide(false);
  }

  function onPointerDown(e) {
    if (pop && !pop.contains(e.target) && !termOf(e)) hide(false);
  }

  function onOver(e) {
    const btn = termOf(e);
    if (!btn || pinned) return;
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    openTimer = setTimeout(() => show(btn, false), HOVER_OPEN_MS);
  }

  function onOut(e) {
    const btn = termOf(e);
    if (!btn) return;
    clearTimeout(openTimer);
    if (!pop || (e.relatedTarget && pop.contains(e.relatedTarget))) return;
    scheduleClose();
  }

  function onFocusIn(e) {
    const btn = termOf(e);
    if (btn && activeBtn !== btn) show(btn, false);
  }

  function onFocusOut(e) {
    const btn = termOf(e);
    if (!btn || btn !== activeBtn || pinned) return;
    if (pop && e.relatedTarget && pop.contains(e.relatedTarget)) return;
    hide(false);
  }

  function onKey(e) {
    if (e.key === 'Escape' && pop) {
      const focusWasInside = pop.contains(doc.activeElement) || doc.activeElement === activeBtn;
      hide(focusWasInside);
      e.stopPropagation();
    }
  }

  const onResize = () => position();

  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerdown', onPointerDown);
  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('mouseout', onOut);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('keydown', onKey);
  globalThis.addEventListener('resize', onResize);

  return {
    close: () => hide(false),
    get open() { return Boolean(pop); },
    destroy() {
      hide(false);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('mouseover', onOver);
      doc.removeEventListener('mouseout', onOut);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('resize', onResize);
    },
  };
}
