// Affiliate links: when a person (not Spot's card) goes to a store to pay,
// the link can carry an affiliate tag, so the store pays Spot a commission
// on the sale. The payer's price never changes, and the pay page says so.
//
//   SPOT_AFFILIATE_KEY      a link network's publisher key; stores in the
//                           network pay, the rest just redirect
//   SPOT_AFFILIATE_NETWORK  'sovrn' (default) or 'skimlinks'
//   SPOT_AMAZON_TAG         Amazon Associates tag, for Amazon links
//
// Never used when Spot buys with its own card: buying through your own
// affiliate link breaks every network's rules.
const AMAZON = /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|com\.mx|in)$/i;

const hostOf = (u) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export function createAffiliate(env = process.env) {
  const key = String(env.SPOT_AFFILIATE_KEY || '').trim();
  const network = String(env.SPOT_AFFILIATE_NETWORK || 'sovrn').toLowerCase();
  const amazonTag = String(env.SPOT_AMAZON_TAG || '').trim();

  // The link to send a person to, and which network it goes through (or null).
  function wrap(url, { ref } = {}) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { url, via: null };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url, via: null };
    if (AMAZON.test(u.hostname)) {
      if (!amazonTag) return { url, via: null };
      u.searchParams.set('tag', amazonTag);
      return { url: u.toString(), via: 'amazon' };
    }
    if (!key) return { url, via: null };
    const sub = ref ? String(ref).slice(0, 40) : '';
    if (network === 'skimlinks') {
      return { url: `https://go.skimresources.com/?id=${encodeURIComponent(key)}&xs=1&url=${encodeURIComponent(u.toString())}${sub ? `&xcust=${encodeURIComponent(sub)}` : ''}`, via: 'skimlinks' };
    }
    return { url: `https://sovrn.co?key=${encodeURIComponent(key)}&u=${encodeURIComponent(u.toString())}${sub ? `&cuid=${encodeURIComponent(sub)}` : ''}`, via: 'sovrn' };
  }

  // Would a person's trip to this store carry a tag? (For the disclosure.)
  const covers = (url) => (AMAZON.test(hostOf(url)) ? Boolean(amazonTag) : Boolean(key));

  return { wrap, covers, enabled: Boolean(key || amazonTag) };
}
