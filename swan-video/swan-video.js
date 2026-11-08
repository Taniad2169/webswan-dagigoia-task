/*!
 * Swan Video: Tania's video bubble for The WebSwan family of sites (like an intake video widget).
 * A floating video of Tania explaining the services, a swan-colored "Call Rachel" button right under the video,
 * and an "Intake" button that opens the site's sign-up form. Tania picks which video plays on each site in
 * swan-video/admin.html (one switch per site). By The WebSwan.
 *
 * Embed:  <script src="https://taniad2169.github.io/webswan-dagigoia-task/swan-video/swan-video.js" data-site="wsmn" defer></script>
 * data-site: wsmn | webswan | digital     optional: data-side="left"  data-bottom="96"
 */
(function () {
  'use strict';
  if (window.__swanVideo) return; window.__swanVideo = true;
  var me = document.currentScript || document.querySelector('script[src*="swan-video.js"]');
  var SITE = (me && me.getAttribute('data-site')) || 'wsmn';
  var SIDE = (me && me.getAttribute('data-side')) === 'left' ? 'left' : 'right';
  var BOTTOM = parseInt((me && me.getAttribute('data-bottom')) || '96', 10) || 96;
  var BASE = ((me && me.src) || 'https://taniad2169.github.io/webswan-dagigoia-task/swan-video/swan-video.js').replace(/[^/]*$/, '');
  var API = 'https://webswan-billing.netlify.app/.netlify/functions/site-video';

  // Used until Tania changes them in the admin switch (and if the settings can't load).
  var DEFAULTS = {
    wsmn: { on: true, title: 'What WebSwan Media Network does for you', video: 'w5TuDgEbdjg', rachel: '+13162486839', rachelLabel: '(316) 248-6839', intake: '#lead-form', intakeLabel: 'Intake: see if your practice qualifies' },
    webswan: { on: true, title: 'Meet The WebSwan family', video: 'chB9apX6nAk', rachel: '+12396670151', rachelLabel: '(239) 667-0151', intake: '', intakeLabel: 'Intake: tell us about your project' },
    digital: { on: true, title: 'Website compliance can cost you', video: '4EkFN0lj4cw', rachel: '+12396670151', rachelLabel: '(239) 667-0151', intake: 'https://webswan-free-audit.netlify.app/', intakeLabel: 'Intake: get your free website audit' }
  };
  var C = Object.assign({}, DEFAULTS[SITE] || DEFAULTS.wsmn);

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // A video is a YouTube id/link or a direct .mp4/.webm link.
  function parseVideo(v) {
    v = String(v || '').trim();
    var m = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/);
    if (m) return { yt: m[1] };
    if (/^https:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(v)) return { file: v };
    return null;
  }

  var css = '#sv-launch{position:fixed;' + SIDE + ':20px;bottom:' + BOTTOM + 'px;z-index:99996;width:92px;height:92px;border-radius:50%;border:4px solid #fff;padding:0;cursor:pointer;overflow:hidden;background:#0b1d59;box-shadow:0 12px 30px rgba(8,42,72,.4);transition:transform .2s}' +
    '#sv-launch:hover{transform:scale(1.06)}#sv-launch img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#sv-launch .sv-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,29,89,.25)}#sv-launch .sv-play span{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#0b1d59;font-size:15px;padding-left:3px}' +
    '#sv-tip{position:fixed;' + SIDE + ':118px;bottom:' + (BOTTOM + 28) + 'px;z-index:99996;background:#fff;color:#0b1d59;font:700 13px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;padding:8px 12px;border-radius:12px;box-shadow:0 8px 22px rgba(8,42,72,.25);max-width:190px;cursor:pointer}' +
    '#sv-tip button{border:0;background:none;color:#64748b;margin-left:6px;cursor:pointer;font-size:13px}' +
    '#sv-panel{position:fixed;' + SIDE + ':20px;bottom:' + BOTTOM + 'px;z-index:99999;width:400px;max-width:calc(100vw - 32px);background:#fff;border-radius:20px;box-shadow:0 30px 70px rgba(8,42,72,.4);overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,sans-serif}' +
    '#sv-panel .sv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(90deg,#0b1d59,#1b70c2);color:#fff}#sv-panel .sv-top b{font-size:14px}' +
    '#sv-x{border:0;background:rgba(255,255,255,.18);color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1}' +
    '#sv-media{position:relative;width:100%;aspect-ratio:16/9;background:#000}#sv-media iframe,#sv-media video{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '#sv-panel .sv-acts{display:flex;flex-direction:column;gap:8px;padding:12px}' +
    '.sv-rachel{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;color:#062743;background:linear-gradient(90deg,#77c6e0,#0be0c0);box-shadow:0 6px 16px rgba(11,224,192,.35)}' +
    '.sv-rachel small{display:block;font-weight:600;font-size:12px}' +
    '.sv-intake{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:12px;border:2px solid #0b1d59;background:#fff;color:#0b1d59;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none}' +
    '#sv-panel .sv-note{font-size:11.5px;color:#64748b;text-align:center;padding:0 12px 10px}' +
    '#sv-launch:focus-visible,#sv-panel a:focus-visible,#sv-panel button:focus-visible{outline:3px solid #ffb703;outline-offset:2px}' +
    '@media (max-width:600px){#sv-launch{width:72px;height:72px}#sv-tip{display:none}}';

  function intakeAction() {
    var t = String(C.intake || '').trim();
    if (t.charAt(0) === '#') { var el = document.querySelector(t); if (el) { closeP(true); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); var f = [].slice.call(el.querySelectorAll('input:not([type=hidden]),select,textarea')).filter(function (x) { return x.offsetParent !== null && !x.disabled; })[0]; if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 700); return; } }
    if (/^https?:\/\//i.test(t)) { window.open(t, '_blank', 'noopener'); return; }
    var any = document.querySelector('form'); if (any) { closeP(true); any.scrollIntoView({ behavior: 'smooth' }); }
  }

  var launch, panel, tip;
  function media() {
    var v = parseVideo(C.video); if (!v) return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">Video coming soon</div>';
    if (v.yt) return '<iframe src="https://www.youtube-nocookie.com/embed/' + v.yt + '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + esc(C.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    return '<video src="' + esc(v.file) + '" controls autoplay playsinline title="' + esc(C.title) + '"></video>';
  }
  function openP() {
    if (tip) tip.remove();
    panel.hidden = false; launch.style.display = 'none';
    document.getElementById('sv-media').innerHTML = media();
    document.getElementById('sv-x').focus();
  }
  function closeP(keepFocus) {
    panel.hidden = true; launch.style.display = '';
    document.getElementById('sv-media').innerHTML = ''; // stops the video
    if (!keepFocus) launch.focus();
  }
  function thumb() { var v = parseVideo(C.video); return C.photo || (v && v.yt ? 'https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg' : BASE + 'tania.jpg'); }
  function mount() {
    if (!C.on) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    launch = document.createElement('button'); launch.id = 'sv-launch'; launch.type = 'button'; launch.setAttribute('aria-label', 'Play video: ' + C.title);
    launch.innerHTML = '<img src="' + esc(thumb()) + '" alt=""><span class="sv-play" aria-hidden="true"><span>▶</span></span>';
    panel = document.createElement('div'); panel.id = 'sv-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', C.title);
    panel.innerHTML = '<div class="sv-top"><b>' + esc(C.title) + '</b><button type="button" id="sv-x" aria-label="Close video">×</button></div>' +
      '<div id="sv-media"></div>' +
      '<div class="sv-acts"><a class="sv-rachel" href="tel:' + esc(C.rachel) + '">📞 <span>Call Rachel for more information<small>' + esc(C.rachelLabel) + ' · she answers day or night</small></span></a>' +
      '<button type="button" class="sv-intake" id="sv-intake">📝 ' + esc(C.intakeLabel || 'Intake') + '</button></div>' +
      '<div class="sv-note">Calls only on Rachel\'s line. Powered by The WebSwan.</div>';
    document.body.appendChild(launch); document.body.appendChild(panel);
    launch.onclick = openP;
    document.getElementById('sv-x').onclick = function () { closeP(); };
    document.getElementById('sv-intake').onclick = intakeAction;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closeP(); });
    try { if (!sessionStorage.getItem('sv-tip')) {
      tip = document.createElement('div'); tip.id = 'sv-tip'; tip.innerHTML = '🎬 Watch: what we do for you <button type="button" aria-label="Hide">×</button>';
      tip.onclick = function (e) { if (e.target.tagName === 'BUTTON') { tip.remove(); try { sessionStorage.setItem('sv-tip', '1'); } catch (x) {} return; } openP(); };
      setTimeout(function () { if (panel.hidden) document.body.appendChild(tip); }, 2500);
    } } catch (e) {}
  }
  function start() {
    var done = false, go = function () { if (!done) { done = true; mount(); } };
    setTimeout(go, 2500); // never wait long for the settings
    fetch(API + '?site=' + encodeURIComponent(SITE), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.site && !done) { ['on', 'title', 'video', 'rachel', 'rachelLabel', 'intake', 'intakeLabel', 'photo'].forEach(function (k) { if (d.site[k] !== undefined && d.site[k] !== '') C[k] = d.site[k]; }); }
      go();
    }).catch(go);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
