// The chat button and window, for any page: <script src="https://hub.thefuturebasics.com/chat-widget.js" defer></script>
// (inside the showcase it is the same file from the same site, which is how a signed-in visitor is recognised). The window is an iframe of /chat-frame, so nothing on the
// page can read the conversation and the page's own styles cannot break it.  window.fbChat.open({ looking: 'spot' }) opens it, optionally saying which build is on screen.
(function () {
  'use strict';
  if (window.fbChat) return;
  var script = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var origin = (function () { try { return new URL(script.src, location.href).origin; } catch (e) { return location.origin; } })();
  var source = (script.getAttribute('data-source') || (origin === location.origin ? 'showcase' : 'site'));
  var CSS = '.fbw-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;background:#141416;color:#fff;cursor:pointer;box-shadow:0 10px 30px rgba(20,20,22,.3);display:grid;place-items:center;transition:transform .2s}.fbw-btn:hover{transform:translateY(-2px)}' +
    '.fbw-btn:focus-visible{outline:3px solid #4bff9a;outline-offset:3px}.fbw-btn i{position:absolute;top:3px;right:3px;width:14px;height:14px;border-radius:50%;background:#4bff9a;border:2px solid #fff;display:none}.fbw-btn.new i{display:block}' +
    '.fbw-win{position:fixed;right:20px;bottom:90px;z-index:2147483001;width:380px;height:min(600px,calc(100vh - 110px));border:0;border-radius:22px;box-shadow:0 24px 70px rgba(20,20,22,.35);background:#fff;display:none;overflow:hidden}.fbw-win.open{display:block}' +
    '@media(max-width:560px){.fbw-win{right:0;bottom:0;left:0;top:0;width:100%;height:100%;border-radius:0}.fbw-btn.hide{display:none}}@media(prefers-reduced-motion:reduce){.fbw-btn{transition:none}}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fbw-btn'; btn.setAttribute('aria-label', 'Chat with us'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg><i></i>';
  var win = null, ctx = {}, isOpen = false;
  function post(m) { if (win && win.contentWindow) win.contentWindow.postMessage(m, origin); }
  function context(c) { for (var k in c) ctx[k] = c[k]; post({ type: 'fbchat-ctx', page: ctx.page, looking: ctx.looking }); }
  function build() {
    if (win) return; win = document.createElement('iframe'); win.className = 'fbw-win'; win.title = 'Chat with Future Basics'; win.setAttribute('allow', '');
    win.src = origin + '/chat-frame?source=' + encodeURIComponent(source) + '&page=' + encodeURIComponent(location.pathname + location.hash).slice(0, 300);
    win.addEventListener('load', function () { post({ type: 'fbchat-ctx', page: ctx.page || (location.pathname + location.hash), looking: ctx.looking }); post({ type: 'fbchat-state', open: isOpen }); });
    document.body.appendChild(win);
  }
  function open(c) { if (c) context(c); build(); isOpen = true; win.classList.add('open'); btn.classList.remove('new'); btn.classList.add('hide'); btn.setAttribute('aria-expanded', 'true'); post({ type: 'fbchat-state', open: true }); }
  function close() { isOpen = false; if (win) win.classList.remove('open'); btn.classList.remove('hide'); btn.setAttribute('aria-expanded', 'false'); post({ type: 'fbchat-state', open: false }); btn.focus(); }
  btn.addEventListener('click', function () { isOpen ? close() : open(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === 'fbchat-close') close();
    if (e.data.type === 'fbchat-new' && !isOpen) btn.classList.add('new');
  });
  function mount() { document.body.appendChild(btn); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.fbChat = { open: open, close: close, context: context };
})();
