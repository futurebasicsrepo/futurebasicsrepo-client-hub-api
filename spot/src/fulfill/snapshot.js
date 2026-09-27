// A compact, text-only view of a checkout page for the agent: every
// interactive element gets a ref ("f0:12" = frame 0, element 12) it can act
// on. Payment details are never shown: card-looking values and anything in a
// cc-* field are masked, so the model never sees the card.

// Runs inside each frame. Must be self-contained (it's serialised).
function tagFrame(frameIndex) {
  const MAX = 220;
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const labelOf = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const txt =
      el.getAttribute('aria-label') ||
      (byFor && byFor.innerText) ||
      (el.closest('label') && el.closest('label').innerText) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      el.getAttribute('name') ||
      '';
    return txt.replace(/\s+/g, ' ').trim().slice(0, 60);
  };
  const isPayment = (el) => {
    const hay = [el.getAttribute('autocomplete'), el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder')].join(' ').toLowerCase();
    return /cc-|card|cvc|cvv|security code|expir|verification/.test(hay);
  };
  const mask = (el, v) => {
    if (!v) return '';
    if (isPayment(el) || /\d[\d\s-]{11,}\d/.test(v)) return '•••';
    return v.slice(0, 60);
  };
  let n = 0;
  const nodes = document.querySelectorAll('input, select, textarea, button, a[href], [role="button"], [role="radio"], [role="checkbox"], summary, [contenteditable="true"]');
  for (const el of nodes) {
    if (n >= MAX) break;
    if (el.type === 'hidden' || !visible(el)) continue;
    const ref = `f${frameIndex}:${n++}`;
    el.setAttribute('data-spot-ref', ref);
    const tag = el.tagName.toLowerCase();
    const bits = [`[${ref}]`];
    if (tag === 'input') bits.push(`input[${el.type}]`);
    else if (tag === 'a') bits.push('link');
    else bits.push(tag === 'summary' ? 'toggle' : el.getAttribute('role') || tag);
    const label = tag === 'button' || tag === 'a' || tag === 'summary' || el.getAttribute('role') === 'button' ? (el.innerText || labelOf(el)).replace(/\s+/g, ' ').trim().slice(0, 60) : labelOf(el);
    if (label) bits.push(JSON.stringify(label));
    if (isPayment(el)) bits.push('(payment field)');
    if (tag === 'input' || tag === 'textarea') {
      if (el.type === 'checkbox' || el.type === 'radio') bits.push(el.checked ? 'checked' : 'unchecked');
      else if (el.value) bits.push(`value=${JSON.stringify(mask(el, el.value))}`);
    }
    if (tag === 'select') {
      const opts = [...el.options].slice(0, 12).map((o) => o.text.trim());
      bits.push(`value=${JSON.stringify(el.options[el.selectedIndex]?.text || '')}`, `options=${JSON.stringify(opts)}`);
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') bits.push('disabled');
    out.push(bits.join(' '));
  }
  return out;
}

export async function snapshot(page) {
  const lines = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    try {
      const got = await frames[i].evaluate(tagFrame, i);
      if (got.length && i > 0) lines.push(`-- frame ${i} (${safeHost(frames[i].url())}) --`);
      lines.push(...got);
    } catch {
      // detached or navigating frame: skip it this round
    }
  }
  let text = '';
  try {
    text = await page.evaluate(() => document.body?.innerText || '');
  } catch {}
  text = redactText(text.replace(/\n{3,}/g, '\n\n').trim()).slice(0, 3500);
  return `URL: ${page.url()}\nTITLE: ${await page.title().catch(() => '')}\n\nPAGE TEXT:\n${text}\n\nELEMENTS:\n${lines.join('\n') || '(none)'}`;
}

export function redactText(s) {
  return String(s).replace(/\b\d(?:[ -]?\d){12,18}\b/g, '•••• (card number hidden)');
}

export function locate(page, ref) {
  const m = /^f(\d+):(\d+)$/.exec(String(ref || ''));
  if (!m) throw new Error(`Bad ref "${ref}". Use a ref from ELEMENTS, like f0:12`);
  const frame = page.frames()[Number(m[1])];
  if (!frame) throw new Error(`Frame for ${ref} is gone. Take the latest ELEMENTS list.`);
  return frame.locator(`[data-spot-ref="${ref}"]`).first();
}

export async function isPaymentField(locator) {
  return locator.evaluate((el) => {
    const hay = [el.getAttribute('autocomplete'), el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder')].join(' ').toLowerCase();
    return /cc-|card|cvc|cvv|security code|expir|verification/.test(hay);
  });
}

function safeHost(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'frame';
  }
}
