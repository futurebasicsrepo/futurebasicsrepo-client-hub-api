// Who has the ball on a product right now: the client, Future Basics or the factory. One rule, read from what is already on the product, so every screen says the same thing.
//   1. The tech pack comes first while it is unfinished: the client drafts it, Future Basics publishes it, then it is signed in turn (client → Future Basics → factory).
//   2. Otherwise the current step of the product's flow says who it is waiting on.
// Returns { who: 'client' | 'future-basics' | 'factory' | null, why }.
(function (root) {
  'use strict';
  const WHO = { client: 'Client', 'future-basics': 'Future Basics', factory: 'Factory' };
  function ballFor(p) {
    if (!p) return { who: null, why: '' };
    const t = p.tech_pack;
    if (t) {
      if (!t.published_at) {
        if (t.initiated_by === 'client') {
          if (t.status === 'submitted') return { who: 'future-basics', why: 'Submitted by the client: Future Basics reviews and publishes v1' };
          if (t.ai_status === 'pending') return { who: 'future-basics', why: 'The assistant is reading the photo' };
          return { who: 'client', why: 'The client is drafting the tech pack' };
        }
        return { who: 'future-basics', why: 'Future Basics is writing the tech pack' };
      }
      const v = t.version;
      if (t.quote_waiting) return { who: 'factory', why: 'Out for quotation: waiting for the factory\'s price' }; // a factory asked to quote holds the ball until it answers, whoever still has to sign
      if (!t.client_signed) return { who: 'client', why: `Tech pack v${v} is waiting for the client to review and sign` };
      if (!t.brand_signed) return { who: 'future-basics', why: `Tech pack v${v} is waiting for Future Basics to sign` };
      if (!t.factory_signed && !t.locked_at) return { who: 'factory', why: `Tech pack v${v} is waiting for the factory to acknowledge` };
    }
    const ms = Array.isArray(p.milestones) ? p.milestones : [], cur = ms.find(m => m && m.status === 'current');
    const who = (cur && cur.responsible_party) || p.waiting_on || null;
    if (who && WHO[who]) return { who, why: cur ? `${cur.name || 'This step'} is waiting on ${WHO[who]}` : `Waiting on ${WHO[who]}` };
    return { who: null, why: '' };
  }
  // The little moving marker: a ball in the party's colour, bouncing, with its name. `mine` is the viewer's own side ("Your move" for the client).
  function ballHtml(p, { mine = null } = {}) {
    const b = ballFor(p); if (!b.who) return '';
    const label = mine && b.who === mine ? 'Your move' : WHO[b.who], esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<em class="ball ball-${b.who}" title="${esc(b.why)}" data-ball="${b.who}"><i></i><b>${esc(label)}</b></em>`;
  }
  const api = { ballFor, ballHtml, WHO };
  root.FBBall = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
