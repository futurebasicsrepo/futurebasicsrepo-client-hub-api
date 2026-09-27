// A tiny Shopify-like store for checkout tests:
//   /products/super-puff(.js)   product page + Shopify product JSON
//   /cart/<variant>:<qty>?checkout[...]   cart permalink → /checkout (prefilled)
//   /checkout                   guest checkout; card fields live in an iframe
//                               on a *different origin*, like real stores
//   /complete                   "Thank you, order #1042"
import http from 'node:http';

export async function startFakeStore() {
  const orders = [];
  const card = http.createServer((req, res) => {
    // The card iframe. The parent asks for the values over postMessage,
    // since it can't read a cross-origin frame (same as real PCI iframes).
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><body style="font:14px sans-serif">
<label>Card number <input id="n" autocomplete="cc-number" inputmode="numeric"></label><br>
<label>Expiration date (MM / YY) <input id="e" autocomplete="cc-exp"></label><br>
<label>Security code <input id="c" autocomplete="cc-csc"></label><br>
<label>Name on card <input id="h" autocomplete="cc-name"></label>
<script>addEventListener('message',e=>{if(e.data==='collect')parent.postMessage({n:n.value,e:e2.value,c:c.value,h:h.value},'*')});const e2=document.getElementById('e')</script></body>`);
  });
  await new Promise((r) => card.listen(0, '127.0.0.1', r));
  const cardOrigin = `http://127.0.0.1:${card.address().port}`;

  const variants = [
    { id: 111, title: 'Black / S', option1: 'Black', option2: 'S', price: 25000, available: true },
    { id: 112, title: 'Black / M', option1: 'Black', option2: 'M', price: 25000, available: true },
    { id: 113, title: 'Cream / M', option1: 'Cream', option2: 'M', price: 25000, available: false },
  ];

  const store = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const html = (s) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><head><title>Fake Aritzia</title></head><body style="font:14px sans-serif">${s}</body></html>`);
    };
    if (url.pathname === '/products/super-puff.js') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ title: 'Super Puff Shorty', variants }));
    }
    if (url.pathname === '/products/super-puff') return html('<h1>Super Puff Shorty</h1><p>$250.00</p>');
    const cart = url.pathname.match(/^\/cart\/([\d:,]+)$/);
    if (cart) {
      res.statusCode = 302;
      res.setHeader('location', `/checkout?lines=${cart[1]}&${url.searchParams.toString()}`);
      return res.end();
    }
    if (url.pathname === '/checkout') {
      const q = (k) => (url.searchParams.get(k) || '').replace(/"/g, '&quot;');
      const lines = url.searchParams.get('lines') || '';
      const subtotal = lines.split(',').reduce((s, l) => {
        const [id, n] = l.split(':').map(Number);
        return s + (variants.find((v) => v.id === id)?.price || 0) * n;
      }, 0);
      const bump = Number(url.searchParams.get('bump') || 0);
      return html(`<h1>Checkout</h1>
<div id="cookie">We use cookies <button onclick="this.parentNode.remove()">Accept</button></div>
<form id="f" method="post" action="/complete">
<input type="hidden" name="lines" value="${lines}">
<label>Email <input name="email" value="${q('checkout[email]')}"></label>
<label><input type="checkbox" name="news"> Email me with news and offers</label>
<label>First name <input name="first" value="${q('checkout[shipping_address][first_name]')}"></label>
<label>Last name <input name="last" value="${q('checkout[shipping_address][last_name]')}"></label>
<label>Address <input name="address1" value="${q('checkout[shipping_address][address1]')}"></label>
<label>City <input name="city" value="${q('checkout[shipping_address][city]')}"></label>
<label>ZIP code <input name="zip" value="${q('checkout[shipping_address][zip]')}"></label>
<fieldset><legend>Shipping method</legend>
<label><input type="radio" name="ship" value="standard"> Standard $0.00</label>
<label><input type="radio" name="ship" value="express"> Express $25.00</label></fieldset>
<iframe id="pay" src="${cardOrigin}/card" style="width:420px;height:140px"></iframe>
<input type="hidden" name="card">
<p>Subtotal $${(subtotal / 100).toFixed(2)} · Taxes $12.50 · <b>Total $${((subtotal + 1250 + bump) / 100).toFixed(2)}</b></p>
<a href="${cardOrigin}/elsewhere">Our partner deals</a>
<button type="button" id="pay-now">Pay now</button>
</form>
<script>
document.getElementById('pay-now').onclick=()=>{
  addEventListener('message',e=>{f.card.value=JSON.stringify(e.data);f.submit()},{once:true});
  document.getElementById('pay').contentWindow.postMessage('collect','*');
};
</script>`);
    }
    if (url.pathname === '/complete' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const f = Object.fromEntries(new URLSearchParams(body));
        f.card = JSON.parse(f.card || '{}');
        orders.push(f);
        html(`<h1>Thank you, ${f.first}!</h1><p>Order #${1041 + orders.length} is confirmed.</p>`);
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise((r) => store.listen(0, '127.0.0.1', r));
  const origin = `http://localhost:${store.address().port}`;
  return {
    origin,
    cardOrigin,
    orders,
    close: () => Promise.all([new Promise((r) => store.close(r)), new Promise((r) => card.close(r))]),
  };
}

// Plays the model: reads the page it was shown and picks the next tool,
// the way the real agent would, including a couple of mistakes the
// guardrails must catch. Records every request so tests can check the
// card never reached "the model".
export function scriptedModel({ misbehave = true, total: forcedTotal } = {}) {
  const requests = [];
  let n = 0;
  const lastPage = (messages) => {
    const m = messages.at(-1);
    return typeof m.content === 'string' ? m.content : m.content.map((b) => b.content).join('\n');
  };
  const ref = (page, re) => page.split('\n').find((l) => re.test(l))?.match(/^\[(f\d+:\d+)\]/)?.[1];
  const use = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t${++n}`, name, input }] });
  const done = new Set();
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          requests.push(JSON.parse(JSON.stringify(req)));
          const page = lastPage(req.messages);
          if (/Thank you/.test(page)) return use('order_placed', { order_number: page.match(/Order #(\d+)/)?.[1] });
          if (/confirmed and the order button was clicked/.test(page) && !/Thank you/.test(page)) return use('need_human', { reason: 'no confirmation page' });
          if (misbehave && !done.has('offsite')) {
            done.add('offsite');
            return use('click', { ref: ref(page, /link "Our partner deals"/) });
          }
          if (misbehave && !done.has('typecard')) {
            done.add('typecard');
            return use('type', { ref: ref(page, /Card number/), text: '4242424242424242' });
          }
          if (!done.has('cookie')) {
            done.add('cookie');
            return use('click', { ref: ref(page, /button "Accept"/) });
          }
          if (!done.has('ship')) {
            done.add('ship');
            return use('click', { ref: ref(page, /input\[radio\] "Standard/) });
          }
          if (!done.has('pay')) {
            done.add('pay');
            return use('fill_payment', {
              number_ref: ref(page, /"Card number/),
              expiry_ref: ref(page, /"Expiration date/),
              cvc_ref: ref(page, /"Security code/),
              name_ref: ref(page, /"Name on card/),
            });
          }
          const total = forcedTotal || page.match(/Total (\$[\d.,]+)/)?.[1];
          return use('ready_to_place_order', { total, summary: 'Super Puff Shorty (Black / M), Standard shipping', place_order_ref: ref(page, /button "Pay now"/) });
        },
      },
    },
  };
  return { client, requests };
}
