/* WebSwan "Take me there" promo banner. Each site's config sets window.WS_PROMO = { text, link, cta }.
   Slides in near the top after a few seconds; the visitor can close it (stays closed for that visit). */
(function () {
  if (window.__wsPromo) return; window.__wsPromo = true;
  function show() {
    var P = window.WS_PROMO; if (!P || !P.text || !P.link) return;
    try { if (sessionStorage.getItem('wsPromoClosed') === P.link) return; } catch (e) {}
    var css = '#wsPromo{box-sizing:border-box;position:fixed;left:50%;top:14px;transform:translate(-50%,-160%);z-index:2147483000;width:min(680px,calc(100vw - 24px));display:flex;align-items:center;gap:12px;padding:12px 14px 12px 16px;border-radius:16px;background:linear-gradient(135deg,#f97316,#fb923c);color:#1f1300;font:600 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.25);transition:transform .5s cubic-bezier(.2,.9,.3,1.2)}'
      + '#wsPromo.on{transform:translate(-50%,0)}#wsPromo .t{flex:1}#wsPromo a.go{flex:none;background:#fff;color:#7c2d12;font-weight:800;text-decoration:none;padding:9px 16px;border-radius:999px;white-space:nowrap}#wsPromo a.go:hover,#wsPromo a.go:focus{background:#1f1300;color:#fff}'
      + '#wsPromo button{flex:none;background:transparent;border:0;color:#1f1300;font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}#wsPromo button:focus,#wsPromo a.go:focus{outline:3px solid #fff;outline-offset:2px}'
      + '@media(max-width:560px){#wsPromo{flex-wrap:wrap;font-size:14px;padding-right:44px}#wsPromo .t{flex-basis:100%}#wsPromo a.go{flex:1;text-align:center}#wsPromo button{position:absolute;top:6px;right:6px}}@media(prefers-reduced-motion:reduce){#wsPromo{transition:none}}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'wsPromo'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Special announcement');
    var t = document.createElement('span'); t.className = 't'; t.textContent = P.text;
    var a = document.createElement('a'); a.className = 'go'; a.href = P.link; a.textContent = (P.cta || 'Take me there') + ' \u2192';
    if (/^https?:/.test(P.link) && P.link.indexOf(location.hostname) < 0) { a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', (P.cta || 'Take me there') + ' (opens in a new tab)'); }
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Close announcement'); x.textContent = '\u00d7';
    x.onclick = function () { b.classList.remove('on'); try { sessionStorage.setItem('wsPromoClosed', P.link); } catch (e) {} setTimeout(function () { b.remove(); }, 500); };
    a.addEventListener('click', function () { try { sessionStorage.setItem('wsPromoClosed', P.link); } catch (e) {} });
    b.appendChild(t); b.appendChild(a); b.appendChild(x); document.body.appendChild(b);
    setTimeout(function () { b.classList.add('on'); }, 50);
  }
  function start() { setTimeout(show, (window.WS_PROMO && window.WS_PROMO.delay) || 3500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
