// Apple Pay / Google Pay in one tap, wherever something can be paid for.
// The wallet's sheet collects where it ships; Spot prices it for that ZIP
// (quote), and the amount on the sheet is the amount charged: if checkout
// comes to anything else, the payment is stopped before any money moves.
//   el          where the button goes (left empty when there's no wallet)
//   pk          Stripe publishable key
//   amount      cents, before an address is known
//   quote(a)    { city, state, postal_code } → { total_cents, quote_id? }
//   pay(s, id)  full shipping + quote id → { client_secret, total_cents, ...}
//   done(p)     after the payment went through (p is what pay returned)
//   failed(msg, p)  it didn't (p when checkout came to a different total)
//   shown(yes)  whether a wallet button is showing
window.spotWallet = function spotWallet({ el, pk, amount, quote, pay, done, failed, shown }) {
  if (!window.Stripe || !pk || !el || !(amount > 0)) return shown && shown(false), null;
  const stripe = window.Stripe(pk);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // A hold, like every Spot payment (captured once the store takes the order).
  const elements = stripe.elements({ mode: 'payment', amount, currency: 'usd', captureMethod: 'manual', appearance: { theme: dark ? 'night' : 'stripe' } });
  const ex = elements.create('expressCheckout', {
    buttonHeight: 48,
    buttonType: { applePay: 'buy', googlePay: 'buy' },
    buttonTheme: { applePay: dark ? 'white' : 'black', googlePay: dark ? 'white' : 'black' },
    paymentMethods: { link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
  });
  let total = amount;
  let quoteId = null;
  ex.on('ready', ({ availablePaymentMethods }) => shown && shown(Boolean(availablePaymentMethods)));
  ex.on('click', (e) =>
    e.resolve({
      shippingAddressRequired: true,
      allowedShippingCountries: ['US'],
      emailRequired: true,
      phoneNumberRequired: true,
      shippingRates: [{ id: 'store', displayName: 'Shipping and tax from the store', amount: 0 }],
    }),
  );
  ex.on('shippingaddresschange', async (e) => {
    try {
      const q = await quote({ city: e.address.city, state: e.address.state, postal_code: e.address.postal_code });
      quoteId = q.quote_id || null;
      if (q.total_cents !== total) {
        total = q.total_cents;
        elements.update({ amount: total });
      }
      e.resolve();
    } catch {
      e.reject();
    }
  });
  ex.on('confirm', async (e) => {
    const { error: invalid } = await elements.submit();
    if (invalid) return failed(invalid.message);
    const a = e.shippingAddress?.address || {};
    const shipping = {
      name: e.shippingAddress?.name || e.billingDetails?.name || '',
      line1: a.line1 || '',
      line2: a.line2 || '',
      city: a.city || '',
      state: a.state || '',
      postal_code: a.postal_code || '',
      email: e.billingDetails?.email || '',
      phone: e.billingDetails?.phone || '',
    };
    let p;
    try {
      p = await pay(shipping, quoteId);
    } catch (err) {
      e.paymentFailed({ reason: 'fail' });
      return failed(err.message || 'That didn’t go through. Nothing was charged.');
    }
    if (p.total_cents !== total) {
      e.paymentFailed({ reason: 'fail' });
      return failed('The store’s total came to $' + (p.total_cents / 100).toFixed(2) + '. Nothing was charged; pay again to check out at that.', p);
    }
    const { error } = await stripe.confirmPayment({ elements, clientSecret: p.client_secret, redirect: 'if_required', confirmParams: { return_url: location.href } });
    if (error) return failed(error.message, p);
    done(p);
  });
  ex.mount(el);
  return ex;
};
// Stripe.js, once, when a page first needs a wallet.
window.spotStripe = function spotStripe() {
  if (window.Stripe) return Promise.resolve();
  window.__spotStripe ||= new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = ok;
    s.onerror = no;
    document.head.appendChild(s);
  });
  return window.__spotStripe;
};
