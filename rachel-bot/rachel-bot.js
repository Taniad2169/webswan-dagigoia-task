/*!
 * RachelBot — talking AI web assistant for The WebSwan family of sites.
 * Built by The WebSwan (Tania Domingue). Runs fully in the visitor's browser:
 * no AI service, no API key, nothing typed is sent anywhere.
 *
 * Install: set window.RACHEL_CONFIG = {...} then load this file.
 *   brand, subtitle, image, color, greeting, quick:[...], kb:[{k:[keywords], a:'html answer'}],
 *   fallback, hide:'css selectors of old bots to hide'
 */
(function () {
  'use strict';
  if (window.__rachelBot) return; window.__rachelBot = true;
  var C = window.RACHEL_CONFIG || {};
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  var IMG = C.image || BASE + 'rachel-thewebswan.jpg';
  var BRAND = C.brand || 'The WebSwan';
  var COLOR = C.color || '#1b70c2';
  var DARK = C.dark || '#062743';
  var synth = window.speechSynthesis, canSpeak = !!(synth && window.SpeechSynthesisUtterance);
  var root = document.documentElement;

  /* ---------- styles ---------- */
  var css = [
    '.rbt-pic{position:relative;overflow:hidden;display:block;flex:none;background:#2f9fd0}',
    '.rbt-pic .rbt-stage{position:absolute;width:166.667%;height:166.667%;left:-42.593%;top:-11.111%}',
    '.rbt-pic.full .rbt-stage{width:100%;height:100%;left:0;top:0}',
    '.rbt-stage img{position:absolute;display:block;max-width:none!important;margin:0!important;border:0!important;box-shadow:none!important;padding:0!important}',
    '.rbt-stage .rb{left:0;top:0;width:100%;height:100%}',
    '.rbt-stage .rg{left:43%;top:41.111%;width:24.556%;height:5.556%}',
    '.rbt-stage .rj{left:37.889%;top:41.444%;width:35.667%;height:26.667%;will-change:transform}',
    'html.rbt-talking .rbt-stage .rj{animation:rbtTalk .95s ease-in-out infinite}',
    '@keyframes rbtTalk{0%,100%{transform:translateY(0)}12%{transform:translateY(5.5%)}26%{transform:translateY(1.5%)}40%{transform:translateY(8%)}55%{transform:translateY(2.5%)}70%{transform:translateY(6.5%)}85%{transform:translateY(1%)}}',
    '@media (prefers-reduced-motion:reduce){html.rbt-talking .rbt-stage .rj{animation-duration:1.6s}}',
    '#rbt-launch{position:fixed;left:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:' + COLOR + ';color:#fff;border-radius:999px;padding:6px 18px 6px 6px;font:800 14px/1.2 Inter,Arial,Helvetica,sans-serif;box-shadow:0 12px 30px rgba(8,42,72,.35)}',
    '#rbt-launch .rbt-pic{width:46px;height:46px;border-radius:50%;border:2px solid #fff}',
    '#rbt-launch:hover{filter:brightness(1.08)}',
    '#rbt-launch:focus-visible,#rbt-panel button:focus-visible,#rbt-panel a:focus-visible,#rbt-panel input:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}',
    '#rbt-panel{position:fixed;left:20px;bottom:84px;z-index:2147483001;width:390px;max-width:calc(100vw - 32px);height:min(640px,calc(100vh - 110px));background:#fff;border-radius:22px;box-shadow:0 30px 70px rgba(8,42,72,.35);display:flex;flex-direction:column;overflow:hidden;border:1px solid #d7e6ee;font:15px/1.5 Inter,Arial,Helvetica,sans-serif;color:#18364a;text-align:left}',
    '#rbt-panel[hidden],#rbt-launch[hidden]{display:none}',
    '#rbt-panel *{box-sizing:border-box}',
    '.rbt-top{display:flex;align-items:center;gap:12px;padding:12px 14px;background:linear-gradient(120deg,' + DARK + ',' + COLOR + ');color:#fff}',
    '.rbt-top .rbt-pic{width:54px;height:54px;border-radius:50%;border:2px solid #a9ecfc}',
    '.rbt-top b{display:block;font-size:16px;color:#fff}.rbt-top small{display:block;color:#c4e8f3;font-size:12px}',
    '.rbt-top .rbt-x{margin-left:auto;background:rgba(255,255,255,.15);border:0;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:22px;line-height:1}',
    '.rbt-bar{display:flex;justify-content:space-between;align-items:center;padding:7px 14px;background:#eef6fa;border-bottom:1px solid #dcebf2;font-size:12px;color:#41606f}',
    '.rbt-bar button{border:1px solid #b9d6e3;background:#fff;color:' + COLOR + ';border-radius:999px;padding:5px 11px;font:700 12px Inter,Arial,sans-serif;cursor:pointer}',
    '.rbt-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:#f7fbfd}',
    '.rbt-hero{align-self:center;margin:2px 0 4px}',
    '.rbt-hero .rbt-pic{width:170px;height:170px;border-radius:18px;box-shadow:0 10px 24px rgba(8,42,72,.25)}',
    '.rbt-msg{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;color:#18364a;background:#fff;border:1px solid #e1eef4;align-self:flex-start;border-bottom-left-radius:5px;white-space:normal;word-wrap:break-word}',
    '.rbt-msg.me{align-self:flex-end;background:' + COLOR + ';color:#fff;border-color:' + COLOR + ';border-bottom-left-radius:16px;border-bottom-right-radius:5px}',
    '.rbt-msg a{color:' + COLOR + ';font-weight:700}.rbt-msg ul{margin:6px 0 0;padding-left:18px}.rbt-msg p{margin:0 0 6px}',
    '.rbt-listen{margin-top:6px;border:1px solid #b9d6e3;background:#fff;color:' + COLOR + ';border-radius:999px;padding:3px 10px;font:700 11.5px Inter,Arial,sans-serif;cursor:pointer}',
    '.rbt-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid #e1eef4;background:#fff;max-height:120px;overflow-y:auto}',
    '.rbt-chips button{border:1px solid #b9d6e3;background:#fff;color:#0b4164;border-radius:999px;padding:6px 11px;font:600 12.5px Inter,Arial,sans-serif;cursor:pointer;text-align:left}',
    '.rbt-chips button:hover{border-color:' + COLOR + '}',
    '.rbt-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 12px;border-top:1px solid #e1eef4;background:#fff}',
    '.rbt-form input{border:1.5px solid #b9d6e3;border-radius:12px;padding:10px 12px;font:14px Inter,Arial,sans-serif;min-width:0;color:#18364a;background:#fff}',
    '.rbt-form button{border:0;background:' + COLOR + ';color:#fff;border-radius:12px;padding:0 16px;font:800 14px Inter,Arial,sans-serif;cursor:pointer}',
    '.rbt-foot{padding:0 12px 10px;font-size:10.5px;color:#5c7180;background:#fff}',
    '.rbt-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media(max-width:600px){#rbt-launch .rbt-lbl{display:none}#rbt-launch{padding:5px}#rbt-panel{left:8px;right:8px;width:auto;bottom:80px}}',
    '@media(max-height:720px){.rbt-hero .rbt-pic{width:120px;height:120px}.rbt-top .rbt-pic{width:42px;height:42px}}',
    C.launchCss ? '@media(min-width:601px){#rbt-launch{' + C.launchCss + '}}' : '',
    C.hide ? C.hide + '{display:none!important}' : ''
  ].join('\n');
  var st = document.createElement('style'); st.id = 'rbt-style'; st.textContent = css; document.head.appendChild(st);

  function pic(cls) {
    var s = document.createElement('span'); s.className = 'rbt-pic ' + (cls || ''); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<span class="rbt-stage"><img class="rb" src="' + IMG + '" alt=""><img class="rg" src="' + BASE + 'rachel-gap.png" alt=""><img class="rj" src="' + BASE + 'rachel-jaw.png" alt=""></span>';
    return s;
  }

  /* ---------- voice (female US English, browser only) ---------- */
  var voiceOn = true;
  try { if (localStorage.getItem('rbt_voice') === 'off') voiceOn = false; } catch (e) {}
  var FEMALE = /samantha|ava|allison|susan|zoe|google us english|aria|jenny|michelle|emma|ashley|cora|elizabeth|jane|nancy|sara|amber|monica|zira|joanna|salli|kendra|kimberly|ivy|female/i;
  var MALE = /\b(alex|daniel|fred|tom|thomas|oliver|arthur|aaron|gordon|rishi|david|mark|guy|george|james|ryan|eric|andrew|brian|christopher|roger|steffan|male)\b/i;
  function pickVoice() {
    if (!canSpeak) return null;
    var vs = synth.getVoices().filter(function (v) { return /^en[-_]US/i.test(v.lang) && FEMALE.test(v.name) && !MALE.test(v.name); });
    return vs.filter(function (v) { return /natural|online/i.test(v.name); })[0] || vs.filter(function (v) { return /premium|enhanced|siri/i.test(v.name); })[0] || vs.filter(function (v) { return /google/i.test(v.name); })[0] || vs[0] || null;
  }
  if (canSpeak && synth.addEventListener) synth.addEventListener('voiceschanged', function () {});
  function talking(on) { root.classList.toggle('rbt-talking', !!on); }
  if (canSpeak) setInterval(function () { var on = synth.speaking && !synth.paused; if (on !== root.classList.contains('rbt-talking')) talking(on); }, 150);
  var curBtn = null;
  function mark(btn, playing) { if (!btn) return; btn.textContent = playing ? '⏹ Stop' : '🔊 Listen'; btn.setAttribute('aria-pressed', String(playing)); }
  function plain(el) {
    var c = el.cloneNode(true); c.querySelectorAll('button').forEach(function (b) { b.remove(); });
    c.querySelectorAll('li').forEach(function (li) { li.append('. '); });
    return (c.textContent || '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/•/g, ', ')
      .replace(/\(?(\d{3})\)?[ -.]?(\d{3})-(\d{4})/g, function (m, a, b, d) { return a.split('').join(' ') + ', ' + b.split('').join(' ') + ', ' + d.split('').join(' '); })
      .replace(/\s+/g, ' ').trim();
  }
  function speak(el, btn) {
    if (!canSpeak) return;
    try {
      var words = plain(el); if (!words) return;
      synth.cancel(); if (synth.paused) synth.resume();
      var u = new SpeechSynthesisUtterance(words), v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.rate = 1; u.pitch = 1;
      u.onstart = function () { if (curBtn && curBtn !== btn) mark(curBtn, false); curBtn = btn; mark(btn, true); talking(true); };
      u.onend = u.onerror = function () { mark(btn, false); if (curBtn === btn) curBtn = null; };
      synth.speak(u);
    } catch (e) { mark(btn, false); }
  }
  function stopVoice() { if (canSpeak) synth.cancel(); if (curBtn) mark(curBtn, false); curBtn = null; talking(false); }

  /* ---------- knowledge ---------- */
  var KB = C.kb || [];
  var FALLBACK = C.fallback || 'I don’t have that answer yet, but our team does. Call or text <a href="tel:+14158770687">(415) 877-0687</a>.';
  function answer(text) {
    var t = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' ', best = null, score = 0;
    KB.forEach(function (e) { var s = 0; e.k.forEach(function (k) { if (t.indexOf(k) > -1) s += k.length > 3 ? 2 + (k.indexOf(' ') > -1 ? 1 : 0) : 1; }); if (s > score) { score = s; best = e; } });
    return best ? best.a : FALLBACK;
  }

  /* ---------- interface ---------- */
  var launch = document.createElement('button');
  launch.id = 'rbt-launch'; launch.type = 'button'; launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'rbt-panel');
  launch.setAttribute('aria-label', 'Chat with Rachel, ' + BRAND + ' assistant');
  launch.appendChild(pic());
  var lbl = document.createElement('span'); lbl.className = 'rbt-lbl'; lbl.textContent = C.launchText || 'Ask Rachel'; launch.appendChild(lbl);

  var panel = document.createElement('div');
  panel.id = 'rbt-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with Rachel, ' + BRAND); panel.hidden = true;
  panel.innerHTML =
    '<div class="rbt-top"><div class="rbt-tp"></div><div><b>Rachel</b><small>' + (C.subtitle || BRAND + ' web assistant') + '</small></div><button type="button" class="rbt-x" aria-label="Close chat">×</button></div>' +
    '<div class="rbt-bar"><span>Rachel reads her answers out loud</span><button type="button" class="rbt-voice" aria-pressed="true"></button></div>' +
    '<div class="rbt-log" role="log" aria-live="polite"></div>' +
    '<div class="rbt-chips" aria-label="Suggested questions"></div>' +
    '<form class="rbt-form" autocomplete="off"><label class="rbt-sr" for="rbt-q">Type your question</label><input id="rbt-q" maxlength="300" placeholder="Type your question…"><button type="submit">Send</button></form>' +
    '<div class="rbt-foot">' + (C.foot || 'General information only, not legal or medical advice. Please don’t share sensitive personal details here.') + '</div>';
  panel.querySelector('.rbt-tp').replaceWith(pic());
  var log = panel.querySelector('.rbt-log'), chips = panel.querySelector('.rbt-chips'), input = panel.querySelector('#rbt-q'), vbtn = panel.querySelector('.rbt-voice');
  function paintVoice() { vbtn.textContent = voiceOn ? '🔊 Voice on' : '🔈 Voice off'; vbtn.setAttribute('aria-pressed', String(voiceOn)); }
  if (!canSpeak) panel.querySelector('.rbt-bar').style.display = 'none';
  paintVoice();
  vbtn.addEventListener('click', function () { voiceOn = !voiceOn; try { localStorage.setItem('rbt_voice', voiceOn ? 'on' : 'off'); } catch (e) {} if (!voiceOn) stopVoice(); paintVoice(); });

  function add(html, me) {
    var d = document.createElement('div'); d.className = 'rbt-msg' + (me ? ' me' : '');
    if (me) d.textContent = html; else d.innerHTML = html;
    if (!me && canSpeak) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rbt-listen'; mark(b, false);
      b.addEventListener('click', function () { if (b.getAttribute('aria-pressed') === 'true') stopVoice(); else speak(d, b); });
      var w = document.createElement('div'); w.appendChild(b); d.appendChild(w);
      if (voiceOn) speak(d, b);
    }
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function ask(text) { text = String(text || '').trim(); if (!text) return; add(text, true); var a = answer(text); setTimeout(function () { add(a); }, 300); }
  (C.quick || []).forEach(function (q) { var b = document.createElement('button'); b.type = 'button'; b.textContent = q; b.addEventListener('click', function () { ask(q); }); chips.appendChild(b); });
  panel.querySelector('.rbt-form').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; ask(v); });
  log.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) close(); });

  var started = false, lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    if (canSpeak && !open.unlocked) { open.unlocked = true; try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) {} }
    panel.hidden = false; launch.setAttribute('aria-expanded', 'true');
    if (!started) {
      started = true;
      var h = document.createElement('div'); h.className = 'rbt-hero'; h.appendChild(pic('full')); log.appendChild(h);
      add(C.greeting || ('Hi, I’m Rachel with ' + BRAND + '. 👋 How can I help you today?'));
    }
    setTimeout(function () { input.focus(); }, 60);
  }
  function close() { stopVoice(); panel.hidden = true; launch.setAttribute('aria-expanded', 'false'); if (lastFocus && lastFocus.focus) lastFocus.focus(); else launch.focus(); }
  launch.addEventListener('click', function () { panel.hidden ? open() : close(); });
  panel.querySelector('.rbt-x').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('pagehide', stopVoice);
  // any link or button with data-open-rachel, or a link to #ask-rachel, opens her
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-open-rachel],a[href$="#ask-rachel"]');
    if (t) { e.preventDefault(); open(); }
  });

  function mount() { document.body.appendChild(launch); document.body.appendChild(panel); if (location.hash === '#ask-rachel') setTimeout(open, 400); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.RachelBot = { open: open, close: close, ask: function (q) { open(); ask(q); } };
})();
