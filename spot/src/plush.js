// Spot, the plush. One drawing for every place Spot appears: soft fleece
// (fabric grain, fuzzy edges and a velvety rim where the fibres catch the
// light), white felt eye patches with glossy safety-eye pupils, an
// embroidered mouth, felt cheeks, a hanging loop on top and a little sewn-in
// tag. It's all SVG, so the arms still wave, the eyes still follow the
// pointer and the face still turns happy.
//
// Two class schemes, because two scripts drive it:
//   home page (spotfx.js): .spotb with .sb-eyes/.sb-pupils/.sb-smile/.sb-joy/.sb-grin
//   pay pages (pages.js):  #buddy with .open/.pupils/.joy, toggled inline
// `id` keeps the gradient and filter ids unique per copy on a page.

const FABRIC = { lit: '#ff9a6b', mid: '#ff6638', deep: '#d9461f', edge: '#b9381a', limb: '#f05a2f' };

function defs(id) {
  return `<defs>
<radialGradient id="pl-body-${id}" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="${FABRIC.lit}"/><stop offset=".5" stop-color="${FABRIC.mid}"/><stop offset=".86" stop-color="${FABRIC.deep}"/><stop offset="1" stop-color="${FABRIC.edge}"/></radialGradient>
<radialGradient id="pl-limb-${id}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#ff8352"/><stop offset=".7" stop-color="${FABRIC.limb}"/><stop offset="1" stop-color="${FABRIC.edge}"/></radialGradient>
<linearGradient id="pl-rim-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2b5" stop-opacity=".9"/><stop offset=".45" stop-color="#ffc4a2" stop-opacity=".25"/><stop offset=".7" stop-color="#ffc4a2" stop-opacity="0"/></linearGradient>
<radialGradient id="pl-ao-${id}" cx="46%" cy="30%" r="74%"><stop offset=".55" stop-color="#5a1a06" stop-opacity="0"/><stop offset="1" stop-color="#5a1a06" stop-opacity=".36"/></radialGradient>
<radialGradient id="pl-felt-${id}" cx="42%" cy="34%" r="70%"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#efe4d4"/></radialGradient>
<radialGradient id="pl-eye-${id}" cx="40%" cy="34%" r="70%"><stop offset="0" stop-color="#4b3a33"/><stop offset=".55" stop-color="#1c1411"/><stop offset="1" stop-color="#070504"/></radialGradient>
<radialGradient id="pl-shadow-${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1b1712" stop-opacity=".26"/><stop offset="1" stop-color="#1b1712" stop-opacity="0"/></radialGradient>
<filter id="pl-fleece-${id}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="3" seed="7" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="fuzz"/>
<feDiffuseLighting in="n" surfaceScale=".9" diffuseConstant="1.05" lighting-color="#fff" result="lit"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>
<feComposite in="lit" in2="fuzz" operator="arithmetic" k1=".34" k2="0" k3=".72" k4="0" result="pile"/>
<feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="11" result="m"/>
<feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .5 0 0 0 0" result="mottle"/>
<feComposite in="mottle" in2="pile" operator="arithmetic" k1=".1" k2="0" k3=".95" k4="0"/>
</filter>
<filter id="pl-feltf-${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="fuzz"/>
<feDiffuseLighting in="n" surfaceScale=".7" diffuseConstant="1" lighting-color="#fff" result="lit"><feDistantLight azimuth="235" elevation="60"/></feDiffuseLighting>
<feComposite in="lit" in2="fuzz" operator="arithmetic" k1=".34" k2="0" k3=".7" k4="0"/>
</filter>
<filter id="pl-soft-${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>`;
}

// Embroidery: a dark thread with a lighter twist over it, so the stitches read.
const thread = (d, w = 4.6, extra = '') => `<path d="${d}" stroke="#2e1a13" stroke-width="${w}" fill="none" stroke-linecap="round"${extra}/><path d="${d}" stroke="#7a4a39" stroke-width="${(w * 0.62).toFixed(1)}" stroke-dasharray=".9 1.8" fill="none" stroke-linecap="round" opacity=".75"${extra}/>`;

