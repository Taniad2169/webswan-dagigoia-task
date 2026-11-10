/*!
 * Swan Video: Tania's video greeting for The WebSwan family of sites (intake-style video widget).
 * A tall video panel that opens on its own (muted, like Intaker), with play / sound / replay / full screen / close
 * controls, a greeting caption over the video, a swan-colored "Call Rachel" button right under the video and an
 * "Intake" button that opens the site's form. Tania picks which video plays on each site in swan-video/admin.html.
 * Best with a vertical (phone-style) video: an .mp4 link or a YouTube Short / YouTube link. By The WebSwan.
 *
 * Embed:  <script src="https://taniad2169.github.io/webswan-dagigoia-task/swan-video/swan-video.js" data-site="wsmn" defer></script>
 * data-site: wsmn | ads | webswan | digital     optional: data-side="left"  data-bottom="96"  data-autoopen="false"
 */
(function () {
  'use strict';
  if (window.__swanVideo) return; window.__swanVideo = true;
  var me = document.currentScript || document.querySelector('script[src*="swan-video.js"]');
  var attr = function (k, d) { var v = me && me.getAttribute(k); return v == null ? d : v; };
  var SITE = attr('data-site', 'wsmn');
  var SIDE = attr('data-side', 'right') === 'left' ? 'left' : 'right';
  var BOTTOM = parseInt(attr('data-bottom', '96'), 10) || 96;
  var BASE = ((me && me.src) || 'https://taniad2169.github.io/webswan-dagigoia-task/swan-video/swan-video.js').replace(/[^/]*$/, '');
  var AUTO = attr('data-autoopen', 'true') !== 'false';
  var API = 'https://webswan-billing.netlify.app/.netlify/functions/site-video';

  // Used until Tania changes them in the admin switch (and whenever the settings can't load).
  var DEFAULTS = {
    wsmn: { on: true, title: 'Meet The WebSwan', caption: 'Hi, welcome to WebSwan Media Network! Here is how we help doctors and attorneys get found.', video: 'chB9apX6nAk', rachel: '+13162486839', rachelLabel: '(316) 248-6839', intake: 'https://taniad2169.github.io/WebSwan-Email-Marketing-Form/?service=ads&from=webswanmedianetwork.com', intakeLabel: 'Start your project', estimate: 'https://taniad2169.github.io/WebSwan-Project-Estimate/', next: [{ video: 'w5TuDgEbdjg', label: 'Learn about our advertising platform' }] },
    ads: { on: true, title: 'Meet The WebSwan', caption: 'Hi doctors and attorneys! Here is how WebSwan Media Network gets your practice found.', video: 'chB9apX6nAk', rachel: '+13162486839', rachelLabel: '(316) 248-6839', intake: 'https://taniad2169.github.io/WebSwan-Email-Marketing-Form/?service=ads&from=ads.webswanmedianetwork.com', intakeLabel: 'Start your project', estimate: 'https://taniad2169.github.io/WebSwan-Project-Estimate/', next: [{ video: 'w5TuDgEbdjg', label: 'Learn about our advertising platform' }] },
    webswan: { on: true, title: 'The WebSwan', caption: 'Hi, welcome to The WebSwan! Let me show you what we can build for your business.', video: 'chB9apX6nAk', rachel: '+12396670151', rachelLabel: '(239) 667-0151', intake: 'https://taniad2169.github.io/WebSwan-Email-Marketing-Form/?service=website&from=thewebswan.com', intakeLabel: 'Start your project', estimate: 'https://taniad2169.github.io/WebSwan-Project-Estimate/' },
    digital: { on: true, title: 'Meet The WebSwan', caption: 'Hi, welcome to WebSwan Digital Solutions! Is your website compliant? Let me explain.', video: 'chB9apX6nAk', rachel: '+12396670151', rachelLabel: '(239) 667-0151', intake: 'https://taniad2169.github.io/WebSwan-Email-Marketing-Form/?service=compliance&from=webswandigitalsolutions.com', intakeLabel: 'Start your project', estimate: 'https://taniad2169.github.io/WebSwan-Project-Estimate/', next: [{ video: 'OIfB0xXgaEY', label: 'Doctors & lawyers: is your website compliant?' }] }
  };
  var C = Object.assign({}, DEFAULTS[SITE] || DEFAULTS.wsmn);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function parseVideo(v) {
    v = String(v || '').trim();
    var m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/);
    if (m) return { yt: m[1] };
    if (/^https:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(v)) return { file: v };
    return null;
  }

  var F = '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';
  var css =
    '#sv-wrap{position:fixed;' + SIDE + ':20px;bottom:' + BOTTOM + 'px;z-index:99996;transition:bottom .25s}' +
    '#sv-mini{position:relative;width:108px;height:150px;border-radius:18px;border:3px solid #fff;padding:0;cursor:pointer;overflow:hidden;background:#0b1d59;box-shadow:0 12px 30px rgba(8,42,72,.45);transition:transform .2s;display:block}' +
    '#sv-mini:hover{transform:scale(1.05)}#sv-mini img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#sv-dot{position:fixed;' + SIDE + ':20px;bottom:' + BOTTOM + 'px;z-index:99996;display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#1b70c2;color:#fff;border-radius:999px;padding:6px 18px 6px 6px;font:800 14px/1.2 Inter,Arial,Helvetica,sans-serif;box-shadow:0 12px 30px rgba(8,42,72,.35);transition:transform .2s}' +
    '#sv-dot[hidden]{display:none!important}#sv-dot:hover{transform:scale(1.04)}' +
    '#sv-dot img{width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid #fff;display:block;flex:none;background:#0b1d59}' +
    '#sv-dot:focus-visible{outline:3px solid #ffb703;outline-offset:2px}' +
    '@media (max-width:600px){#sv-dot .sv-dl{display:none}#sv-dot{padding:5px}}' +
    '#sv-gone{position:absolute;top:-10px;' + (SIDE === 'right' ? 'left' : 'right') + ':-10px;width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:#0b1d59;color:#fff;font-size:14px;line-height:1;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.3);z-index:2}' +
    '#sv-mini .sv-badge{position:absolute;left:6px;right:6px;bottom:6px;background:rgba(11,29,89,.85);color:#fff;font:800 11px/1.2 ' + F + ';padding:5px 4px;border-radius:9px;text-align:center}' +
    '#sv-panel{position:fixed;' + SIDE + ':20px;bottom:' + BOTTOM + 'px;z-index:99999;display:flex;flex-direction:column;width:340px;max-width:calc(100vw - 24px);background:#fff;border-radius:22px;box-shadow:0 30px 70px rgba(8,42,72,.45);overflow:hidden;font-family:' + F + '}' +
    '#sv-panel[hidden],#sv-wrap[hidden]{display:none!important}' +
    '#sv-stage{position:relative;width:100%;flex:1 1 auto;height:520px;min-height:200px;background:#000}' +
    '#sv-stage video,#sv-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}' +
    '#sv-ctrl{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;z-index:3;pointer-events:none}#sv-ctrl div{display:flex;gap:8px}' +
    '#sv-ctrl button{pointer-events:auto;width:40px;height:40px;border-radius:10px;border:0;background:rgba(40,40,40,.62);color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '#sv-ctrl button:hover{background:rgba(11,29,89,.85)}' +
    '#sv-cap{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:46px 18px 16px;color:#fff;font-size:17px;font-weight:600;line-height:1.4;background:linear-gradient(transparent,rgba(0,0,0,.78));text-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none}' +
    '#sv-acts{display:flex;flex-direction:column;gap:8px;padding:12px}' +
    '.sv-rachel{display:flex;align-items:center;justify-content:center;gap:10px;padding:11px;border-radius:14px;text-decoration:none;font-weight:800;font-size:15px;color:#062743;background:linear-gradient(90deg,#77c6e0,#0be0c0);box-shadow:0 6px 16px rgba(11,224,192,.35)}' +
    '.sv-rachel small{display:block;font-weight:600;font-size:12px}' +
    '.sv-next{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:14px;border:0;background:#0b1d59;color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 6px 16px rgba(11,29,89,.3)}.sv-next[hidden]{display:none}.sv-next:hover{background:#1b70c2}' +
    '.sv-est{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:14px;text-decoration:none;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(90deg,#ff6a00,#ff9a1f)}.sv-est:hover{filter:brightness(1.07)}' +
    '.sv-intake{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:14px;border:2px solid #0b1d59;background:#fff;color:#0b1d59;font-weight:800;font-size:14px;cursor:pointer}' +
    '#sv-pow{font-size:11.5px;color:#94a3b8;text-align:center;padding:0 12px 10px}#sv-pow b{color:#0b1d59}' +
    '#sv-mini:focus-visible,#sv-gone:focus-visible,#sv-panel a:focus-visible,#sv-panel button:focus-visible{outline:3px solid #ffb703;outline-offset:2px}' +
    '@media (max-width:600px){#sv-mini{width:84px;height:118px}#sv-wrap,#sv-panel{' + SIDE + ':12px}#sv-panel{width:calc(100vw - 24px)}}';

  var dot, wrap, mini, panel, vid, ifr, ytPlaying = true, ytMuted = true;
  // Playlist: the main video first, then the "Watch next" videos Tania queues in the back office (up to 6 more).
  var cur = 0;
  function playlist() {
    var list = [{ video: C.video, label: C.title }];
    (Array.isArray(C.next) ? C.next : []).forEach(function (n) { if (n && parseVideo(n.video)) list.push({ video: n.video, label: n.label || 'Next video' }); });
    return list;
  }
  var V = function () { var l = playlist(); return parseVideo((l[cur] || l[0]).video); };
  function nextBtn() {
    var b = document.getElementById('sv-next'); if (!b) return;
    var l = playlist(); if (l.length < 2) { b.hidden = true; return; }   // no second video queued: no button for the viewer
    var n = (cur + 1) % l.length; b.hidden = false;
    b.textContent = n === 0 ? '↺ Watch again: ' + l[0].label : '▶ Watch next: ' + l[n].label;
  }
  function playNext() { var l = playlist(); if (l.length < 2) return; cur = (cur + 1) % l.length; loadMedia(false); var c = document.getElementById('sv-cap'); if (c) c.style.display = cur === 0 ? '' : 'none'; nextBtn(); place(); }
  function thumb() { var v = V(); return C.photo || (v && v.yt ? 'https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg' : ''); }
  function yt(func, args) { try { ifr && ifr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) {} }
  function setBtn(id, txt, label) { var b = document.getElementById(id); if (b) { b.textContent = txt; b.setAttribute('aria-label', label); } }
  function loadMedia(muted) {
    var st = document.getElementById('sv-stage'), v = V(); vid = ifr = null;
    st.querySelectorAll('video,iframe,.sv-none').forEach(function (n) { n.remove(); });
    if (!v) { st.insertAdjacentHTML('afterbegin', '<div class="sv-none" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff">Video coming soon</div>'); return; }
    if (v.file) {
      vid = document.createElement('video'); vid.src = v.file; vid.autoplay = true; vid.playsInline = true; vid.muted = !!muted; vid.setAttribute('playsinline', ''); vid.title = C.title;
      vid.addEventListener('play', function () { setBtn('sv-pp', '❚❚', 'Pause'); }); vid.addEventListener('pause', function () { setBtn('sv-pp', '▶', 'Play'); });
      st.insertBefore(vid, st.firstChild); vid.play().catch(function () {});
    } else {
      ifr = document.createElement('iframe'); ifr.title = C.title; ifr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; ifr.setAttribute('allowfullscreen', '');
      ifr.src = 'https://www.youtube-nocookie.com/embed/' + v.yt + '?autoplay=1&mute=' + (muted ? 1 : 0) + '&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&loop=1&playlist=' + v.yt;
      st.insertBefore(ifr, st.firstChild); ytPlaying = true;
    }
    ytMuted = !!muted; setBtn('sv-snd', muted ? '🔇' : '🔊', muted ? 'Turn sound on' : 'Turn sound off'); setBtn('sv-pp', '❚❚', 'Pause');
  }
  function openP(muted) {
    wrap.style.display = 'none'; panel.hidden = false; cur = 0; var c0 = document.getElementById('sv-cap'); if (c0) c0.style.display = ''; nextBtn(); place();
    loadMedia(muted);
    if (!muted) document.getElementById('sv-x').focus();
  }
  function closeP(keepFocus) {
    panel.hidden = true; wrap.style.display = ''; if (dot) dot.hidden = true;
    document.getElementById('sv-stage').querySelectorAll('video,iframe').forEach(function (n) { n.remove(); }); vid = ifr = null;
    try { sessionStorage.setItem('sv-closed', '1'); } catch (e) {}
    if (!keepFocus) mini.focus();
  }
  // Keep clear of the ADA button, cookie banners and anything else pinned to the bottom corner of the page.
  function obstacleHeight() {
    var mine = function (el) { return el.closest && el.closest('#sv-wrap,#sv-panel,#sv-dot'); };
    var top = window.innerHeight, xs = [], w = window.innerWidth;
    for (var dx = 16; dx <= 380 && dx < w; dx += 36) xs.push(SIDE === 'right' ? w - dx : dx);
    for (var y = window.innerHeight - 4; y > window.innerHeight * 0.45; y -= 14) {
      for (var i = 0; i < xs.length; i++) {
        var els = document.elementsFromPoint(xs[i], y) || [];
        for (var j = 0; j < els.length; j++) {
          var el = els[j]; if (mine(el) || el === document.body || el === document.documentElement) continue;
          var n = el, fixed = false;
          while (n && n !== document.body) { var p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') { fixed = true; break; } n = n.parentElement; }
          if (fixed) { var r = n.getBoundingClientRect(); if (r.bottom >= window.innerHeight - 140 && r.height < window.innerHeight * 0.5) top = Math.min(top, r.top); }
        }
      }
    }
    return Math.max(0, window.innerHeight - top);
  }
  function place() {
    if (!wrap) return;
    if (dot) dot.style.visibility = 'hidden';
    var hidden = [wrap, panel].map(function (el) { var d = el.style.visibility; el.style.visibility = 'hidden'; return d; });
    var b = Math.max(window.innerWidth <= 600 ? 12 : 20, obstacleHeight() + 12);
    wrap.style.visibility = hidden[0]; panel.style.visibility = hidden[1];
    var mb = Math.max(b, window.innerWidth <= 600 ? 12 : Math.min(BOTTOM, b + 76));
    wrap.style.bottom = mb + 'px';
    if (dot) { dot.style.visibility = ''; dot.style.bottom = mb + 'px'; }
    panel.style.bottom = b + 'px';
    var nb = document.getElementById('sv-next'), avail = window.innerHeight - b - 16, rest = 190 + (document.querySelector('#sv-panel .sv-est') ? 50 : 0) + (nb && !nb.hidden ? 52 : 0); // room for the buttons under the video
    document.getElementById('sv-stage').style.height = Math.max(200, Math.min(520, avail - rest)) + 'px';
    panel.style.maxHeight = avail + 'px';
  }
  function togglePlay() {
    if (vid) { vid.paused ? vid.play() : vid.pause(); return; }
    if (ifr) { yt(ytPlaying ? 'pauseVideo' : 'playVideo'); ytPlaying = !ytPlaying; setBtn('sv-pp', ytPlaying ? '❚❚' : '▶', ytPlaying ? 'Pause' : 'Play'); }
  }
  function toggleSound() {
    if (vid) { vid.muted = !vid.muted; if (!vid.muted && vid.paused) vid.play(); ytMuted = vid.muted; }
    else if (ifr) { yt(ytMuted ? 'unMute' : 'mute'); if (ytMuted) { yt('playVideo'); ytPlaying = true; setBtn('sv-pp', '❚❚', 'Pause'); } ytMuted = !ytMuted; }
    setBtn('sv-snd', ytMuted ? '🔇' : '🔊', ytMuted ? 'Turn sound on' : 'Turn sound off');
  }
  function replay() {
    if (vid) { vid.currentTime = 0; vid.muted = false; vid.play(); ytMuted = false; }
    else if (ifr) { yt('seekTo', [0, true]); yt('unMute'); yt('playVideo'); ytMuted = false; ytPlaying = true; setBtn('sv-pp', '❚❚', 'Pause'); }
    setBtn('sv-snd', '🔊', 'Turn sound off');
  }
  function full() { var el = vid || ifr || document.getElementById('sv-stage'); var f = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen; if (f) f.call(el); }
  function intakeAction() {
    var t = String(C.intake || '').trim();
    if (t.charAt(0) === '#') { var el = document.querySelector(t); if (el) { closeP(true); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var f = [].slice.call(el.querySelectorAll('input:not([type=hidden]),select,textarea')).filter(function (x) { return x.offsetParent !== null && !x.disabled; })[0]; if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 700); return; } }
    if (/^https?:\/\//i.test(t)) { window.open(t, '_blank', 'noopener'); return; }
    var any = document.querySelector('form'); if (any) { closeP(true); any.scrollIntoView({ behavior: 'smooth' }); }
  }
  function mount() {
    if (!C.on) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var gone = false; try { gone = !!sessionStorage.getItem('sv-gone'); } catch (e) {}
    wrap = document.createElement('div'); wrap.id = 'sv-wrap';
    mini = document.createElement('button'); mini.id = 'sv-mini'; mini.type = 'button'; mini.setAttribute('aria-label', 'Play video: ' + C.title);
    mini.innerHTML = (thumb() ? '<img src="' + esc(thumb()) + '" alt="">' : '') + '<span class="sv-badge">▶ Watch</span>';
    var x = document.createElement('button'); x.id = 'sv-gone'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove the video from this page');
    // The ✕ shrinks the video to a small round bubble in the same corner; tapping the bubble brings it back.
    dot = document.createElement('button'); dot.id = 'sv-dot'; dot.type = 'button'; dot.hidden = true; dot.setAttribute('aria-label', 'Show the video again: ' + C.title);
    dot.innerHTML = '<img src="' + esc(C.photo || BASE + 'tania.jpg') + '" alt=""><span class="sv-dl">▶ Watch video</span>';
    function collapse() { try { sessionStorage.setItem('sv-gone', '1'); } catch (e) {} wrap.style.display = 'none'; dot.hidden = false; place(); dot.focus(); }
    function restore() { try { sessionStorage.removeItem('sv-gone'); } catch (e) {} dot.hidden = true; wrap.style.display = ''; place(); mini.focus(); }
    x.setAttribute('aria-label', 'Shrink the video to a small bubble');
    x.onclick = collapse; dot.onclick = restore;
    wrap.appendChild(mini); wrap.appendChild(x);
    panel = document.createElement('div'); panel.id = 'sv-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', C.title + ' video');
    panel.innerHTML = '<div id="sv-stage"><div id="sv-ctrl"><div><button type="button" id="sv-pp" aria-label="Pause">❚❚</button><button type="button" id="sv-snd" aria-label="Turn sound on">🔇</button></div>' +
      '<div><button type="button" id="sv-rp" aria-label="Replay with sound">↺</button><button type="button" id="sv-fs" aria-label="Full screen">⛶</button><button type="button" id="sv-x" aria-label="Close video">✕</button></div></div>' +
      (C.caption ? '<div id="sv-cap">' + esc(C.caption) + '</div>' : '') + '</div>' +
      '<div id="sv-acts"><button type="button" class="sv-next" id="sv-next" hidden></button><a class="sv-rachel" href="tel:' + esc(C.rachel) + '">📞 <span>Call Rachel for more information<small>' + esc(C.rachelLabel) + ' · she answers day or night</small></span></a>' +
      '<button type="button" class="sv-intake" id="sv-intake">📝 ' + esc(C.intakeLabel || 'Intake') + '</button>' +
      (/^https:\/\//.test(C.estimate || '') ? '<a class="sv-est" href="' + esc(C.estimate) + '" target="_blank" rel="noopener">🧮 Estimate my cost</a>' : '') + '</div>' +
      '<div id="sv-pow">Powered by <b>The WebSwan</b></div>';
    document.body.appendChild(wrap); document.body.appendChild(panel); document.body.appendChild(dot);
    if (gone) { wrap.style.display = 'none'; dot.hidden = false; }
    place(); setInterval(function () { if (document.body.contains(wrap)) place(); }, 1500); window.addEventListener('resize', place);
    mini.onclick = function () { openP(false); };
    document.getElementById('sv-pp').onclick = togglePlay;
    document.getElementById('sv-snd').onclick = toggleSound;
    document.getElementById('sv-rp').onclick = replay;
    document.getElementById('sv-fs').onclick = full;
    document.getElementById('sv-x').onclick = function () { closeP(); };
    document.getElementById('sv-intake').onclick = intakeAction;
    document.getElementById('sv-next').onclick = playNext;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closeP(); });
    // Like Intaker: opens by itself, muted, a few seconds after the page loads (once per visit; not on small phones).
    var closed = false; try { closed = !!sessionStorage.getItem('sv-closed'); } catch (e) {}
    if (AUTO && !closed && !gone && window.innerWidth > 600) setTimeout(function () { if (panel.hidden) openP(true); }, 3500);
  }
  function start() {
    var done = false, go = function () { if (!done) { done = true; mount(); } };
    setTimeout(go, 2500);
    fetch(API + '?site=' + encodeURIComponent(SITE), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.site && !done) ['on', 'title', 'caption', 'video', 'rachel', 'rachelLabel', 'intake', 'intakeLabel', 'photo', 'estimate'].forEach(function (k) { if (d.site[k] !== undefined && d.site[k] !== '') C[k] = d.site[k]; });
      if (d && d.site && Array.isArray(d.site.next)) C.next = d.site.next;
      go();
    }).catch(go);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
