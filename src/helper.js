// Pip, the helper mouse: a small guide that follows the pointer and walks a person through the page they are on, one step at a time.
// A page adds <script src="/helper.js" defer></script> and nothing else: this file draws the on/off pill, the mouse and its speech bubble,
// picks the guide that fits what is on screen, and moves to the next step when the person has done the current one.
// Each step says what to do, why, and what comes next. Guides are plain data in TOURS below; see docs/helper-mouse.md to add one.
(() => {
  if (window.fbHelper) return;
  if (window.top !== window || /^\/tp\//.test(location.pathname)) return; // not inside a frame, and not on a factory's private link
  const NAME = 'Pip';
  const K_ON = 'fb.helper.on', K_PROG = 'fb.helper.prog', K_NEXT = 'fb.helper.next';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shown = el => { if (typeof el === 'string') el = $(el); return !!(el && el.getClientRects().length && !el.closest('.hidden,[hidden]')); };
  const safe = (f, d = false) => { try { return f(); } catch { return d; } };
  const val = (v, ...a) => typeof v === 'function' ? safe(() => v(...a), '') : v;
  const path = () => location.pathname.replace(/\/$/, '') || '/';
  const onWork = () => /^work\./i.test(location.hostname) || document.body.classList.contains('fbnav');

  // ---- the guides --------------------------------------------------------------------------------------------------------------------------
  // tour: { id, title, match(), steps[], next?: { tour, label, href? }, outro? }
  // step: { target: selector | [selectors] | fn, title, do, why, wait?, done?: 'click' | 'input' | fn, after?, optional? }
  //   do/why/title/after may be functions. A step with no `done` is for reading: the person presses Next.
  //   `optional` steps are skipped when their target is not on screen (for example an empty panel).
  const dialogOpen = id => () => !!$(id + '[open]');
  const tab = k => `#tabs [data-tab="${k}"]`;
  const clientPack = () => shown('#tabs button[data-tab]') && !onWork();
  const TOURS = [
    // ---- design to factory: the Design Lab, the studio, the flats, the tech pack, the factory and its samples (docs/design-to-factory.md) ----
    {
      id: 'lab-concept', title: 'Take a concept to a tech pack',
      match: () => path() === '/lab' && !!$('#cd[open]'),
      steps: [
        { target: '#cd .big', title: 'The concept', do: 'Read the picture, the twist and the check: how close it sits to what inspired it.', why: 'Only what is ours is approved. A "too close" concept needs a written reason or a change.' },
        { target: '[data-cstudio]', title: 'Finish it in the studio', optional: true, do: 'Press “Open in the studio” to change the picture by hand or with AI: colours, graphics, distressing, a painted area redrawn.', why: 'The studio’s finished picture becomes the concept’s, and the tech pack’s first sketch.' },
        { target: '[data-cflats]', title: 'Draw it as flats', do: 'Press “Flats and placement”.', why: 'The flats are the piece measured, front and back, with every logo and graphic placed in inches. They become the tech pack’s measurements and sketches.', done: 'click', after: 'Opening the flats…' },
        { target: '[data-capprove]', title: 'Approve it', optional: true, do: 'When it is right, press Approve. A client’s line shows their verdict here first.', why: 'Approving says it is ours and it can be made; the flats check is held to that too.' },
        { target: '[data-ctp]', title: 'Send it to a tech pack', optional: true, do: 'Press “Send to tech pack”.', why: 'It becomes a product and a tech pack with its flats, measurements, details, colour and target price, in our room or the client’s.', done: 'click', after: 'Making the tech pack…' }
      ],
      next: { tour: 'lab-flats', label: 'Draw and change the flats' }
    },
    {
      id: 'lab-plan', title: 'Plan a line and make concepts',
      match: () => path() === '/lab' && shown('#app') && !$('#cd[open]'),
      steps: [
        { target: '#labTabs', title: 'The Design Lab', do: 'Library and What’s moving are what the market is doing; Line plans and Concepts are what we make of it.', why: 'Everything starts from a read of the market, so the line has a reason for every piece.' },
        { target: '#planForm [name="name"]', title: 'Start a line plan', do: 'Name the plan and the season, say the idea in a sentence, then press the button to draw it.', why: 'The plan sets the pieces, their roles, the price ladder and the margins before anything is designed.', done: 'input', after: 'Named.' },
        { target: '#planList', title: 'Open a plan', wait: 'Your plans appear here.', do: 'Open a plan to see its pieces, prices and margins.', why: 'Change a price, a quantity or a role and the margins follow.' },
        { target: '#pClient', title: 'Who it is for', optional: true, do: 'Leave it as our own line, or pick the client it is for, add their brand in a sentence, and tick “Show it in their hub” when it is ready.', why: 'A client’s line is designed in their brand, and they approve each piece in their hub.' },
        { target: '[data-mk]', title: 'Make concepts', optional: true, do: 'On a planned piece, press “Make concepts”.', why: 'Several takes on the piece, drawn and checked against what inspired them.', done: 'click', after: 'Drawing concepts…' },
        { target: '#board', title: 'The concepts board', do: 'Open a concept to edit it, check it, finish it and approve it.', why: 'This is where a planned piece becomes a design.' }
      ],
      outro: 'Open a concept: Pip shows how it goes from there to a tech pack.',
      next: { tour: 'lab-concept', label: 'Take a concept to a tech pack' }
    },
    {
      id: 'lab-studio', title: 'Finish a concept in the studio',
      match: () => path() === '/lab/studio' && shown('#app'),
      steps: [
        { target: '#stage', title: 'The concept, in layers', do: 'Draw, paint, type, add our marks or a graphic; each is a layer you can move or hide.', why: 'Finish it by hand where the AI got close but not right.' },
        { target: '#pAi', title: 'Change it with AI', optional: true, do: 'Say what to change, for the whole piece or a painted area, or make a new graphic.', why: 'Quicker than drawing, and only the area you paint changes.' },
        { target: '#apply', title: 'Use it as the concept', do: 'Press the button to make this the concept’s picture.', why: 'The finished picture is what the client sees and what the tech pack starts from.', done: 'click', after: 'Done.' },
        { target: '#back', title: 'Back to the concepts', do: 'Go back to the concept to draw its flats.', why: 'The flats come next: the piece measured, ready for a factory.' }
      ],
      next: { tour: 'lab-flats', label: 'Draw and change the flats' }
    },
    {
      id: 'lab-flats', title: 'Draw and change the flats',
      match: () => path() === '/lab/flats' && shown('#app'),
      steps: [
        { target: '#canvas', title: 'The piece as flats', do: 'A professional flat sketch, scaled to the measurements. Drag a logo or graphic: its inches from the HPS and centre front follow.', why: 'This is how a sample room measures, so the factory reads it the same way.' },
        { target: '.tabs [data-tab="garment"]', title: 'The piece and its drawing', do: 'Open Garment: the style, fit, the sketch it is drawn from, and the sample measurements.', why: 'Every other size is graded from these.', done: 'click', after: 'Garment open.' },
        { target: '.tabs [data-tab="design"]', title: 'Change the design', do: 'Open Design.', why: 'Colour it, add pockets, pleats, drawcords or a zip, draw stitch lines, or have AI redraw an area.', done: 'click', after: 'Design open.' },
        { target: '[data-adddet]', title: 'Add a detail', wait: 'Open Design first.', do: 'Press a detail, a pocket or pleats, then drag it into place or type its size.', why: 'Each detail has its own topstitch, thread and fabric colour, and goes on the tech pack in words.' },
        { target: '[data-mode="ai"]', title: 'Redraw an area with AI', wait: 'Open Design first.', optional: true, do: 'Press it, drag a box round a part, and say what to change, like “make this a cargo pocket”.', why: 'Only that area is redrawn, in the same flat-sketch lines.' },
        { target: '#save', title: 'Save and check', do: 'Press Save.', why: 'It checks everything can be made: on the piece, clear of seams and zips, within the technique.', done: 'click', after: 'Saved.' },
        { target: ['#toPack:not(.hidden)', '#sheet'], title: 'Send it on', do: 'Print the spec sheet, or once it is a tech pack, press “Send to the tech pack”.', why: 'The pack takes the measurements, the flats as sketches, every detail and stitch, and the colour.' }
      ],
      next: { tour: 'tp-factory', label: 'Publish, send to a factory, review samples' }
    },
    {
      id: 'tp-factory', title: 'Publish, send to a factory, review samples',
      match: () => onWork() && /^\/tech-packs\//.test(path()) && shown('#tabs button[data-tab]'),
      steps: [
        { target: '#crumb', title: 'Where it came from', optional: true, do: 'A pack made from a Design Lab concept links back to its concept and flats here.', why: 'Change the flats and send them again: the pack updates without doubling anything.' },
        { target: '[data-act="publish"]', title: 'Publish a version', do: 'When the pack is ready, press Publish.', why: 'Each version is numbered and signed off; the factory and the client see what changed each time.' },
        { target: '#assignForm', title: 'Send it to a factory', optional: true, do: 'Choose the factory and send it for a quote or to make.', why: 'The factory gets its own link in its language: it acknowledges each callout, quotes, and countersigns.' },
        { target: '[data-sampling]', title: 'Plan the samples', optional: true, do: 'Add the usual stages: proto, fit, pre-production, top of production.', why: 'The factory sees which samples are due, and marks each one sent with its tracking.' },
        { target: '[data-act="srev"]', title: 'Review a sample', optional: true, do: 'When a sample arrives, press “Review this sample”: type what you measured, add corrections, approve it or ask for changes.', why: 'One press writes the next version: accepted measurements, corrections, and the next sample asked for. Publish it and the factory sees exactly what changed.' }
      ],
      outro: 'Publish the corrected version: the factory reads “what changed”, keeps its acknowledgements for what did not, and the next sample follows.'
    },
    {
      id: 'hub-signin', title: 'Sign in to your room',
      match: () => !!$('#newTechPack') && (shown('#send') || shown('#verify')) && !store.get('fb.client.token'), // the hub shows its sign-in until it has loaded, so someone already signed in must not see this
      steps: [
        { target: '#email', title: 'Type your work email', do: 'Enter the email you use for work.', why: 'Your room is private to your company. We email a six-digit code instead of a password, so there is nothing to remember.', done: () => /.+@.+\..+/.test(($('#email') || {}).value || ''), after: 'Got it.' },
        { target: '#send button', title: 'Send the access code', do: 'Press “Send access code”.', why: 'The code proves the email is yours. It arrives in under a minute.', done: 'click', after: 'The code is on its way.' },
        { target: '#code', title: 'Type the six digits', do: 'Open the email from Future Basics and type the code here.', why: 'This opens the room assigned to your company, with all your products in one place.', wait: 'Waiting for the code box…', done: () => (($('#code') || {}).value || '').replace(/\D/g, '').length >= 6, after: 'That looks right.' },
        { target: '#verify button', title: 'Enter your room', do: 'Press “Enter client hub”.', why: 'You land on your projects, the page you will come back to every time.', done: () => !shown('#send') && !shown('#verify'), after: 'You are in.' }
      ],
      outro: 'New here without an account? Open /start on your phone and add a screenshot: your room is created around your first tech pack.',
      next: { tour: 'hub-start', label: 'Start your first tech pack' }
    },
    {
      id: 'hub-start', title: 'Start a tech pack',
      match: () => shown('#newTechPack') || shown('#techPackDialog'),
      steps: [
        { target: '#newTechPack', title: 'Start a tech pack', do: 'Press “Start a tech pack”.', why: 'Every product begins here. A photo or screenshot becomes a first draft in about a minute.', done: dialogOpen('#techPackDialog'), after: 'The form is open.' },
        { target: '#tpDrop', title: 'Add your design', do: 'Choose a photo, sketch or screenshot of what you want made (up to four).', why: 'The assistant reads it and drafts callouts, measurements, materials and colours for you. App bars and captions are trimmed away. No picture yet? Press Next and start blank.', done: () => !!$('#tpShots .tp-shot'), after: 'The picture is in.' },
        { target: '#tpProject', title: 'Pick a project', do: 'Choose one of your projects, or choose a new one and give it a name.', why: 'A project groups the products you develop together, so quotes, files and messages stay in one room.', optional: true },
        { target: '#techPackForm [name="title"]', title: 'Name the product', do: 'Give it a working name, like “Court Mid”.', why: 'It is how you and the factory will refer to it on every page. You can change it later.', done: 'input', after: 'Nice name.' },
        { target: '#techPackForm [name="description"]', title: 'Say what it is (optional)', do: 'In a sentence or two: what it is, who it is for, what must be true about it.', why: 'The more the assistant knows, the closer the first draft is. Press Next to skip.', optional: true },
        { target: '#tpSubmit', title: 'Create it', do: () => `Press “${($('#tpSubmit') || {}).textContent || 'Create my tech pack'}”.`, why: 'You land in your draft straight away. It is read-only for about a minute while the assistant works.', done: 'click', after: 'Creating your tech pack…' }
      ],
      next: { tour: 'tp-client', label: 'Check your draft' }
    },
    {
      id: 'hub-around', title: 'Find your way around',
      match: () => shown('#newTechPack'),
      steps: [
        { target: '#products', title: 'Your projects', do: 'Each card is a project, a line of products you develop with us. Tap one to open its room.', why: 'Tech packs, the quote, messages and files for a product all live in its room, so nothing is lost in an email thread.' },
        { target: '#waiting', title: 'Waiting on you', optional: true, do: 'When we need an approval, a quote OK or a payment, it shows up here first.', why: 'It is the one place to look to know whether the ball is in your court.' },
        { target: '#actions', title: 'Needs attention', do: 'Open actions across every product are listed here.', why: 'Clear them and the work moves on to the factory.' },
        { target: '#invoices', title: 'Invoices', do: 'Deposit invoices and payment links, with a PDF for each.', why: 'Sampling starts as soon as the deposit is paid, so this is where to pay.' },
        { target: '.hub-foot a[href="/help"]', title: 'The full guide', do: 'This link opens the whole guide with screenshots and answers to common questions.', why: 'Pip can walk you through it, and the guide is there when you want to read ahead.' }
      ]
    },
    {
      id: 'tp-client', title: 'Check your tech pack draft',
      match: () => clientPack() && /submit/i.test(($(tab('sign') + ' b') || {}).textContent || ''),
      steps: [
        { target: '#noteSlot', title: 'The assistant is working', optional: true, do: 'For about a minute the draft is read-only while the assistant reads your photo.', why: 'It is filling the callouts, measurements, materials and colours so you start from 80% instead of from nothing.' },
        { target: tab('calls'), title: 'Check the callouts', do: 'Open Callouts. Tap a pin or card to edit it, drag a pin to move it, or press “+ Callout” and tap the spot.', why: 'Callouts are the details the factory must get exactly right.', done: 'click', after: 'Callouts open.' },
        { target: tab('poms'), title: 'Check the measurements', do: 'Open Measure and compare each number with your sample size. The size run is graded for you.', why: 'A wrong number becomes a wrong sample. Anything you type wins over the assistant’s guess.', done: 'click', after: 'Measurements open.' },
        { target: tab('bom'), title: 'Check materials and trims', do: 'Open Materials and look over the fabrics, trims and colours.', why: 'These set the cost and the look. Change any line that is not what you have in mind.', done: 'click', after: 'Materials open.' },
        { target: tab('sign'), title: 'Submit to Future Basics', do: 'Open Submit. It shows what is still thin; you can submit anyway and we fill the gaps with you.', why: 'We finish the pack and publish version 1. While we work it is read-only; message us in the project thread if something must change.', done: 'click', after: 'Submit is open.' }
      ],
      outro: 'When version 1 is ready you get an email. Open the pack, go to Sign, type your full name and press Approve: your approval is your signature. Then you get a quote and a deposit invoice.'
    },
    {
      id: 'staff-home', title: 'Your day',
      match: () => path() === '/home' && shown('#app'),
      steps: [
        { target: '#actions', title: 'Start something', do: 'Three buttons you will use most: add a lead, start a prototype, start a project.', why: 'Relationships are the sales process. These start one in two clicks, so you can be personal and quick.' },
        { target: '#myPanel', title: 'My accounts', optional: true, do: 'The customers you own. Any account with no owner shows a Take button: press it and it is yours.', why: 'One owner per account means nobody is surprised and nothing goes quiet.' },
        { target: '#reach', title: 'Reach out today', do: 'Who is most likely to buy, and who has been waiting for an answer. Open one and send a personal note.', why: 'A note from a person who read their situation beats any campaign.' },
        { target: '#protoPanel', title: 'Prototypes that close deals', optional: true, do: 'Prototypes sent to prospects, with who has opened them.', why: 'Showing a prospect a working version of their own site makes the conversation easy.' },
        { target: '#projPanel', title: 'Projects in flight', do: 'Every software and product project you are delivering. Filter by state.', why: 'It keeps delivery in view while you sell.' },
        { target: '.fbside', title: 'The menu follows the work', optional: true, do: 'Left menu: My day, Inbox, People, Win, Deliver, Money, Sites and health.', why: 'It is ordered the way a day goes, from who wrote to you, to winning work, to delivering it and getting paid.' }
      ]
    },
    {
      id: 'staff-sales', title: 'Win a deal',
      match: () => path() === '/sales' && shown('#app'),
      steps: [
        { target: '.tab[data-t="contacts"]', title: 'Open Contacts', do: 'Open the Contacts tab.', why: 'Every deal starts with a person. Add them first, with what you know.', done: 'click', after: 'Contacts open.' },
        { target: '#newContact', title: 'Add a person', do: 'Press “+ Add”.', why: 'Write down who they are while it is fresh. The timeline keeps every email, chat and task from here on.', done: dialogOpen('#ndlg'), after: 'The form is open.' },
        { target: '#nName', title: 'Their name', do: 'Type their name.', why: 'You will use it to open every note.', done: 'input', after: 'Got it.' },
        { target: '#nEmail', title: 'Their email', do: 'Type their email so mail you send lands in their timeline and replies come back.', why: 'Replies and unsubscribes are handled for you.', done: 'input', after: 'Saved to the form.' },
        { target: '.tab[data-t="pipeline"]', title: 'Follow the pipeline', do: 'Open the Pipeline tab.', why: 'A deal is a promise you are working on. Moving it across the board tells the team where it stands.', done: 'click', after: 'Pipeline open.' },
        { target: '#board', title: 'Move deals across', do: 'Open a deal, or drag a card to the next stage as the conversation moves.', why: 'When a deal is won you can start its project from the card: room, project and build in one press, and the account owner is kept.' }
      ]
    },
    {
      id: 'tp-approve', title: 'Approve your tech pack',
      match: () => shown('#clientApprove'),
      steps: [
        { target: '.askchanges summary', title: 'Not right yet?', optional: true, do: 'If something needs to change, open this and say what. We fix it and send a new version.', why: 'Better to ask now than to approve something that is not what you want made.' },
        { target: '#clientApprove [name="name"]', title: 'Sign with your full name', do: 'Read the pack through, then type your full name.', why: 'Your approval is your signature. It confirms the tech pack describes the product you want made.', done: 'input', after: 'Name typed.' },
        { target: '#clientApprove button', title: 'Approve it', do: () => `Press “${($('#clientApprove button') || {}).textContent || 'Approve'}”.`, why: 'It releases the pack to Future Basics, then to the factory. After this, any change is a new version.', done: 'click', after: 'Approved.' }
      ],
      outro: 'Next we send a quote for sampling. It appears on the project page under Quote & deposit, and you get an email.',
      next: { tour: 'hub-quote', label: 'Approve the quote and pay the deposit', href: '/hub' }
    },
    {
      id: 'hub-quote', title: 'Approve the quote and pay the deposit',
      match: () => shown('#projectPage') && shown('#workbar'),
      steps: [
        { target: '.wb[data-sel="money"]', title: 'Open Quote & deposit', do: 'In the side bar, press “Quote & deposit”.', why: 'The quote and the deposit invoice for this project are there, with the totals.', done: 'click', after: 'Here is the money page.' },
        { target: 'button[onclick*="decideQuote"]', title: 'Approve the quote', wait: 'No quote yet. We send one once version 1 of the tech pack is approved, and you get an email.', do: 'Read the quantity, unit cost, tooling and freight, then press “Approve quote”.', why: 'Approving tells us the numbers are right, and it releases the deposit invoice.', done: 'click', after: 'Quote approved.' },
        { target: () => [...document.querySelectorAll('#projectPageBody a')].find(a => /pay securely/i.test(a.textContent)), title: 'Pay the deposit', wait: 'The deposit invoice appears here once the quote is approved.', do: 'Press “Pay securely” on the deposit invoice. Download PDF is beside it if you need a copy.', why: 'Sampling starts when the deposit is paid. The invoice shows as paid in your room afterwards.', done: 'click', after: 'On your way to pay.' }
      ],
      outro: 'When the deposit is paid, sampling begins. Follow it under Messages and Files: sample photos arrive as the factory sends them.',
      next: { tour: 'hub-messages', label: 'Message the team' }
    },
    {
      id: 'hub-messages', title: 'Message the team',
      match: () => shown('#projectPage') && shown('#workbar'),
      steps: [
        { target: '.wb[data-sel="thread"]', title: 'Open Messages', do: 'In the side bar, press “Messages”.', why: 'One thread for the whole project, so nothing gets lost in an email chain.', done: 'click', after: 'The thread is open.' },
        { target: '#projectPageBody .mc-compose textarea', title: 'Write to us', wait: 'Waiting for the thread…', do: 'Type your question or update. You can attach a file too.', why: 'We answer here and email you, so you never need to keep checking.', done: 'input', after: 'Message typed.' },
        { target: '#projectPageBody .mc-send', title: 'Send it', wait: 'Type a message first.', do: 'Press Send.', why: 'It lands with the team straight away.', done: 'click', after: 'Sent.' }
      ]
    },
    {
      id: 'hub-request', title: 'Ask for something',
      match: () => shown('#newRequest') || shown('#requestDialog'),
      steps: [
        { target: '#newRequest', title: 'Start a request', do: 'Press “Start a request”.', why: 'For anything that is not a new product: artwork, a change to a product in development, or a question.', done: dialogOpen('#requestDialog'), after: 'The form is open.' },
        { target: '#requestProduct', title: 'Which product', do: 'Choose the product this is about.', why: 'It goes to the people working on that product.' },
        { target: '#requestType', title: 'What kind of request', do: 'Pick new work, artwork, a tech pack, a change or a question.', why: 'It sends the request to the right person first.' },
        { target: '#requestTitle', title: 'Give it a title', do: 'In a few words: what you need.', why: 'It is the line the team sees first.', done: 'input', after: 'Title in.' },
        { target: '#requestForm button.full', title: 'Send it', do: 'Press “Submit request”.', why: 'You get an answer in your project thread.', done: 'click', after: 'Request sent.' }
      ]
    },
    {
      id: 'hub-files', title: 'Send us a file',
      match: () => shown('#allFiles'),
      steps: [
        { target: '#rfProject', title: 'Choose where it goes', do: 'Pick the product or project the file belongs to.', why: 'Files are filed where the team will look for them.' },
        { target: '#rfPick', title: 'Send a file', do: 'Press “Send a file” and choose it.', why: 'Like attaching it to a chat. We see it at once and it stays in your files.', done: 'click', after: 'Choosing a file.' }
      ]
    },
    {
      id: 'hub-shopify', title: 'Connect your Shopify store',
      match: () => shown('#shopPanel'),
      steps: [
        { target: '#shAddr', title: 'Your store address', do: 'Type it like your-store.myshopify.com.', why: 'We connect to your own store so a finished product can be sent to it as a draft.', done: 'input', after: 'Address in.' },
        { target: '#shGo', title: 'Connect', do: 'Press “Connect a store” and approve it in Shopify.', why: 'You stay in control: you can disconnect at any time, and nothing goes live without you.', done: 'click', after: 'Opening Shopify…' }
      ]
    },
    {
      id: 'staff-prototype', title: 'Build a prototype for a prospect',
      match: () => path() === '/prototypes' && shown('#app'),
      steps: [
        { target: '#url', title: 'Paste their website', do: 'Type the prospect’s website, like joesplumbing.com.', why: 'We read the real site safely to pull their name, services and photos, so the prototype is theirs, not a template.', done: 'input', after: 'Got the address.' },
        { target: '#industry', title: 'Check the trade', do: 'Leave it on automatic, or pick their trade.', why: 'The trade picks the playbook: what a good plumber’s or roofer’s site must say and show.' },
        { target: '#auditBtn', title: 'Audit it first (optional)', do: 'Press “Audit it first” to see what is wrong with their current site. Skip it to build straight away.', why: 'The audit is the pitch: specific, true problems you can name on a call.', done: 'click', after: 'Auditing…' },
        { target: '#buildBtn', title: 'Build the prototype', do: 'Press “Build the prototype”.', why: 'In a few minutes you have a working version of their own site to show.', done: 'click', after: 'Building…' },
        { target: '#frame', title: 'Look at what was built', wait: 'The prototype opens here when it is ready.', do: 'Scroll the preview and check it reads like their business.', why: 'Check it before anyone else sees it.' },
        { target: '#editText', title: 'Ask for a change', optional: true, do: 'Say what to change, in plain words, for example “make the phone number bigger”.', why: 'Each change is a new version you can restore, so nothing is lost.', done: 'input', after: 'Change written.' },
        { target: '#editGo', title: 'Make the change', optional: true, do: 'Press “Make the change”.', why: 'It rewrites the page and keeps the old version.', done: 'click', after: 'Changing it…' },
        { target: '#pub', title: 'Publish', wait: 'Open a built prototype to publish it.', do: 'Press Publish for a link you can send.', why: 'A link they can open on their phone is what wins the call.', done: 'click', after: 'Published.' }
      ],
      outro: 'Send the link in a personal note and log it in Sales: the deal follows from there.',
      next: { tour: 'staff-leads', label: 'Find the next prospects' }
    },
    {
      id: 'staff-leads', title: 'Find leads worth a call',
      match: () => path() === '/prototypes' && shown('#app'),
      steps: [
        { target: '.tab[data-t="leads"]', title: 'Open Find leads', do: 'Open the Find leads tab.', why: 'It finds local businesses whose sites are worth improving.', done: 'click', after: 'Leads tab open.' },
        { target: '#lTrade', title: 'Pick a trade', wait: 'Open Find leads first.', do: 'Choose the trade you want to reach.', why: 'Each trade has its own playbook, so the audit knows what to look for.' },
        { target: '#lPlace', title: 'Name a town', wait: 'Open Find leads first.', do: 'Type a town, like Norristown, PA.', why: 'Local businesses are the ones you can meet.', done: 'input', after: 'Town in.' },
        { target: '#lSearch', title: 'Find leads', wait: 'Open Find leads first.', do: 'Press “Find leads”.', why: 'It searches, drops directories and good sites, and keeps the ones worth a call.', done: 'click', after: 'Searching…' },
        { target: '#lAudit', title: 'Check these sites', wait: 'Search first to get a list.', do: 'Press “Check these sites” for a quick audit of each.', why: 'It ranks them by how much they need you, so you call the best first.', done: 'click', after: 'Checking…' }
      ]
    },
    {
      id: 'staff-money', title: 'Invoice and get paid',
      match: () => path() === '/money' && shown('#app'),
      steps: [
        { target: '#fromBtn', title: 'Invoice from a deal', do: 'Press “From a deal or project”.', why: 'The invoice fills itself in from what you sold, so nothing is retyped.', done: dialogOpen('#dlg'), after: 'The picker is open.' },
        { target: '#dBody', title: 'Pick the deal or project', wait: 'Open the picker first.', do: 'Choose a won deal or a project from the list.', why: 'It carries the client, the description and the value.' },
        { target: '#lines', title: 'Check the lines', wait: 'Pick a deal first.', do: 'Change any line, add a deposit or credit, set the due date.', why: 'What you send is what they pay, so check it once here.' },
        { target: '#dActs', title: 'Save, send or push', wait: 'Pick a deal first.', do: 'Save the draft, send it, or push it to QuickBooks. Then close this window.', why: 'The PDF carries a payment link, and payments come back on their own.' },
        { target: '.tab[data-t="payouts"]', title: 'See the bank side', do: 'Open Payouts.', why: 'Shopify Payments payouts and fees, so the books match the bank.', done: 'click', after: 'Payouts open.' },
        { target: '#readPayouts', title: 'Read payouts now', wait: 'Open Payouts first.', do: 'Press “Read payouts now”.', why: 'It reads what Shopify paid out and what it took in fees. This also runs by itself.', done: 'click', after: 'Reading…' },
        { target: '.tab[data-t="settings"]', title: 'Open Settings', do: 'Open Settings.', why: 'Where QuickBooks is connected and payment instructions are set.', done: 'click', after: 'Settings open.' },
        { target: '#qbPanel', title: 'QuickBooks', wait: 'Open Settings first.', do: 'Connect QuickBooks and test the connection here.', why: 'Invoices push to your books and payments come back, so nobody keys anything twice.' }
      ]
    },
    {
      id: 'staff-intel', title: 'Find people worth talking to',
      match: () => path() === '/intel' && shown('#app'),
      steps: [
        { target: '#listen', title: 'Listen now', do: 'Press “Listen now”.', why: 'It looks for people talking about the problems we solve and scores each one.', done: 'click', after: 'Listening…' },
        { target: '#list', title: 'Signals, best first', do: 'Open one to see why it scored high, and a drafted note to send in your own words.', why: 'A note that shows you read their situation is the whole sales process.' },
        { target: '.tab[data-t="watches"]', title: 'Open Watches', do: 'Open the Watches tab.', why: 'A watch keeps listening for a person, a company or a phrase you care about.', done: 'click', after: 'Watches open.' },
        { target: '#newWatch', title: 'Add a watch', wait: 'Open Watches first.', do: 'Press “+ New watch”.', why: 'New signals appear on Home under Reach out today.', done: 'click', after: 'Adding one.' }
      ]
    },
    {
      id: 'staff-factories', title: 'Find the right factory',
      match: () => path() === '/factories' && shown('#app'),
      steps: [
        { target: '#map', title: 'Where they are', do: 'Every factory is a pin on the map. Click one to show only that place.', why: 'Location tells you freight, time zone and who to visit on a trip.' },
        { target: '#q', title: 'Search', do: 'Type a name, a product or a skill.', why: 'Finds who makes what you need.', done: 'input', after: 'Searching.' },
        { target: '#typeChips', title: 'Narrow by what they make', do: 'Press a product type to keep only those factories.', why: 'The same factory can make several kinds of product.' },
        { target: '#cards', title: 'Open a factory', do: 'Open a card.', why: 'You see its work in hand, what it makes, its skills and its contact page. Assigned packs, files and project dates show where its work stands.', done: 'click', after: 'Opened.' }
      ]
    },
    {
      id: 'staff-builds', title: 'Show and invite on the Builds showcase',
      match: () => path() === '/builds/admin' && shown('#app'),
      steps: [
        { target: '#list', title: 'Your builds', do: 'Each card is a product or site we have built, with its live site and stack.', why: 'Clients and prospects see these on the showcase, so keep them current.' },
        { target: '#newBuild', title: 'Add a build', do: 'Press “New build” to add one.', why: 'Name it, say what it is and link the live site.', done: 'click', after: 'Adding one.' },
        { target: '.tab[data-t="invites"]', title: 'Open Invites', do: 'Open the Invites tab.', why: 'The showcase is private. An invite gives someone a link to the builds you choose.', done: 'click', after: 'Invites open.' },
        { target: '#invEmails', title: 'Who to invite', wait: 'Open Invites first.', do: 'Type the email addresses to invite.', why: 'Each person gets their own sign-in link, so you can see who looked.', done: 'input', after: 'Emails in.' },
        { target: '.tab[data-t="updates"]', title: 'What’s new', do: 'Open What’s new.', why: 'Changes to the apps we build show up here so the showcase follows them.', done: 'click', after: 'Updates open.' }
      ]
    },
    {
      id: 'staff-console', title: 'The console: clients and production',
      match: () => path() === '/admin' && shown('#app'),
      steps: [
        { target: '#inbox', title: 'Messages', optional: true, do: 'Everything clients write lands here. Reply in the same thread.', why: 'One inbox means nothing waits on someone being at their desk.' },
        { target: '#clientsHead', title: 'Clients', do: 'Every client is below. Open one for its room, its projects and its tech packs.', why: 'This is where a customer’s whole story lives.' },
        { target: '#approvals', title: 'Waiting on approval', optional: true, do: 'Packs and quotes waiting on a client.', why: 'These are the ones to nudge.' },
        { target: '#production', title: 'Production attention', optional: true, do: 'Anything late or stuck at a factory.', why: 'The earlier you see it, the cheaper it is to fix.' },
        { target: '#assistantLearning', title: 'What the assistant is learning', optional: true, do: 'Where people corrected the assistant.', why: 'Every correction makes the next draft better.' },
        { target: '#connections', title: 'Connections', do: 'Shopify, email and the rest. Green means connected.', why: 'If a client says a payment or an email did not arrive, look here first.' }
      ]
    },
    {
      id: 'staff-health', title: 'Platform health',
      match: () => path() === '/platform' && shown('#platformPage'),
      steps: [
        { target: '#pfHealth', title: 'Everything we depend on', do: 'Each card is a connection, a scheduled job or a client site, green when fine.', why: 'Problems show up here before a client notices.' },
        { target: '#pfRefresh', title: 'Check now', do: 'Press the refresh button to check again right now.', why: 'After you fix something, confirm it is green.', done: 'click', after: 'Checking…' },
        { target: '#pfTabInsights', title: 'Insights', do: 'Open Insights.', why: 'Who is using the platform and where people get stuck.', done: 'click', after: 'Insights open.' }
      ]
    },
    {
      id: 'staff-pack', title: 'Work a tech pack',
      match: () => onWork() && shown('#tabs button[data-tab]') && !$('#clientApprove'),
      steps: [
        { target: tab('calls'), title: 'Callouts', do: 'Open Callouts: the pins on the photo with a spec and a note for the factory.', why: 'These are the details the factory must get exactly right.', done: 'click', after: 'Callouts open.' },
        { target: tab('poms'), title: 'Measurements', do: 'Open the measurement table.', why: 'Check the graded size run against the sample size.', done: 'click', after: 'Measurements open.' },
        { target: tab('bom'), title: 'Materials and trims', do: 'Open the bill of materials.', why: 'It sets cost and look, and the factory quotes from it.', done: 'click', after: 'Materials open.' },
        { target: tab('check'), title: 'The independent check', optional: true, do: 'Open Check: the photo beside the render, a score, and what to fix. Run it from its button.', why: 'A second opinion before the pack goes to the client.', done: 'click', after: 'Check open.' },
        { target: tab('sign'), title: 'Sign-off', do: 'Open Sign.', why: 'Publishing, the client’s approval and the factory’s countersignature are tracked here. Once every signature is in, the pack locks.', done: 'click', after: 'Sign-off open.' }
      ]
    },
    {
      id: 'staff-contracts', title: 'Send a contract for signature',
      match: () => path() === '/contracts' && shown('#app'),
      steps: [
        { target: '#newBtn', title: 'Start a contract', do: 'Press “+ New contract”.', why: 'A contract starts from a deal, so the client, the signer and the fee come with it.', done: dialogOpen('#dlg'), after: 'Now pick where it starts.' },
        { target: '#dBody [data-deal]', title: 'Pick the deal', wait: 'Open “+ New contract” first.', do: 'Press Start beside the deal this contract is for.', why: 'Deals in meeting, proposal or won are listed, with any contract already made for them.', done: () => shown('#eBody [data-k="client.company"]'), after: 'The editor is open.' },
        { target: '#eBody [data-k="client.signerEmail"]', title: 'Check who signs', wait: 'Pick a deal first.', do: 'Make sure the signer and their email are right. The signing link goes to that address.', why: 'The link is the key: it opens this agreement and nothing else.' },
        { target: '#eBody [data-k="scopeText"]', title: 'List what is delivered', wait: 'Pick a deal first.', do: 'One deliverable per line.', why: 'Anything not listed is out of scope, so be specific: it makes a later change request easy to say yes or no to.' },
        { target: '#feeIn', title: 'Set the fixed fee', wait: 'Pick a deal first.', do: 'Enter the fixed bid. It starts from the deal’s value.', why: 'It is a fixed price: it does not move with the hours it takes us.' },
        { target: '#pType', title: 'Choose how it is paid', wait: 'Pick a deal first.', do: 'Pay in full, deposit and balance, monthly, or by milestone.', why: 'The schedule below updates and always adds up to the fee to the cent.' },
        { target: '#pMethod', title: 'How they pay', wait: 'Pick a deal first.', do: 'Invoice, ACH on file, card on file, or let the client choose. Tick automatic payments for the client to authorize each charge.', why: 'Their authorization is part of what they sign.' },
        { target: '#ePrev', title: 'Preview it', wait: 'Pick a deal first.', do: 'Press Preview to read it as the client will.', why: 'Once it is sent the text is fixed, so read it now.', done: 'click', after: 'Read it through.' },
        { target: '#eSend', title: 'Send for signature', wait: 'Pick a deal first.', do: 'Press “Send for signature…”.', why: 'The signer gets an email with the fee, the payments and a link to read and sign on any device.', done: 'click', after: 'Choose how to send it.' }
      ],
      outro: 'You will see when it is opened. When the client signs, open the contract and sign for Future Basics: the deal moves to Won. Then draft the invoices from the schedule.'
    },
    {
      id: 'hub-design', title: 'Review your line',
      match: () => shown('#design') && !!$('#design .dz-card'),
      steps: [
        { target: '#design', title: 'Your line in design', do: 'Every piece Future Basics is designing for you, with its picture, the idea and the target price.', why: 'You decide what is made: nothing goes to a factory until you say so.' },
        { target: '[data-dzflats]', title: 'The flats and measurements', optional: true, do: 'Press “Flats and measurements” to see the piece front and back with every logo placed and every size measured.', why: 'This is exactly what the factory will get.' },
        { target: '[data-dzv="approved"]', title: 'Approve a piece', optional: true, do: 'Press Approve on a piece you want made.', why: 'Approved pieces become tech packs in your room, then go to factories for quotes and samples.' },
        { target: '[data-dzask]', title: 'Or ask for changes', optional: true, do: 'Press “Ask for changes” and say what to change: the fit, a colour, a detail.', why: 'The team revises it and answers you on the piece.' }
      ],
      outro: 'Each approved piece appears under Your tech packs. From there it is the same as any pack: approve it, approve the quote, and follow the samples.'
    }
  ];

  if (window.__fbHelperTours) { window.__fbHelperTours(TOURS); return; } // lets a test read the guides without drawing anything

  // ---- state -------------------------------------------------------------------------------------------------------------------------------
  let lost = 0, idle = 0, on = store.get(K_ON) === '1', tour = null, i = 0, phase = 'doing', cheerAt = 0, listOpen = false;
  let root, tog, ring, group, bubble, mouse, built = false, lastTick = 0;
  let px = innerWidth / 2, py = innerHeight / 2, gx = innerWidth / 2, gy = innerHeight / 2, mode = 'go', goFrom = null, frozen = false, face = 1, lastKey = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = () => matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const prog = () => { try { return JSON.parse(store.get(K_PROG) || '{}') || {}; } catch { return {}; } };
  const save = (id, p) => { const all = prog(); all[id] = { ...(all[id] || {}), ...p }; store.set(K_PROG, JSON.stringify(all)); };
  const tourById = id => TOURS.find(t => t.id === id);
  const stepEl = s => { const list = Array.isArray(s.target) ? s.target : [s.target]; for (const t of list) { const e = typeof t === 'function' ? safe(t, null) : $(t); if (e && shown(e)) return e; } return null; };

  // ---- drawing -----------------------------------------------------------------------------------------------------------------------------
  const MOUSE = `<svg viewBox="0 0 64 46" width="48" height="35" aria-hidden="true"><g class="tail"><path d="M10 33C-2 34-1 17 8 18" fill="none" stroke="#141416" stroke-width="2.6" stroke-linecap="round"/></g><ellipse cx="34" cy="30" rx="22" ry="13.5" fill="#ececf0" stroke="#141416" stroke-width="2.6"/><circle cx="40" cy="13" r="8.5" fill="#ececf0" stroke="#141416" stroke-width="2.6"/><circle cx="40" cy="13" r="4.6" fill="#ffb8c9"/><circle cx="52" cy="17" r="7.5" fill="#ececf0" stroke="#141416" stroke-width="2.6"/><circle cx="52" cy="17" r="3.9" fill="#ffb8c9"/><path d="M50 27.5c3-2.2 8-2.2 10.4.2" fill="none" stroke="none"/><circle cx="58.6" cy="29" r="3" fill="#ff8fab" stroke="#141416" stroke-width="1.8"/><circle cx="49" cy="26" r="2.1" fill="#141416"/><path d="M56 31l7-2.5M56 32.5l7 1.5" stroke="#141416" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="26" cy="43" rx="5" ry="2.6" fill="#ffb8c9" stroke="#141416" stroke-width="2"/><ellipse cx="44" cy="43" rx="5" ry="2.6" fill="#ffb8c9" stroke="#141416" stroke-width="2"/></svg>`;
  const CSS = `
.fbh,.fbh *{box-sizing:border-box}
.fbh{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font:400 14px/1.45 'Space Grotesk',system-ui,sans-serif;color:#141416}
.fbh-tog{position:fixed;bottom:var(--fbb,14px);left:14px;pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border:1px solid rgba(20,20,22,.2);border-radius:999px;background:#fff;color:#141416;font:500 13px 'Space Grotesk',system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(20,20,22,.16);transition:transform .15s}
body.fbnav .fbh-tog{left:calc(var(--fbw,236px) + 14px)}
dialog .fbh-tog.on{display:none}
@media(max-width:900px){body.fbnav .fbh-tog{left:14px}}
.fbh-tog:hover{transform:translateY(-1px)}.fbh-tog:focus-visible,.fbh button:focus-visible{outline:3px solid #4bff9a;outline-offset:2px}
.fbh-tog .face{width:30px;height:24px;display:block}.fbh-tog .face svg{width:100%;height:100%;display:block}
.fbh-tog .sw{width:30px;height:18px;border-radius:999px;background:#c9c9ce;position:relative;transition:background .2s}.fbh-tog .sw:after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .2s}
.fbh-tog[aria-pressed="true"] .sw{background:#141416}.fbh-tog[aria-pressed="true"] .sw:after{left:14px;background:#4bff9a}
.fbh-ring{position:fixed;border-radius:14px;border:3px solid #4bff9a;box-shadow:0 0 0 2px #141416,0 0 0 8px rgba(75,255,154,.3);display:none;animation:fbh-pulse 1.4s ease-in-out infinite}
@keyframes fbh-pulse{50%{box-shadow:0 0 0 2px #141416,0 0 0 13px rgba(75,255,154,.12)}}
.fbh-g{position:fixed;left:0;top:0;display:none;flex-direction:column;align-items:flex-start;gap:4px;width:var(--bw,320px);will-change:transform}
.fbh-g.up{flex-direction:column-reverse}.fbh-g.rev{align-items:flex-end}
.fbh-mouse{width:48px;height:36px;flex:none;pointer-events:none;transition:transform .15s}.fbh-mouse svg{display:block;overflow:visible}
.fbh-mouse.l{transform:scaleX(-1)}.fbh-g.moving .fbh-mouse svg{animation:fbh-hop .32s ease-in-out infinite}.fbh-g .tail{transform-origin:10px 30px;animation:fbh-wag 1.6s ease-in-out infinite}
@keyframes fbh-hop{50%{transform:translateY(-3px)}}@keyframes fbh-wag{50%{transform:rotate(-14deg)}}
.fbh-b{width:100%;pointer-events:auto;background:#fff;border:1px solid rgba(20,20,22,.18);border-radius:18px;padding:12px 14px 12px;box-shadow:0 14px 44px rgba(20,20,22,.22);max-height:min(60vh,420px);overflow:auto}
.fbh-b .meta{display:flex;justify-content:space-between;gap:8px;font:500 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#717177}
.fbh-b .dots{display:flex;gap:3px;margin:6px 0 2px}.fbh-b .dots i{flex:1;height:3px;border-radius:2px;background:#dcdce0}.fbh-b .dots i.d{background:#141416}.fbh-b .dots i.c{background:#4bff9a;box-shadow:0 0 0 1px #141416 inset}
.fbh-b h3{margin:6px 0 4px;font:500 17px/1.2 'Space Grotesk',system-ui,sans-serif;letter-spacing:-.01em}
.fbh-b p{margin:5px 0;color:#2d2d31}.fbh-b p b{display:inline-block;min-width:34px;font:600 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#717177}
.fbh-b .nx{margin:8px 0 0;padding:7px 10px;border-radius:10px;background:#f5f5f2;font-size:12.5px;color:#2d2d31}
.fbh-b .cheer{margin:6px 0;padding:8px 10px;border-radius:10px;background:#e9fff2;border:1px solid #4bff9a;font-weight:500}
.fbh-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.fbh-acts button,.fbh-list button{font:500 12.5px 'Space Grotesk',system-ui,sans-serif;padding:6px 12px;border-radius:999px;border:1px solid rgba(20,20,22,.25);background:#fff;color:#141416;cursor:pointer}
.fbh-acts button.go{background:#141416;color:#fff;border-color:#141416}.fbh-acts button.q{margin-left:auto;border-color:transparent;color:#717177}
.fbh-acts button:disabled{opacity:.4;cursor:default}
.fbh-list{display:grid;gap:4px;margin-top:8px}.fbh-list button{text-align:left;border-radius:12px;display:flex;justify-content:space-between;gap:8px}.fbh-list button small{color:#717177}
.fbh-g.sheet{left:8px;right:8px;width:auto;bottom:calc(var(--fbb,14px) + 44px);top:auto;transform:none}.fbh-g.sheet .fbh-mouse{margin-left:12px}.fbh-g.sheet .fbh-b{max-height:44vh}
@media(prefers-reduced-motion:reduce){.fbh-ring,.fbh-g .tail,.fbh-g.moving .fbh-mouse svg{animation:none}.fbh-tog,.fbh-tog .sw:after{transition:none}}
@media print{.fbh{display:none}}`;

  function build() {
    if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.className = 'fbh'; root.setAttribute('data-fbh', '');
    root.innerHTML = `<div class="fbh-ring"></div><div class="fbh-g"><div class="fbh-mouse">${MOUSE}</div><div class="fbh-b" role="status" aria-live="polite"></div></div><button type="button" class="fbh-tog" aria-pressed="false" title="Turn the helper mouse on or off"><span class="face">${MOUSE}</span><span>Guide</span><span class="sw" aria-hidden="true"></span></button>`;
    document.body.appendChild(root);
    ring = $('.fbh-ring', root); group = $('.fbh-g', root); bubble = $('.fbh-b', root); mouse = $('.fbh-mouse', root); tog = $('.fbh-tog', root);
    tog.addEventListener('click', () => set(!on));
    bubble.addEventListener('click', onBubbleClick);
    bubble.addEventListener('pointerenter', () => { frozen = true; });
    bubble.addEventListener('pointerleave', () => { frozen = bubble.contains(document.activeElement); });
    bubble.addEventListener('focusin', () => { frozen = true; });
    bubble.addEventListener('focusout', () => { frozen = bubble.matches(':hover'); });
    addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; px = e.clientX; py = e.clientY; if (mode === 'go' && goFrom && Date.now() - goFrom.at > 700 && Math.hypot(px - goFrom.x, py - goFrom.y) > 70) mode = 'follow'; }, { passive: true });
    addEventListener('resize', () => { lastKey = ''; });
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('input', e => { setTimeout(check, 30); aheadInput(e.target); }, true);
    document.addEventListener('change', () => setTimeout(check, 30), true);
    addEventListener('keydown', e => { if (e.altKey && e.shiftKey && (e.key === 'G' || e.key === 'g')) { e.preventDefault(); set(!on); } });
    paintToggle();
  }

  // The mouse lives inside an open modal dialog while there is one: a modal makes the rest of the page inert and paints over it.
  function host() {
    const dlgs = document.querySelectorAll('dialog[open]');
    const h = dlgs.length ? dlgs[dlgs.length - 1] : document.body;
    if (root.parentNode !== h) h.appendChild(root);
  }

  // ---- choosing and running a guide ----------------------------------------------------------------------------------------------------------
  function pick() {
    const avail = TOURS.filter(t => safe(t.match));
    // a page redraws itself now and then (the hub refreshes its lists), so a guide is dropped only after its page has been gone for a few ticks
    if (tour && avail.includes(tour)) { lost = 0; return; }
    if (tour && ++lost < 4) return;
    lost = 0;
    const queued = store.get(K_NEXT);
    let t = null;
    if (queued) { t = avail.find(x => x.id === queued); if (t) store.del(K_NEXT); }
    const p = prog();
    t = t || avail.find(x => !(p[x.id] && p[x.id].done)) || avail[0] || null;
    if (t !== tour) { tour = t; i = tour ? Math.min((p[tour.id] || {}).i || 0, tour.steps.length) : 0; phase = 'doing'; if (tour && (p[tour.id] || {}).done) i = tour.steps.length; if (tour) save(tour.id, { i }); enterStep(); }
  }
  function curStep() { return tour && i < tour.steps.length ? tour.steps[i] : null; }
  function enterStep() {
    phase = tour && i >= tour.steps.length ? 'end' : 'doing'; lastKey = ''; mode = 'go'; goFrom = { x: px, y: py, at: Date.now() }; scrolled = false;
    if (tour) save(tour.id, { i, done: phase === 'end' });
  }
  let scrolled = false;
  function goTo(n) { if (!tour) return; i = Math.max(0, Math.min(tour.steps.length, n)); enterStep(); render(); }
  function advance() {
    if (!tour) return;
    let n = i + 1;
    while (n < tour.steps.length && tour.steps[n].optional && !stepEl(tour.steps[n])) n++;
    if (n >= tour.steps.length && tour.next) store.set(K_NEXT, tour.next.tour);
    goTo(n);
  }
  function done() {
    const s = curStep(); if (!s || phase !== 'doing') return; phase = 'cheer'; cheerAt = Date.now();
    // the last step often leaves the page (creating a pack opens the editor), so remember the finish and what comes next now
    if (i === tour.steps.length - 1) { save(tour.id, { i: tour.steps.length, done: true }); if (tour.next) store.set(K_NEXT, tour.next.tour); }
    render();
  }
  function isDone(s) {
    if (typeof s.done === 'function') return !!safe(s.done);
    if (s.done === 'input') { const e = stepEl(s); return !!(e && String(e.value || '').trim().length >= (s.min || 1)); }
    return false;
  }
  function check() { const s = curStep(); if (on && s && phase === 'doing' && isDone(s)) done(); }
  // typing in a box a later step asks about also catches the guide up to that step
  function aheadInput(t) {
    const s = curStep(); if (!on || !s || phase !== 'doing' || !tour || !t || root.contains(t) || stepEl(s) === t) return;
    for (let k = i + 1; k < tour.steps.length; k++) {
      const x = tour.steps[k]; if (x.done !== 'input') continue;
      if (stepEl(x) === t && String(t.value || '').trim().length >= (x.min || 1)) { i = k; enterStep(); done(); return; }
    }
  }
  function onDocClick(e) {
    if (!on || root.contains(e.target)) return;
    const s = curStep(); if (!s || phase !== 'doing') return;
    if (s.done === 'click') { const el = stepEl(s); if (el && el.contains(e.target)) { setTimeout(() => { if (on && curStep() === s && phase === 'doing') done(); }, 60); return; } }
    // someone who gets ahead of the guide (presses what a later step asks for) is not held back: the mouse catches up to that step
    for (let k = i + 1; k < tour.steps.length; k++) {
      const t = tour.steps[k]; if (t.done !== 'click') continue;
      const el = stepEl(t); if (el && el.contains(e.target)) { setTimeout(() => { if (on && curStep() === s && phase === 'doing') { i = k; enterStep(); done(); } }, 60); return; }
    }
  }
  function onBubbleClick(e) {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'next') advance();
    else if (a === 'back') goTo(i - 1);
    else if (a === 'off') set(false);
    else if (a === 'replay') { save(tour.id, { done: false }); goTo(0); }
    else if (a === 'guides') { listOpen = !listOpen; render(); }
    else if (a === 'tour') { const t = tourById(b.dataset.id); if (!t) return; if (safe(t.match)) { tour = t; listOpen = false; goTo(0); } else { store.set(K_NEXT, t.id); if (b.dataset.href) location.href = b.dataset.href; } }
    else if (a === 'next-tour') { const t = tourById(tour.next.tour); if (t && safe(t.match)) { tour = t; goTo(0); } else { store.set(K_NEXT, tour.next.tour); if (tour.next.href) location.href = tour.next.href; } }
  }

  // ---- bubble ------------------------------------------------------------------------------------------------------------------------------
  function render() {
    if (!built) return;
    listOpen = listOpen && !!tour;
    if (!on) { group.style.display = 'none'; ring.style.display = 'none'; return; }
    if (!tour && idle < 3) { group.style.display = 'none'; ring.style.display = 'none'; return; } // a page that is still loading is not a page without a guide
    let h = '';
    if (!tour) {
      h = `<div class="meta"><span>${NAME} the helper mouse</span></div><h3>No guide for this page yet</h3><p>${NAME} follows you around, and the guides appear where there is something to walk through. Try My day or the client hub.</p>${tail(false)}`;
    } else if (listOpen) {
      const p = prog();
      h = `<div class="meta"><span>All guides</span></div>` + `<div class="fbh-list">${TOURS.map(t => ({ t, here: !!safe(t.match) })).sort((a, b) => b.here - a.here).map(({ t, here }) => { const d = (p[t.id] || {}).done; return `<button type="button" data-a="tour" data-id="${t.id}"${t.href ? ` data-href="${esc(t.href)}"` : ''}${here ? '' : ' disabled'}><span>${d ? '✓ ' : ''}${esc(t.title)}</span><small>${here ? 'on this page' : 'other page'}</small></button>`; }).join('')}</div>` + `<div class="fbh-acts"><button type="button" data-a="guides">Close</button><button type="button" class="q" data-a="off">Turn off</button></div>`;
    } else if (phase === 'end') {
      const nx = tour.next && tourById(tour.next.tour);
      h = `<div class="meta"><span>${esc(tour.title)}</span><span>Done</span></div><h3>That is the whole route</h3>${tour.outro ? `<p>${esc(tour.outro)}</p>` : '<p>You have been through every step on this page.</p>'}${nx ? `<p class="nx"><b>Next</b> ${esc(tour.next.label || nx.title)}</p>` : ''}<div class="fbh-acts">${nx ? '<button type="button" class="go" data-a="next-tour">Show me</button>' : ''}<button type="button" data-a="replay">Replay</button><button type="button" data-a="guides">Guides</button><button type="button" class="q" data-a="off">Turn off</button></div>`;
    } else {
      const s = curStep(), n = tour.steps.length, nxt = tour.steps.slice(i + 1).find(x => !x.optional || stepEl(x));
      const missing = !stepEl(s);
      const dots = tour.steps.map((_, k) => `<i class="${k < i ? 'c' : k === i ? 'd' : ''}"></i>`).join('');
      h = `<div class="meta"><span>${esc(tour.title)}</span><span>Step ${i + 1} of ${n}</span></div><div class="dots">${dots}</div><h3>${esc(val(s.title))}</h3>`;
      if (phase === 'cheer') h += `<div class="cheer">✓ ${esc(val(s.after) || 'Done.')}</div>`;
      else if (missing) h += `<p>${esc(s.wait || 'Looking for that on this page…')}</p>`;
      else h += `<p><b>Do</b> ${esc(val(s.do))}</p><p><b>Why</b> ${esc(val(s.why))}</p>`;
      h += `<p class="nx"><b>${nxt ? 'Next' : 'Last'}</b> ${nxt ? esc(val(nxt.title)) : (tour.next ? esc(tour.next.label) : 'That finishes this guide')}</p>`;
      h += `<div class="fbh-acts"><button type="button" data-a="back"${i ? '' : ' disabled'}>Back</button><button type="button" class="go" data-a="next">${s.done && phase === 'doing' ? 'Skip' : 'Next'}</button><button type="button" data-a="guides">Guides</button><button type="button" class="q" data-a="off">Turn off</button></div>`;
    }
    if (bubble.dataset.h !== h) { const hadFocus = bubble.contains(document.activeElement); bubble.innerHTML = h; bubble.dataset.h = h; if (hadFocus) { const g = $('button.go', bubble) || $('button', bubble); if (g) g.focus({ preventScroll: true }); } }
    group.style.display = 'flex';
  }
  function tail() { return `<div class="fbh-acts"><button type="button" class="q" data-a="off">Turn off</button></div>`; }
  function paintToggle() { if (!tog) return; tog.setAttribute('aria-pressed', on ? 'true' : 'false'); tog.classList.toggle('on', on); tog.title = on ? `${NAME} is on. Press to turn off (Alt+Shift+G)` : `Turn on ${NAME}, the helper mouse (Alt+Shift+G)`; }
  function set(v) {
    on = !!v; store.set(K_ON, on ? '1' : '0'); build(); paintToggle();
    if (on) { tour = null; pick(); render(); } else { render(); }
  }

  // ---- motion ------------------------------------------------------------------------------------------------------------------------------
  function frame(t) {
    requestAnimationFrame(frame);
    if (!built) return;
    const dt = Math.min(0.1, (t - (frame.t || t)) / 1000); frame.t = t;
    if (t - lastTick > 400) { lastTick = t; tick(); }
    if (!on) return;
    const s = phase === 'doing' || phase === 'cheer' ? curStep() : null, el = s && stepEl(s), r = el ? el.getBoundingClientRect() : null;
    // inside a dialog that is animated or transformed, fixed positions are measured from the dialog, not the screen: take that offset off
    const o = root.getBoundingClientRect(), ox = o.left, oy = o.top;
    if (r) {
      ring.style.display = 'block';
      ring.style.left = r.left - 6 - ox + 'px'; ring.style.top = r.top - 6 - oy + 'px'; ring.style.width = r.width + 12 + 'px'; ring.style.height = r.height + 12 + 'px';
    } else ring.style.display = 'none';
    if (el && !scrolled) { scrolled = true; const out = r.top < 70 || r.bottom > innerHeight - (coarse() ? 300 : 90); if (out) el.scrollIntoView({ block: coarse() ? 'start' : 'center', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    const sheet = coarse(); group.classList.toggle('sheet', sheet);
    if (sheet) { group.style.transform = ''; group.classList.remove('moving'); return; }
    // everything below is worked out inside the box the mouse lives in (the screen, or the open dialog) and moved back at the end
    const vw = o.width, vh = o.height, bw = Math.min(320, vw - 24); group.style.setProperty('--bw', bw + 'px');
    const bh = group.offsetHeight || 160, pl = { x: px - ox, y: py - oy }, rl = r && { left: r.left - ox, right: r.right - ox, top: r.top - oy, bottom: r.bottom - oy };
    let ax, ay, up = false, rev = false;
    const near = rl && rl.right - rl.left < 420 && rl.bottom - rl.top < 160 && pl.x > rl.left - 50 && pl.x < rl.right + 50 && pl.y > rl.top - 50 && pl.y < rl.bottom + 50;
    if (rl && (mode === 'go' || near)) {
      // beside the thing to press, never on top of it
      ax = Math.max(8, Math.min(rl.left, vw - bw - 8)); ay = rl.bottom + 14;
      if (ay + bh > vh - 8) { ay = rl.top - 14 - bh; up = true; if (ay < 8) { ay = Math.max(8, Math.min(rl.bottom - bh, vh - bh - 8)); ax = rl.right + 14 + bw < vw ? rl.right + 14 : Math.max(8, rl.left - bw - 14); up = false; } }
    } else if (!rl && mode === 'go') { mode = 'follow'; }
    else {
      ax = pl.x + 22; ay = pl.y + 22;
      if (ax + bw > vw - 8) { ax = pl.x - 22 - bw; rev = true; }
      if (ay + bh > vh - 8) { ay = pl.y - 22 - bh; up = true; }
      ax = Math.max(8, ax); ay = Math.max(8, ay);
    }
    if (ax === undefined) return;
    ax += ox; ay += oy;
    if (!frozen) {
      const k = 1 - Math.exp(-dt * 7), fx = gx, fy = gy;
      gx += (ax - gx) * k; gy += (ay - gy) * k;
      group.classList.toggle('moving', Math.hypot(gx - fx, gy - fy) > 0.6);
      if (Math.abs(ax - gx) > 6) face = ax > gx ? 1 : -1;
    } else group.classList.remove('moving');
    group.classList.toggle('up', up); group.classList.toggle('rev', rev);
    mouse.classList.toggle('l', face < 0);
    group.style.transform = `translate(${Math.round(gx - ox)}px,${Math.round(gy - oy)}px)`;
  }
  // a page can have its own bar along the bottom (the tech pack's tabs on a phone): sit above it, never on top of it
  function clearBottom() {
    const tb = $('#tabs'); let b = 14;
    if (tb && shown(tb)) { const r = tb.getBoundingClientRect(); if (r.top > innerHeight * 0.5 && r.height < innerHeight * 0.3) b = Math.round(innerHeight - r.top + 12); }
    if (root.style.getPropertyValue('--fbb') !== b + 'px') root.style.setProperty('--fbb', b + 'px');
  }
  function tick() {
    if (!built) return;
    host(); clearBottom();
    if (!on) return;
    pick();
    const s = curStep();
    if (s && phase === 'doing') {
      if (s.optional && !stepEl(s) && !s.done) { advance(); return; }
      if (isDone(s) && s.done) done();
    }
    if (s && phase === 'cheer' && Date.now() - cheerAt > 1500) advance();
    // keep the bubble's text current (a step's text can depend on the page)
    idle = tour ? 0 : Math.min(idle + 1, 3);
    const key = [tour && tour.id, i, phase, listOpen, !!(s && stepEl(s)), idle >= 3].join('|');
    if (key !== lastKey) { lastKey = key; render(); }
  }

  window.fbHelper = { on: () => on, set, tours: TOURS, goTo };
  const start = () => {
    build();
    const q = new URLSearchParams(location.search).get('guide');
    if (q === 'on' || q === '1') { on = true; store.set(K_ON, '1'); } else if (q === 'off' || q === '0') { on = false; store.set(K_ON, '0'); }
    paintToggle(); host(); if (on) { pick(); render(); }
    requestAnimationFrame(frame);
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
