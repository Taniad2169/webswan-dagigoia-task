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
  var NAME = C.name || 'Rachel';
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
    '.rbt-foot{padding:0 12px 10px;font-size:10.5px!important;line-height:1.4!important;color:#5c7180;background:#fff}',
    '.rbt-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media(max-width:600px){#rbt-launch .rbt-lbl{display:none}#rbt-launch{padding:5px}#rbt-panel{left:8px;right:8px;width:auto;bottom:80px}}',
    '@media(max-height:720px){.rbt-hero .rbt-pic{width:120px;height:120px}.rbt-top .rbt-pic{width:42px;height:42px}}',
        '.rbt-yn{display:flex;gap:8px;margin-top:8px}.rbt-yn button{flex:1;border:0;border-radius:999px;padding:9px 10px;font-weight:700;cursor:pointer;background:' + COLOR + ';color:#fff}.rbt-yn button+button{background:#fff;color:' + DARK + ';border:2px solid ' + COLOR + '}',
    '.rbt-book{background:#f4f9ff;border:1px solid #c9dcef;border-radius:14px;padding:12px;margin:6px 0;display:flex;flex-direction:column;gap:4px;font-size:14px;color:#0a1e2f}.rbt-book label{font-weight:700;margin-top:4px;display:flex;justify-content:space-between}.rbt-book input,.rbt-book textarea{width:100%;box-sizing:border-box;border:1px solid #a9c4dd;border-radius:10px;padding:8px;font:inherit;background:#fff;color:#0a1e2f}.rbt-book textarea{resize:vertical}.rbt-book button{margin-top:8px;border:0;border-radius:999px;padding:10px;font-weight:800;cursor:pointer;background:' + COLOR + ';color:#fff}.rbt-book button:disabled{opacity:.6}.rbt-note{margin:4px 0 0;font-size:12px;color:#35506a}.rbt-err{margin:4px 0 0;color:#b00020;font-weight:700;font-size:13px}.rbt-count{font-weight:400;color:#35506a}',
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
    return (c.textContent || '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/•/g, ', ').replace(/\bWSBPA\b/g, 'W S B P A').replace(/\bSBPA\b/g, 'W S B P A').replace(/\bADA\b/g, 'A D A').replace(/\bWCAG\b/g, 'W-CAG').replace(/\bUX\/UI\b/g, 'U X, U I').replace(/\bWSMN\b/g, 'W S M N').replace(/\bHIPAA\b/g, 'hippa').replace(/\bSEO\b/g, 'S E O').replace(/\bPWAs?\b/g, 'W S B P A').replace(/\/month\b/g, ' per month').replace(/\/mo\b/g, ' per month').replace(/\/year\b/g, ' per year').replace(/\/yr\b/g, ' per year')
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
  var FALLBACK = C.fallback || 'Hmm 🤔 I don’t know the answer to that question, but you can call the number on the screen to ask Tania: <a href="tel:+14158770687"><b>📞 (415) 877-0687</b></a>';
  function answer(text) {
    var t = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' ', best = null, score = 0;
    KB.forEach(function (e) { var s = 0; e.k.forEach(function (k) { if (t.indexOf(k) > -1) s += k.length > 3 ? 2 + (k.indexOf(' ') > -1 ? 1 : 0) : 1; }); if (s > score) { score = s; best = e; } });
    return best && score >= 2 ? best.a : FALLBACK;
  }

  /* ---------- interface ---------- */
  var launch = document.createElement('button');
  launch.id = 'rbt-launch'; launch.type = 'button'; launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'rbt-panel');
  launch.setAttribute('aria-label', 'Chat with ' + NAME + ', ' + BRAND + ' assistant');
  launch.appendChild(pic());
  var lbl = document.createElement('span'); lbl.className = 'rbt-lbl'; lbl.textContent = C.launchText || 'Ask Rachel'; launch.appendChild(lbl);

  var panel = document.createElement('div');
  panel.id = 'rbt-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with ' + NAME + ', ' + BRAND); panel.hidden = true;
  panel.innerHTML =
    '<div class="rbt-top"><div class="rbt-tp"></div><div><b>' + NAME + '</b><small>' + (C.subtitle || BRAND + ' web assistant') + '</small></div><button type="button" class="rbt-x" aria-label="Close chat">×</button></div>' +
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
  /* ---------- "Would you like to schedule an appointment with Tania?" ---------- */
  // Turned on per site with C.booking = { endpoint, after, brand }. Rachel offers once (after a few questions,
  // or right away when someone asks to book), then shows a short form that goes to Tania by email.
  var BK = C.booking || null, answered = 0, offered = false, pending = false;
  var BOOK_RX = /\b(appointment|schedule|book|booking|meet|meeting|call me|talk to tania|speak (to|with) tania|consultation|demo)\b/i;
  function offer() {
    if (!BK || offered) return; offered = true; pending = true;
    var d = add('Would you like to schedule an appointment with Tania?');
    var row = document.createElement('div'); row.className = 'rbt-yn';
    [['Yes, please', true], ['No, thanks', false]].forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[0];
      b.addEventListener('click', function () { row.remove(); reply(o[1]); });
      row.appendChild(b);
    });
    d.appendChild(row); log.scrollTop = log.scrollHeight;
  }
  function reply(yes) {
    pending = false; var r = log.querySelector('.rbt-yn'); if (r) r.remove();
    add(yes ? 'Yes, please' : 'No, thanks', true);
    setTimeout(function () { if (yes) bookForm(); else add('No problem at all! I’m right here if you have more questions. 😊'); }, 300);
  }
  function bookForm() {
    add('Wonderful! Please fill out the form with your <b>name</b>, <b>business name</b>, <b>phone number</b>, a <b>subject</b> and a short <b>comment</b>, and Tania will reach out to set your appointment.');
    var f = document.createElement('form'); f.className = 'rbt-book'; f.noValidate = true;
    var id = 'rbk' + Date.now();
    f.innerHTML =
      '<label for="' + id + 'n">Your name</label><input id="' + id + 'n" name="name" required maxlength="80" autocomplete="name">' +
      '<label for="' + id + 'b">Business name</label><input id="' + id + 'b" name="business" required maxlength="120" autocomplete="organization">' +
      '<label for="' + id + 'p">Phone number</label><input id="' + id + 'p" name="phone" type="tel" required maxlength="25" autocomplete="tel">' +
      '<label for="' + id + 's">Subject</label><input id="' + id + 's" name="subject" required maxlength="100">' +
      '<label for="' + id + 'c">Comment <span class="rbt-count" aria-live="polite">0/400</span></label><textarea id="' + id + 'c" name="comment" rows="3" maxlength="400"></textarea>' +
      '<p class="rbt-note">Please don’t include medical, patient or case details.</p>' +
      '<button type="submit">Send to Tania</button><p class="rbt-err" role="alert"></p>';
    var ta = f.querySelector('textarea'), cnt = f.querySelector('.rbt-count'), err = f.querySelector('.rbt-err');
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/400'; });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (n) { return (f.elements[n].value || '').trim(); };
      var miss = ['name', 'business', 'phone', 'subject'].filter(function (n) { return !v(n); });
      if (miss.length) { err.textContent = 'Please fill in: ' + miss.join(', ') + '.'; f.elements[miss[0]].focus(); return; }
      if (v('phone').replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a full phone number with area code.'; f.elements.phone.focus(); return; }
      var btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…'; err.textContent = '';
      var body = { name: v('name'), business: v('business'), phone: v('phone'), subject: v('subject'), comment: v('comment').slice(0, 400),
        source: 'Rachel chat · ' + (BK.brand || BRAND), page: location.href, _subject: 'Appointment request from Rachel chat (' + (BK.brand || BRAND) + '): ' + v('subject') };
      fetch(BK.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); f.remove(); add('Thank you, <b>' + esc(body.name) + '</b>! 🎉 Tania received your request and will reach out at <b>' + esc(body.phone) + '</b> to set your appointment.'); })
        .catch(function () { btn.disabled = false; btn.textContent = 'Send to Tania'; err.innerHTML = 'Sorry, that didn’t go through. Please try again, or call ' + (BK.phoneHtml || '<a href="tel:+13162486839">(316) 248-6839</a>') + '.'; });
    });
    log.appendChild(f); log.scrollTop = log.scrollHeight;
    setTimeout(function () { f.elements.name.focus(); }, 80);
  }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ask(text) {
    text = String(text || '').trim(); if (!text) return;
    if (BK && pending && /^(y|yes|yeah|yep|sure|ok|okay|please|yes please|si|sí|sim)\b/i.test(text)) { var r0 = log.querySelector('.rbt-yn'); if (r0) r0.remove(); pending = false; add(text, true); setTimeout(bookForm, 300); return; }
    if (BK && pending && /^(n|no|nope|not now|no thanks|no thank you|nao|não)\b/i.test(text)) { reply(false); return; }
    add(text, true);
    if (BK && !offered && BOOK_RX.test(text)) { setTimeout(offer, 300); return; }
    var a = answer(text); answered++;
    setTimeout(function () { add(a); if (BK && !offered && (answered >= (BK.after || 2) || a === FALLBACK)) setTimeout(offer, 900); }, 300);
  }
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