function face(id, { legacy, happy }) {
  const eyes = `<g class="sb-eyes">
<g filter="url(#pl-feltf-${id})"><ellipse cx="96" cy="122" rx="17.5" ry="20.5" fill="url(#pl-felt-${id})"/><ellipse cx="144" cy="122" rx="17.5" ry="20.5" fill="url(#pl-felt-${id})"/></g>
<ellipse cx="96" cy="122" rx="15" ry="18" fill="none" stroke="#d9cbb7" stroke-width="1.1" stroke-dasharray="1.4 2.2"/><ellipse cx="144" cy="122" rx="15" ry="18" fill="none" stroke="#d9cbb7" stroke-width="1.1" stroke-dasharray="1.4 2.2"/>
<g class="sb-pupils pupils">
<circle cx="96" cy="127" r="10.5" fill="url(#pl-eye-${id})"/><circle cx="144" cy="127" r="10.5" fill="url(#pl-eye-${id})"/>
<circle cx="96" cy="127" r="10" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1"/><circle cx="144" cy="127" r="10" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>
<ellipse cx="100" cy="122.4" rx="3.6" ry="2.7" fill="#fff" transform="rotate(-20 100 122.4)"/><ellipse cx="148" cy="122.4" rx="3.6" ry="2.7" fill="#fff" transform="rotate(-20 148 122.4)"/>
<circle cx="92" cy="131.5" r="1.3" fill="#fff" opacity=".55"/><circle cx="140" cy="131.5" r="1.3" fill="#fff" opacity=".55"/>
</g></g>`;
  const smile = `<g class="sb-smile">${thread('M106 158 q14 11 28 0')}</g>`;
  const joy = `<g class="sb-joy">${thread('M82 126 q14 -16 28 0M130 126 q14 -16 28 0', 6)}</g>`;
  const grin = `<g class="sb-grin"><g filter="url(#pl-feltf-${id})"><path d="M100 153 q20 31 40 0 z" fill="#3a1a12"/><path d="M110 165.5 q10 7 20 0 q-10 -3 -20 0z" fill="#ff8fa0"/></g>${thread('M100 153 q20 31 40 0 z', 2.4, ' stroke-linejoin="round"')}</g>`;
  const cheeks = `<g filter="url(#pl-feltf-${id})" opacity=".92"><circle cx="72" cy="152" r="11.5" fill="#ff9c84"/><circle cx="168" cy="152" r="11.5" fill="#ff9c84"/></g>
<circle cx="72" cy="152" r="9.6" fill="none" stroke="#e8735e" stroke-width=".9" stroke-dasharray="1.2 2"/><circle cx="168" cy="152" r="9.6" fill="none" stroke="#e8735e" stroke-width=".9" stroke-dasharray="1.2 2"/>`;
  // The pay pages toggle .open / .joy inline; the home page toggles with .happy.
  if (legacy) return `<g class="sb-face"><g class="open"${happy ? ' style="display:none"' : ''}>${eyes}${smile}</g><g class="joy"${happy ? '' : ' style="display:none"'}>${joy.replace('class="sb-joy"', '')}${grin.replace('class="sb-grin"', '')}</g>${cheeks}</g>`;
  return `<g class="sb-face">${eyes}${joy}${smile}${grin}${cheeks}</g>`;
}

export function plushSpot({ id = 'p', cls = 'spotb', attrs = '', happy = false, legacy = false } = {}) {
  const limb = `url(#pl-limb-${id})`;
  return `<svg class="${cls}${happy ? ' happy' : ''}" viewBox="0 0 240 262" aria-hidden="true"${attrs}>
${defs(id)}
<ellipse class="sb-shadow" cx="120" cy="248" rx="70" ry="11" fill="url(#pl-shadow-${id})"/>
<g class="sb-all">
<g class="sb-loop" filter="url(#pl-feltf-${id})"><path d="M111 57 C102 26 138 26 129 57" stroke="#e8b46a" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="M111 57 C102 26 138 26 129 57" stroke="#b97d34" stroke-width="5.5" stroke-dasharray="1 2.4" fill="none" opacity=".35"/><path d="M112.6 52 C107 31 133 31 127.4 52" stroke="#fff2d6" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".55"/></g>
<g class="sb-tag" transform="rotate(32 186 210)"><rect x="176" y="203" width="32" height="17" rx="2.5" fill="#fbf5ec"/><rect x="176" y="203" width="32" height="17" rx="2.5" fill="none" stroke="#e6dac8" stroke-width=".8"/><text x="194" y="214.6" text-anchor="middle" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="8" letter-spacing=".6" fill="#ff5a36">SPOT</text><path d="M176 203 h5 v17 h-5z" fill="#000" opacity=".07"/></g>
<g class="sb-feet" filter="url(#pl-fleece-${id})"><ellipse cx="93" cy="229" rx="22" ry="13" fill="${limb}"/><ellipse cx="147" cy="229" rx="22" ry="13" fill="${limb}"/></g>
<g class="sb-arm sb-arm-l" filter="url(#pl-fleece-${id})"><ellipse cx="28" cy="176" rx="14.5" ry="27" fill="${limb}" transform="rotate(24 28 176)"/></g>
<g class="sb-arm sb-arm-r" filter="url(#pl-fleece-${id})"><ellipse cx="212" cy="176" rx="14.5" ry="27" fill="${limb}" transform="rotate(-24 212 176)"/></g>
<g filter="url(#pl-fleece-${id})">
<circle cx="120" cy="134" r="88" fill="url(#pl-body-${id})"/>
<circle cx="120" cy="134" r="88" fill="url(#pl-ao-${id})"/>
<circle cx="120" cy="134" r="85" fill="none" stroke="url(#pl-rim-${id})" stroke-width="6" filter="url(#pl-soft-${id})"/>
</g>
${face(id, { legacy, happy })}
</g></svg>`;
}
