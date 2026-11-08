/*!
 * Tania — travel & city concierge for Travel Hub (travel-pwa). By The WebSwan.
 * Guided chat like Rachel on WebSwan Media Network: she greets, asks what you'd like to do, offers buttons,
 * finds real options (fares, restaurants, events, things to do, community spots) and reads her answers out loud.
 * Loaded by travel-plus.js. Backend: webswan-billing /.netlify/functions/tania-concierge
 */
(function () {
  'use strict';
  if (window.__taniaConcierge) return; window.__taniaConcierge = true;
  var API = 'https://webswan-billing.netlify.app/.netlify/functions/tania-concierge';
  var BASE = (document.currentScript && document.currentScript.src || 'https://taniad2169.github.io/webswan-dagigoia-task/travel-plus/tania.js').replace(/[^/]*$/, '');
  var PHOTO = BASE + 'tania.jpg';
  var LANG = 'en', VOICE_ON = true, S = {}, HIST = [], LAST = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- words (English, Spanish, Portuguese, French) ---------------- */
  var T = {
    en: { stay: '🏨 Where to stay', car: '🚗 Rent a car', stayIntro: 'Here are places to stay, already set to your city and dates. You book directly with them.', carIntro: 'Car rentals for your dates. You book directly with them.', reserve: 'Reserve', tickets: 'Tickets / RSVP', code: 'Your trip code', codeTip: 'Save this link to reopen your booking links anytime.', copy: 'Copy link', copied: 'Copied!', welcome: 'Welcome back! Here are the booking links for trip code', selfbook: 'I don’t book or take payments, so you book directly on the official site.', allmap: 'All of them on the map', bigmap: 'Open the full map', cost: 'Free or paid events?', free: 'Free', paid: 'Paid', format: 'In person, or online (live / Zoom)?', inperson: 'In person', online: 'Online / Zoom', evph: 'Type any kind: gospel, jazz, real estate…', hi: "Hi! I'm Tania, your travel and city concierge. What would you like to do today?", travel: '✈️ Travel', food: '🍽️ Restaurants', events: '🎉 Events & entertainment', net: '🤝 Networking', sights: '📍 Things to do', community: '🌍 Find my community', how: 'How would you like to travel?', air: '✈️ Airfare', amtrak: '🚆 Amtrak', road: '🚗 Road trip', from: 'Where are you leaving from? (city or airport)', to: 'And where are you going?', trip: 'One way or round trip?', oneway: 'One way', round: 'Round trip', dep: 'What day do you leave?', ret: 'And the day you come back?', stops: 'How many layovers are okay?', nonstop: 'Nonstop only', one: 'Up to 1', two: 'Up to 2', any: 'Any', search: 'Search', city: 'Which city? (for example: Miami, FL)', cuisine: 'What kind of food are you craving?', purpose: 'Is this to dine out, for catering, or for a party or event?', dine: 'Dine out', cater: 'Catering', party: 'Party / event', evtype: 'What kind of event?', when: 'When?', thisweek: 'This week', weekend: 'This weekend', month: 'This month', comm: 'Which community are you looking for?', looking: 'Let me look that up for you…', none: "I couldn't find good matches there. Try a nearby bigger city, or another choice.", again: 'Anything else I can find for you?', menu: '🏠 Main menu', book: 'Book', open: 'Open', call: 'Call', site: 'Website', map: 'Map', reviews: 'Reviews', hours: 'Hours', compare: 'Compare live prices', type: 'Type your message…', send: 'Send', voiceOn: '🔊 Voice on', voiceOff: '🔈 Voice off', foot: 'Tania finds options and links; prices and hours can change, so check before you go.', layover: 'layover', layovers: 'layovers', nonstopW: 'nonstop', resv: 'For a reservation, call them or use their website. Want me to find more?', foodPlaces: 'Here are places I found', commIntro: 'Here are spots that serve or are run by the community', sightsIntro: 'Here are popular places to visit', evIntro: 'Here is what I found', more: 'More places to look' },
    es: { stay: '🏨 Dónde hospedarse', car: '🚗 Alquilar auto', stayIntro: 'Lugares para hospedarte, ya con tu ciudad y fechas. Reservas directamente con ellos.', carIntro: 'Autos de alquiler para tus fechas. Reservas directamente con ellos.', reserve: 'Reservar', tickets: 'Entradas / RSVP', code: 'Tu código de viaje', codeTip: 'Guarda este enlace para abrir tus reservas cuando quieras.', copy: 'Copiar enlace', copied: '¡Copiado!', welcome: '¡Bienvenido de nuevo! Estos son los enlaces de tu código', selfbook: 'Yo no reservo ni cobro; reservas directamente en el sitio oficial.', allmap: 'Todos en el mapa', bigmap: 'Abrir el mapa completo', cost: '¿Eventos gratis o pagados?', free: 'Gratis', paid: 'Pagados', format: '¿En persona o en línea (en vivo / Zoom)?', inperson: 'En persona', online: 'En línea / Zoom', evph: 'Escribe cualquier tipo: góspel, jazz, bienes raíces…', hi: '¡Hola! Soy Tania, tu conserje de viajes y de la ciudad. ¿Qué te gustaría hacer hoy?', travel: '✈️ Viajar', food: '🍽️ Restaurantes', events: '🎉 Eventos y entretenimiento', net: '🤝 Networking', sights: '📍 Qué visitar', community: '🌍 Encontrar mi comunidad', how: '¿Cómo te gustaría viajar?', air: '✈️ Avión', amtrak: '🚆 Amtrak', road: '🚗 En carretera', from: '¿Desde dónde sales? (ciudad o aeropuerto)', to: '¿Y a dónde vas?', trip: '¿Solo ida o ida y vuelta?', oneway: 'Solo ida', round: 'Ida y vuelta', dep: '¿Qué día sales?', ret: '¿Y qué día regresas?', stops: '¿Cuántas escalas aceptas?', nonstop: 'Solo directo', one: 'Hasta 1', two: 'Hasta 2', any: 'Cualquiera', search: 'Buscar', city: '¿En qué ciudad? (por ejemplo: Miami, FL)', cuisine: '¿Qué tipo de comida se te antoja?', purpose: '¿Es para comer fuera, catering, o una fiesta o evento?', dine: 'Comer fuera', cater: 'Catering', party: 'Fiesta / evento', evtype: '¿Qué tipo de evento?', when: '¿Cuándo?', thisweek: 'Esta semana', weekend: 'Este fin de semana', month: 'Este mes', comm: '¿Qué comunidad buscas?', looking: 'Déjame buscarlo…', none: 'No encontré buenas opciones allí. Prueba una ciudad cercana más grande u otra opción.', again: '¿Algo más que pueda buscarte?', menu: '🏠 Menú principal', book: 'Reservar', open: 'Abrir', call: 'Llamar', site: 'Sitio web', map: 'Mapa', reviews: 'Reseñas', hours: 'Horario', compare: 'Comparar precios en vivo', type: 'Escribe tu mensaje…', send: 'Enviar', voiceOn: '🔊 Voz activada', voiceOff: '🔈 Voz apagada', foot: 'Tania encuentra opciones y enlaces; precios y horarios pueden cambiar.', layover: 'escala', layovers: 'escalas', nonstopW: 'directo', resv: 'Para reservar, llámalos o usa su sitio web. ¿Busco más?', foodPlaces: 'Estos son los lugares que encontré', commIntro: 'Lugares que sirven o dirige la comunidad', sightsIntro: 'Lugares populares para visitar', evIntro: 'Esto es lo que encontré', more: 'Más lugares para buscar' },
    pt: { stay: '🏨 Onde ficar', car: '🚗 Alugar carro', stayIntro: 'Lugares para ficar, já com sua cidade e datas. Você reserva direto com eles.', carIntro: 'Aluguel de carro para suas datas. Você reserva direto com eles.', reserve: 'Reservar', tickets: 'Ingressos / RSVP', code: 'Seu código de viagem', codeTip: 'Guarde este link para reabrir suas reservas quando quiser.', copy: 'Copiar link', copied: 'Copiado!', welcome: 'Bem-vindo de volta! Aqui estão os links do código', selfbook: 'Eu não faço reservas nem pagamentos; você reserva direto no site oficial.', allmap: 'Todos no mapa', bigmap: 'Abrir o mapa completo', cost: 'Eventos grátis ou pagos?', free: 'Grátis', paid: 'Pagos', format: 'Presencial ou online (ao vivo / Zoom)?', inperson: 'Presencial', online: 'Online / Zoom', evph: 'Digite qualquer tipo: gospel, jazz, imóveis…', hi: 'Oi! Eu sou a Tania, sua concierge de viagens e da cidade. O que você gostaria de fazer hoje?', travel: '✈️ Viajar', food: '🍽️ Restaurantes', events: '🎉 Eventos e entretenimento', net: '🤝 Networking', sights: '📍 O que visitar', community: '🌍 Encontrar minha comunidade', how: 'Como você quer viajar?', air: '✈️ Avião', amtrak: '🚆 Amtrak', road: '🚗 De carro', from: 'De onde você sai? (cidade ou aeroporto)', to: 'E para onde vai?', trip: 'Só ida ou ida e volta?', oneway: 'Só ida', round: 'Ida e volta', dep: 'Que dia você vai?', ret: 'E que dia volta?', stops: 'Quantas escalas tudo bem?', nonstop: 'Só voo direto', one: 'Até 1', two: 'Até 2', any: 'Qualquer', search: 'Buscar', city: 'Qual cidade? (por exemplo: Miami, FL)', cuisine: 'Que tipo de comida você quer?', purpose: 'É para comer fora, buffet/catering ou festa/evento?', dine: 'Comer fora', cater: 'Catering', party: 'Festa / evento', evtype: 'Que tipo de evento?', when: 'Quando?', thisweek: 'Esta semana', weekend: 'Este fim de semana', month: 'Este mês', comm: 'Qual comunidade você procura?', looking: 'Deixa eu procurar…', none: 'Não encontrei boas opções aí. Tente uma cidade maior perto ou outra opção.', again: 'Quer que eu procure mais alguma coisa?', menu: '🏠 Menu principal', book: 'Reservar', open: 'Abrir', call: 'Ligar', site: 'Site', map: 'Mapa', reviews: 'Avaliações', hours: 'Horário', compare: 'Comparar preços ao vivo', type: 'Escreva sua mensagem…', send: 'Enviar', voiceOn: '🔊 Voz ligada', voiceOff: '🔈 Voz desligada', foot: 'A Tania encontra opções e links; preços e horários podem mudar.', layover: 'escala', layovers: 'escalas', nonstopW: 'direto', resv: 'Para reservar, ligue ou use o site deles. Quer que eu procure mais?', foodPlaces: 'Aqui estão os lugares que encontrei', commIntro: 'Lugares da comunidade ou que servem a comunidade', sightsIntro: 'Lugares populares para visitar', evIntro: 'Aqui está o que encontrei', more: 'Mais lugares para procurar' },
    fr: { stay: '🏨 Où loger', car: '🚗 Louer une voiture', stayIntro: 'Des logements déjà réglés sur votre ville et vos dates. Vous réservez directement chez eux.', carIntro: 'Locations de voiture pour vos dates. Vous réservez directement chez eux.', reserve: 'Réserver', tickets: 'Billets / RSVP', code: 'Votre code de voyage', codeTip: 'Gardez ce lien pour rouvrir vos réservations à tout moment.', copy: 'Copier le lien', copied: 'Copié !', welcome: 'Bon retour ! Voici les liens du code', selfbook: 'Je ne réserve pas et ne prends aucun paiement ; vous réservez sur le site officiel.', allmap: 'Tous sur la carte', bigmap: 'Ouvrir la carte complète', cost: 'Événements gratuits ou payants ?', free: 'Gratuits', paid: 'Payants', format: 'En personne ou en ligne (live / Zoom) ?', inperson: 'En personne', online: 'En ligne / Zoom', evph: 'Tapez n’importe quel type : gospel, jazz, immobilier…', hi: 'Bonjour ! Je suis Tania, votre concierge voyage et ville. Que souhaitez-vous faire aujourd’hui ?', travel: '✈️ Voyager', food: '🍽️ Restaurants', events: '🎉 Événements et sorties', net: '🤝 Networking', sights: '📍 À visiter', community: '🌍 Trouver ma communauté', how: 'Comment voulez-vous voyager ?', air: '✈️ Avion', amtrak: '🚆 Amtrak', road: '🚗 Road trip', from: 'D’où partez-vous ? (ville ou aéroport)', to: 'Et où allez-vous ?', trip: 'Aller simple ou aller-retour ?', oneway: 'Aller simple', round: 'Aller-retour', dep: 'Quel jour partez-vous ?', ret: 'Et le jour du retour ?', stops: 'Combien d’escales acceptez-vous ?', nonstop: 'Direct seulement', one: 'Jusqu’à 1', two: 'Jusqu’à 2', any: 'Peu importe', search: 'Rechercher', city: 'Quelle ville ? (par exemple : Miami, FL)', cuisine: 'Quel type de cuisine ?', purpose: 'C’est pour sortir manger, un traiteur, ou une fête / un événement ?', dine: 'Sortir manger', cater: 'Traiteur', party: 'Fête / événement', evtype: 'Quel type d’événement ?', when: 'Quand ?', thisweek: 'Cette semaine', weekend: 'Ce week-end', month: 'Ce mois-ci', comm: 'Quelle communauté cherchez-vous ?', looking: 'Je cherche pour vous…', none: 'Je n’ai pas trouvé de bonnes options. Essayez une grande ville proche ou un autre choix.', again: 'Autre chose que je peux trouver pour vous ?', menu: '🏠 Menu principal', book: 'Réserver', open: 'Ouvrir', call: 'Appeler', site: 'Site web', map: 'Carte', reviews: 'Avis', hours: 'Horaires', compare: 'Comparer les prix en direct', type: 'Écrivez votre message…', send: 'Envoyer', voiceOn: '🔊 Voix activée', voiceOff: '🔈 Voix coupée', foot: 'Tania trouve des options et des liens ; prix et horaires peuvent changer.', layover: 'escale', layovers: 'escales', nonstopW: 'direct', resv: 'Pour réserver, appelez-les ou passez par leur site. J’en cherche d’autres ?', foodPlaces: 'Voici les endroits trouvés', commIntro: 'Lieux tenus par la communauté ou qui la servent', sightsIntro: 'Lieux populaires à visiter', evIntro: 'Voici ce que j’ai trouvé', more: 'Autres endroits où chercher' }
  };
  var t = function (k) { return (T[LANG] || T.en)[k] || T.en[k] || k; };
  var CUISINES = ['Haitian', 'Jamaican', 'Dominican', 'Cuban', 'Puerto Rican', 'Brazilian', 'Ethiopian', 'Nigerian', 'French', 'Colombian', 'Mexican', 'Caribbean', 'Italian', 'Greek', 'Lebanese', 'Indian', 'Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Peruvian', 'Soul food', 'Seafood', 'Vegan', 'Any'];
  var COMMS = [['haitian', '🇭🇹 Haitian'], ['brazilian', '🇧🇷 Brazilian'], ['dominican', '🇩🇴 Dominican'], ['jamaican', '🇯🇲 Jamaican'], ['cuban', '🇨🇺 Cuban'], ['puertorican', '🇵🇷 Puerto Rican'], ['colombian', '🇨🇴 Colombian'], ['mexican', '🇲🇽 Mexican'], ['ethiopian', '🇪🇹 Ethiopian'], ['nigerian', '🇳🇬 Nigerian'], ['african', '🌍 African'], ['caribbean', '🌴 Caribbean'], ['indian', '🇮🇳 Indian'], ['french', '🇫🇷 French-speaking']];
  var EVTYPES = ['Networking', 'Christian / church', 'Concerts', 'Business & chamber of commerce', 'Women in business', 'Festivals', 'Comedy', 'Movies', 'Family & kids', 'Nightlife', 'Art & culture', 'Food & drink', 'Health & wellness', 'Sports'];

  /* ---------------- voice (browser, female, native accent; text only if none) ---------------- */
  var VOICE = {
    pick: function () {
      if (!('speechSynthesis' in window)) return null;
      var want = { en: 'en', es: 'es', pt: 'pt-BR', fr: 'fr' }[LANG], vs = speechSynthesis.getVoices();
      var fem = /female|samantha|victoria|karen|moira|tessa|zira|aria|jenny|michelle|ava|allison|susan|monica|paulina|luciana|francisca|amelie|audrey|marie|google us english|google español|google português|google français/i;
      var same = vs.filter(function (v) { return String(v.lang).toLowerCase().indexOf(want.toLowerCase()) === 0 || (want === 'pt-BR' && /^pt[-_]br/i.test(v.lang)); });
      return same.find(function (v) { return fem.test(v.name); }) || same[0] || null;
    },
    say: function (text) {
      if (!VOICE_ON || !('speechSynthesis' in window)) return;
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(String(text).replace(/[✈️🚆🚗🍽️🎉🤝📍🌍🏠🔎⭐•]/g, '').slice(0, 600));
        var v = VOICE.pick(); if (!v) return; u.voice = v; u.lang = v.lang; u.rate = 1; u.pitch = 1.05;
        var face = $('tc-face'); u.onstart = function () { face && face.classList.add('talk'); }; u.onend = u.onerror = function () { face && face.classList.remove('talk'); };
        speechSynthesis.speak(u);
      } catch (e) {}
    },
    stop: function () { try { speechSynthesis.cancel(); } catch (e) {} var f = $('tc-face'); f && f.classList.remove('talk'); }
  };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = function () {};

  /* ---------------- UI ---------------- */
  var css = '#tc-launch{position:fixed;right:18px;bottom:18px;z-index:99990;display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,#3898f5,#48d6fa);color:#fff;border:0;border-radius:999px;padding:6px 16px 6px 6px;font:700 15px system-ui,sans-serif;box-shadow:0 10px 30px rgba(8,42,72,.35);cursor:pointer}' +
    '#tc-launch img{width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid #fff}' +
    '#tc-panel{position:fixed;right:18px;bottom:84px;z-index:99991;width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 110px));background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(8,42,72,.35);display:flex;flex-direction:column;overflow:hidden;font:15px/1.45 system-ui,sans-serif;color:#18364a}' +
    '#tc-panel[hidden]{display:none}.tc-top{display:flex;gap:10px;align-items:center;padding:12px 14px;background:linear-gradient(90deg,#082a48,#1b70c2);color:#fff}' +
    '#tc-face{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #a9ecfc;transition:box-shadow .2s}#tc-face.talk{box-shadow:0 0 0 4px rgba(72,214,250,.55),0 0 18px rgba(72,214,250,.9);animation:tcpulse 1s infinite}' +
    '@keyframes tcpulse{50%{box-shadow:0 0 0 7px rgba(72,214,250,.25),0 0 22px rgba(72,214,250,.6)}}' +
    '.tc-top b{display:block;font-size:16px}.tc-top small{color:#bfe4f7}.tc-x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer}' +
    '.tc-bar{display:flex;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid #e3eef3;font-size:12.5px}.tc-bar button,.tc-bar select{border:1px solid #cfe2ea;background:#f6fbfd;border-radius:8px;padding:3px 8px;font-size:12.5px;cursor:pointer}' +
    '#tc-log{flex:1;overflow:auto;padding:12px;background:#f3f8fb}.tc-m{max-width:88%;margin:6px 0;padding:9px 12px;border-radius:14px;white-space:pre-wrap}.tc-m.bot{background:#fff;border:1px solid #dcebf1}.tc-m.me{background:#3898f5;color:#fff;margin-left:auto}' +
    '.tc-card{background:#fff;border:1px solid #dcebf1;border-radius:12px;padding:9px 11px;margin:6px 0}.tc-card b{color:#082a48}.tc-card .tc-sub{color:#5c7180;font-size:13px}.tc-card .tc-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.tc-card .tc-acts a{font-size:12.5px;font-weight:700;color:#0875a5;text-decoration:none;border:1px solid #cfe2ea;border-radius:8px;padding:2px 8px}' +
    '.tc-price{float:right;font-weight:800;color:#1e8e5e;font-size:17px}' +
    '#tc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-top:1px solid #e3eef3;max-height:150px;overflow:auto}#tc-chips button{border:1px solid #9fd5ee;background:#eef8fd;color:#0c3a61;border-radius:999px;padding:5px 11px;font-weight:700;font-size:13px;cursor:pointer}#tc-chips input{border:1px solid #9fd5ee;border-radius:8px;padding:5px 8px;font-size:14px}' +
    '#tc-form{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #e3eef3}#tc-form input{flex:1;border:1.5px solid #cfe2ea;border-radius:10px;padding:9px}#tc-form button{background:#082a48;color:#fff;border:0;border-radius:10px;padding:0 14px;font-weight:700}' +
    '.tc-foot{font-size:11px;color:#5c7180;padding:0 12px 8px}';
  function mount() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var btn = document.createElement('button'); btn.id = 'tc-launch'; btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<img src="' + PHOTO + '" alt=""> <span>Ask Tania</span>';
    var p = document.createElement('div'); p.id = 'tc-panel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Chat with Tania');
    p.innerHTML = '<div class="tc-top"><img id="tc-face" src="' + PHOTO + '" alt="Tania"><div><b>Tania</b><small>Travel & city concierge</small></div><button class="tc-x" id="tc-x" aria-label="Close">×</button></div>' +
      '<div class="tc-bar"><button type="button" id="tc-voice">' + t('voiceOn') + '</button><select id="tc-lang" aria-label="Language"><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option><option value="fr">Français</option></select></div>' +
      '<div id="tc-log" role="log" aria-live="polite"></div><div id="tc-chips"></div>' +
      '<form id="tc-form" autocomplete="off"><input id="tc-in" maxlength="400" placeholder="' + t('type') + '"><button type="submit">' + t('send') + '</button></form><div class="tc-foot" id="tc-foot">' + t('foot') + '</div>';
    document.body.appendChild(btn); document.body.appendChild(p);
    btn.onclick = function () { p.hidden ? openT() : closeT(); };
    $('tc-x').onclick = closeT;
    $('tc-voice').onclick = function () { VOICE_ON = !VOICE_ON; this.textContent = VOICE_ON ? t('voiceOn') : t('voiceOff'); if (!VOICE_ON) VOICE.stop(); };
    var navLang = String(navigator.language || 'en').slice(0, 2); if (T[navLang]) { LANG = navLang; $('tc-lang').value = LANG; }
    $('tc-lang').onchange = function () { LANG = this.value; $('tc-in').placeholder = t('type'); $('tc-foot').textContent = t('foot'); $('tc-voice').textContent = VOICE_ON ? t('voiceOn') : t('voiceOff'); start(); };
    setTimeout(reopen, 200);
    $('tc-form').onsubmit = function (e) { e.preventDefault(); var v = $('tc-in').value.trim(); if (!v) return; $('tc-in').value = ''; typed(v); };
  }
  var started = false;
  function openT(noStart) { $('tc-panel').hidden = false; $('tc-launch').setAttribute('aria-expanded', 'true'); if (!started) { started = true; if (noStart !== true) start(); } setTimeout(function () { $('tc-in').focus(); }, 50); }
  function closeT() { VOICE.stop(); $('tc-panel').hidden = true; $('tc-launch').setAttribute('aria-expanded', 'false'); }
  function say(text, who, html) {
    var d = document.createElement('div'); d.className = 'tc-m ' + (who === 'me' ? 'me' : 'bot');
    if (html) d.innerHTML = html; else d.textContent = text;
    $('tc-log').appendChild(d); $('tc-log').scrollTop = $('tc-log').scrollHeight;
    if (who !== 'me') { HIST.push({ role: 'assistant', content: text }); VOICE.say(text); } else HIST.push({ role: 'user', content: text });
    HIST = HIST.slice(-12);
    return d;
  }
  function addHTML(html) { var d = document.createElement('div'); d.innerHTML = html; $('tc-log').appendChild(d); $('tc-log').scrollTop = $('tc-log').scrollHeight; }
  function chips(list, input) {
    var c = $('tc-chips'); c.innerHTML = '';
    if (input) {
      var i = document.createElement('input'); i.type = input.type || 'text'; i.placeholder = input.ph || ''; if (input.min) i.min = input.min; if (input.value) i.value = input.value;
      var go = document.createElement('button'); go.type = 'button'; go.textContent = input.btn || t('search');
      go.onclick = function () { if (i.value) { say(input.type === 'date' ? niceDate(i.value) : i.value, 'me'); input.done(i.value); } };
      i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } };
      c.appendChild(i); c.appendChild(go); setTimeout(function () { i.focus(); }, 30);
    }
    (list || []).forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = x[1];
      b.onclick = function () { say(x[1], 'me'); x[2] ? x[2]() : pick(x[0]); };
      c.appendChild(b);
    });
  }
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function niceDate(s) { try { return new Date(s + 'T12:00:00').toLocaleDateString(LANG === 'pt' ? 'pt-BR' : LANG, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return s; } }
  function api(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ lang: LANG }, body)) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || ('Error ' + r.status)); return d; }); });
  }
  function menuChip() { return ['menu', t('menu'), start]; }

  /* ---------------- flows ---------------- */
  function start() {
    S = {}; $('tc-log').innerHTML = ''; HIST = [];
    say(t('hi'));
    chips([['travel', t('travel'), travel], ['food', t('food'), food], ['events', t('events'), function () { events(false); }], ['net', t('net'), function () { events(true); }], ['sights', t('sights'), sights], ['community', t('community'), community]]);
  }
  function askCity(next) {
    if (S.city) return next();
    say(t('city')); chips([menuChip()], { ph: 'Miami, FL', done: function (v) { S.city = v; next(); } });
  }
  // travel
  function travel() {
    S.flow = 'travel'; say(t('how'));
    chips([['air', t('air'), function () { S.mode = 'air'; tFrom(); }], ['amtrak', t('amtrak'), function () { S.mode = 'amtrak'; tFrom(); }], ['road', t('road'), function () { S.mode = 'road'; tFrom(); }], menuChip()]);
  }
  function tFrom() { say(t('from')); chips([menuChip()], { ph: 'Miami (MIA)', done: function (v) { S.from = v; tTo(); } }); }
  function tTo() { say(t('to')); chips([menuChip()], { ph: 'São Paulo (GRU)', done: function (v) { S.to = v; tTrip(); } }); }
  function tTrip() { say(t('trip')); chips([['ow', t('oneway'), function () { S.round = false; tDep(); }], ['rt', t('round'), function () { S.round = true; tDep(); }], menuChip()]); }
  function tDep() { say(t('dep')); chips([menuChip()], { type: 'date', min: today(), done: function (v) { S.dep = v; S.round ? tRet() : tStops(); } }); }
  function tRet() { say(t('ret')); chips([menuChip()], { type: 'date', min: S.dep, done: function (v) { S.ret = v; tStops(); } }); }
  function tStops() {
    if (S.mode !== 'air') return tSearch();
    say(t('stops'));
    chips([['0', t('nonstop'), function () { S.stops = '0'; tSearch(); }], ['1', t('one'), function () { S.stops = '1'; tSearch(); }], ['2', t('two'), function () { S.stops = '2'; tSearch(); }], ['any', t('any'), function () { S.stops = ''; tSearch(); }]]);
  }
  function tSearch() {
    say(t('looking')); chips([]);
    api({ action: 'fares', mode: S.mode, from: S.from, to: S.to, dep: S.dep, ret: S.round ? S.ret : '', stops: S.stops }).then(function (d) {
      if (d.error) { say(d.error); return chips([['again', t('travel'), travel], menuChip()]); }
      LAST = d;
      if (d.results && d.results.length) {
        say(d.note || t('evIntro'));
        addHTML(d.results.map(function (f, i) {
          var st = f.stops ? f.stops + ' ' + (f.stops > 1 ? t('layovers') : t('layover')) : t('nonstopW');
          var when = f.depart ? new Date(f.depart).toLocaleString(LANG === 'pt' ? 'pt-BR' : LANG, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
          return '<div class="tc-card"><span class="tc-price">$' + esc(Math.round(f.price)) + '</span><b>' + (i + 1) + '. ' + esc(f.airline || '') + ' ' + esc(f.from) + ' → ' + esc(f.to) + '</b><div class="tc-sub">' + esc(when) + ' · ' + esc(st) + (f.ret ? ' · ↩ ' + esc(new Date(f.ret).toLocaleDateString(LANG === 'pt' ? 'pt-BR' : LANG, { month: 'short', day: 'numeric' })) : '') + (f.minutes ? ' · ' + Math.floor(f.minutes / 60) + 'h' + String(f.minutes % 60).padStart(2, '0') : '') + '</div><div class="tc-acts"><a href="' + esc(f.book) + '" target="_blank" rel="noopener">' + t('book') + ' →</a></div></div>';
        }).join(''));
      } else say(d.note || t('compare'));
      if (d.links && d.links.length) addHTML('<div class="tc-card"><b>' + t('compare') + '</b><div class="tc-acts">' + d.links.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join('') + '</div></div>');
      if (S.mode !== 'air' && d.note) {}
      addHTML(tripCard());
      say(t('again')); chips([['stay', t('stay'), stays], ['car', t('car'), cars], ['sights', t('sights'), function () { S.city = S.to; sights(); }], ['food', t('food'), function () { S.city = S.to; food(); }], menuChip()]);
    }).catch(function (e) { say(e.message); chips([menuChip()]); });
  }
  // stays and cars: prefilled official sites, the viewer books and pays there
  function dest() { return String(S.to || S.city || '').replace(/\s*\([A-Z]{3}\)\s*/, ' ').trim(); }
  function stays() {
    var c = dest(), a = S.dep || '', b = S.ret || '', e = encodeURIComponent(c);
    say(t('stayIntro'));
    var L = [['Airbnb', 'https://www.airbnb.com/s/' + e + '/homes' + (a ? '?checkin=' + a + (b ? '&checkout=' + b : '') : '')], ['VRBO', 'https://www.vrbo.com/search?destination=' + e + (a ? '&startDate=' + a + (b ? '&endDate=' + b : '') : '')],
      ['Booking.com', 'https://www.booking.com/searchresults.html?ss=' + e + (a ? '&checkin=' + a + (b ? '&checkout=' + b : '') : '')], ['Hotels.com', 'https://www.hotels.com/Hotel-Search?destination=' + e + (a ? '&startDate=' + a + (b ? '&endDate=' + b : '') : '')],
      ['Expedia', 'https://www.expedia.com/Hotel-Search?destination=' + e + (a ? '&startDate=' + a + (b ? '&endDate=' + b : '') : '')]];
    addHTML(linkCard('🏨 ' + c, L) + mapCard('safe neighborhoods hotels near restaurants and supermarkets ' + c));
    S.flow = S.flow || 'travel'; S.extra = 'stay'; addHTML(tripCard());
    say(t('selfbook')); chips([['car', t('car'), cars], ['food', t('food'), function () { S.city = c; food(); }], menuChip()]);
  }
  function cars() {
    var c = dest(), a = S.dep || '', b = S.ret || a, e = encodeURIComponent(c);
    say(t('carIntro'));
    var L = [['Kayak cars', 'https://www.kayak.com/cars/' + e + (a ? '/' + a + '/' + b : '')], ['Rentalcars.com', 'https://www.rentalcars.com/SearchResults.do?location=' + e], ['Turo', 'https://turo.com/us/en/search?location=' + e + (a ? '&startDate=' + a + '&endDate=' + b : '')],
      ['Enterprise', 'https://www.enterprise.com/en/car-rental-locations.html?q=' + e], ['Hertz', 'https://www.hertz.com/rentacar/location/search?query=' + e], ['Uber / Lyft', 'https://www.uber.com/global/en/r/cities/']];
    addHTML(linkCard('🚗 ' + c, L));
    S.extra = 'car'; addHTML(tripCard());
    say(t('selfbook')); chips([['stay', t('stay'), stays], ['food', t('food'), function () { S.city = c; food(); }], menuChip()]);
  }
  function linkCard(title, L) { return '<div class="tc-card"><b>' + esc(title) + '</b><div class="tc-acts">' + L.map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + ' →</a>'; }).join('') + '</div></div>'; }
  // trip code: a short id + link that reopens the same booking links later (nothing is stored on a server)
  function tripCard() {
    var keep = {}; ['flow', 'mode', 'from', 'to', 'round', 'dep', 'ret', 'stops', 'city', 'cuisine', 'purpose', 'etype', 'when', 'cost', 'fmt', 'comm', 'extra'].forEach(function (k) { if (S[k] !== undefined && S[k] !== '') keep[k] = S[k]; });
    var code = S.code || ('TH-' + Math.random().toString(36).slice(2, 7).toUpperCase()); S.code = code; keep.code = code; keep.lang = LANG;
    var url = location.origin + location.pathname + '#tania=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(keep)))));
    return '<div class="tc-card"><b>🔖 ' + t('code') + ': ' + esc(code) + '</b><div class="tc-sub">' + t('codeTip') + '</div><div class="tc-acts"><a href="' + esc(url) + '">' + esc(code) + ' →</a><a href="#" data-copy="' + esc(url) + '" onclick="try{navigator.clipboard.writeText(this.dataset.copy);this.textContent=\'' + t('copied') + '\'}catch(e){};return false">' + t('copy') + '</a></div></div>';
  }
  function reopen() {
    var m = location.hash.match(/tania=([^&]+)/); if (!m) return false;
    try { var k = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { return false; }
    if (k.lang && T[k.lang]) { LANG = k.lang; $('tc-lang').value = LANG; }
    openT(true); $('tc-log').innerHTML = ''; S = k;
    say(t('welcome') + ' ' + (k.code || '') + '.');
    if (k.extra === 'stay') return stays(), true;
    if (k.extra === 'car') return cars(), true;
    if (k.flow === 'travel' && k.from && k.to) return tSearch(), true;
    if (k.flow === 'food' && k.city) return fSearch(), true;
    if (k.flow === 'events' && k.city) return eSearch(), true;
    if (k.flow === 'community' && k.city && k.comm) return cSearch(), true;
    if (k.flow === 'sights' && k.city) return sights(), true;
    start(); return true;
  }
  window.addEventListener('hashchange', reopen);

  // restaurants
  function food() {
    S.flow = 'food';
    askCity(function () {
      say(t('cuisine'));
      chips(CUISINES.map(function (c) { return [c, c, function () { S.cuisine = c === 'Any' ? '' : c; fPurpose(); }]; }).concat([menuChip()]), { ph: 'Thai, vegan…', btn: 'OK', done: function (v) { S.cuisine = v; fPurpose(); } });
    });
  }
  function fPurpose() { say(t('purpose')); chips([['dine', t('dine'), function () { S.purpose = 'dine'; fSearch(); }], ['cater', t('cater'), function () { S.purpose = 'catering'; fSearch(); }], ['party', t('party'), function () { S.purpose = 'party'; fSearch(); }]]); }
  function fSearch() {
    say(t('looking')); chips([]);
    api({ action: 'places', kind: 'restaurant', city: S.city, cuisine: S.cuisine }).then(function (d) {
      if (d.error || !d.results || !d.results.length) { say(d.error || t('none')); return chips([['food', t('food'), function () { S.city = ''; food(); }], menuChip()]); }
      LAST = d; say(t('foodPlaces') + (S.cuisine ? ' (' + S.cuisine + ')' : '') + ':');
      addHTML(placeCards(d.results.slice(0, 5)));
      if (S.purpose === 'catering' || S.purpose === 'party') say(LANG === 'en' ? 'For catering or a party, call them to ask about menus, group size and dates. Many restaurants also cater even when it isn’t listed.' : t('resv')); else say(t('resv'));
      addHTML(mapCard((S.cuisine ? S.cuisine + ' ' : '') + 'restaurants in ' + S.city));
      addHTML(tripCard());
      addHTML(moreLinks((S.cuisine || 'restaurants') + ' restaurants ' + S.city));
      chips([['food', '🍽️ ' + t('food'), function () { food(); }], ['events', t('events'), function () { events(false); }], menuChip()]);
    }).catch(function (e) { say(e.message); chips([menuChip()]); });
  }
  function placeCards(list) {
    return list.map(function (p) {
      return '<div class="tc-card"><b>' + esc(p.name) + '</b><div class="tc-sub">' + esc([p.cuisine, p.address].filter(Boolean).join(' · ')) + '</div>' + (p.hours ? '<div class="tc-sub">🕒 ' + t('hours') + ': ' + esc(p.hours) + '</div>' : '') +
        '<div class="tc-acts">' + (p.kind === 'restaurant' || p.cuisine || S.flow === 'food' ? '<a href="https://www.opentable.com/s?term=' + encodeURIComponent(p.name + ' ' + (S.city || '')) + '" target="_blank" rel="noopener">📅 ' + t('reserve') + '</a>' : '') + (p.phone ? '<a href="tel:' + esc(p.phone.replace(/[^\d+]/g, '')) + '">📞 ' + t('call') + '</a>' : '') + (p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">🌐 ' + t('site') + '</a>' : '') + '<a href="' + esc(p.reviews) + '" target="_blank" rel="noopener">⭐ ' + t('reviews') + '</a><a href="' + esc(p.map) + '" target="_blank" rel="noopener">🗺️ ' + t('map') + '</a></div></div>';
    }).join('');
  }
  // every matching place pinned on a live map (Google Maps), so you see the whole area, not just the top few
  function mapCard(q) {
    return '<div class="tc-card"><b>🗺️ ' + esc(t('allmap')) + '</b><iframe title="Map" loading="lazy" style="width:100%;height:230px;border:0;border-radius:10px;margin-top:6px" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?output=embed&q=' + encodeURIComponent(q) + '"></iframe><div class="tc-acts"><a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener">' + esc(t('bigmap')) + ' →</a></div></div>';
  }
  function moreLinks(q) {
    return '<div class="tc-card"><b>' + t('more') + '</b><div class="tc-acts"><a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener">Google Maps</a><a href="https://www.yelp.com/search?find_desc=' + encodeURIComponent(q.replace(/ [^ ]+, ?[A-Z]{2}$/, '')) + '&find_loc=' + encodeURIComponent(S.city || '') + '" target="_blank" rel="noopener">Yelp</a><a href="https://www.opentable.com/s?term=' + encodeURIComponent(q) + '" target="_blank" rel="noopener">OpenTable (reservations)</a></div></div>';
  }
  // events / networking
  function events(net) {
    S.flow = 'events';
    askCity(function () {
      if (net) { S.etype = 'business networking'; return eCost(); }
      say(t('evtype'));
      chips(EVTYPES.map(function (x) { return [x, x, function () { S.etype = x; eCost(); }]; }).concat([menuChip()]), { ph: t('evph'), btn: 'OK', done: function (v) { S.etype = v; eCost(); } });
    });
  }
  function eCost() { say(t('cost')); chips([['a', t('any'), function () { S.cost = ''; eFormat(); }], ['f', t('free'), function () { S.cost = 'free'; eFormat(); }], ['p', t('paid'), function () { S.cost = 'paid'; eFormat(); }]]); }
  function eFormat() { say(t('format')); chips([['a', t('any'), function () { S.fmt = ''; eWhen(); }], ['i', t('inperson'), function () { S.fmt = 'in person'; eWhen(); }], ['o', t('online'), function () { S.fmt = 'online'; eWhen(); }]]); }
  function eWhen() { say(t('when')); chips([['w', t('thisweek'), function () { S.when = 'this week'; eSearch(); }], ['we', t('weekend'), function () { S.when = 'this weekend'; eSearch(); }], ['m', t('month'), function () { S.when = 'this month'; eSearch(); }]]); }
  function eSearch() {
    say(t('looking')); chips([]);
    api({ action: 'events', city: S.city, type: S.etype, when: S.when, cost: S.cost, format: S.fmt }).then(function (d) {
      LAST = d;
      if (d.results && d.results.length) {
        say(t('evIntro') + ':');
        addHTML(d.results.map(function (e) { return '<div class="tc-card"><b>' + esc(e.name) + '</b><div class="tc-sub">' + esc([e.date, e.venue, e.price, e.online ? '💻 Online' : '', e.source].filter(Boolean).join(' · ')) + '</div>' + (e.why ? '<div class="tc-sub">' + esc(e.why) + '</div>' : '') + '<div class="tc-acts"><a href="' + esc(e.url) + '" target="_blank" rel="noopener">🎟️ ' + t('tickets') + ' →</a></div></div>'; }).join(''));
      } else say(d.note || t('none'));
      if (d.links) addHTML('<div class="tc-card"><b>' + t('more') + '</b><div class="tc-acts">' + d.links.map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join('') + '</div></div>');
      addHTML(tripCard());
      say(t('again')); chips([['events', t('events'), function () { events(false); }], ['net', t('net'), function () { events(true); }], ['food', t('food'), food], menuChip()]);
    }).catch(function (e) { say(e.message); chips([menuChip()]); });
  }
  // things to do
  function sights() {
    S.flow = 'sights';
    askCity(function () {
      say(t('looking')); chips([]);
      api({ action: 'places', kind: 'sights', city: S.city }).then(function (d) {
        if (d.error || !d.results || !d.results.length) { say(d.error || t('none')); return chips([['sights', t('sights'), function () { S.city = ''; sights(); }], menuChip()]); }
        LAST = d; say(t('sightsIntro') + ':');
        addHTML(placeCards(d.results.slice(0, 6)));
        addHTML('<div class="tc-card"><b>' + t('more') + '</b><div class="tc-acts"><a href="https://en.wikivoyage.org/wiki/Special:Search?search=' + encodeURIComponent(S.city) + '" target="_blank" rel="noopener">Wikivoyage guide</a><a href="https://www.tripadvisor.com/Search?q=' + encodeURIComponent('things to do ' + S.city) + '" target="_blank" rel="noopener">Tripadvisor</a><a href="https://www.google.com/search?q=' + encodeURIComponent('top things to do in ' + S.city) + '" target="_blank" rel="noopener">Google</a></div></div>');
        say(t('again')); chips([['food', t('food'), food], ['events', t('events'), function () { events(false); }], ['community', t('community'), community], menuChip()]);
      }).catch(function (e) { say(e.message); chips([menuChip()]); });
    });
  }
  // community
  function community() {
    S.flow = 'community';
    askCity(function () {
      say(t('comm'));
      chips(COMMS.map(function (c) { return [c[0], c[1], function () { S.comm = c; cSearch(); }]; }).concat([menuChip()]));
    });
  }
  function cSearch() {
    say(t('looking')); chips([]);
    api({ action: 'places', kind: 'community', city: S.city, community: S.comm[0] }).then(function (d) {
      if (d.error || !d.results || !d.results.length) { say(d.error || t('none')); return chips([['community', t('community'), community], menuChip()]); }
      LAST = d; say(t('commIntro') + ' (' + S.comm[1].replace(/^\S+\s/, '') + '):');
      addHTML(placeCards(d.results.slice(0, 8)));
      var near = d.results.map(function (p) { return (p.address || '').split(',').pop(); }).filter(Boolean);
      if (near.length >= 3 && LANG === 'en') say('Tip: where several of these places are close together is usually where the community gathers. Tap Map on each to see the area.');
      addHTML(mapCard(S.comm[1].replace(/^\S+\s/, '') + ' restaurants and shops in ' + S.city));
      addHTML(moreLinks(S.comm[1].replace(/^\S+\s/, '') + ' ' + S.city));
      chips([['community', t('community'), community], ['food', t('food'), food], ['events', t('events'), function () { events(false); }], menuChip()]);
    }).catch(function (e) { say(e.message); chips([menuChip()]); });
  }

  /* ---------------- typing: shortcuts first, otherwise Tania's AI brain ---------------- */
  function typed(v) {
    say(v, 'me');
    var x = v.toLowerCase();
    if (/\b(fly|flight|airfare|fare|plane|ticket to|vuelo|voo|vol)\b/.test(x)) { S.mode = 'air'; S.flow = 'travel'; return tFrom(); }
    if (/\bamtrak|train|tren|trem\b/.test(x)) { S.mode = 'amtrak'; return tFrom(); }
    if (/\broad trip|drive to|driving\b/.test(x)) { S.mode = 'road'; return tFrom(); }
    if (/\bnetwork|chamber|alignable|linkedin event/.test(x)) return events(true);
    if (/\b(christian|church|gospel|worship|iglesia|igreja)\b/.test(x)) { S.etype = 'Christian / church'; return askCity(eCost); }
    if (/\b(restaurant|food|eat|dinner|lunch|cater|comida|restaurante|manger)\b/.test(x)) return food();
    if (/\b(event|concert|festival|movie|comedy|show|evento)\b/.test(x)) return events(false);
    if (/\b(things to do|visit|attraction|museum|sights|qué hacer|o que fazer)\b/.test(x)) return sights();
    if (/\b(haitian|brazilian|dominican|jamaican|community|comunidad|comunidade)\b/.test(x)) return community();
    say('…');
    var bubble = $('tc-log').lastChild;
    api({ action: 'chat', messages: HIST.slice(0, -1).concat([{ role: 'user', content: v }]), context: LAST ? { results: (LAST.results || []).slice(0, 6) } : null }).then(function (d) {
      bubble.remove(); HIST.pop(); say(d.text || t('again'));
      chips([['travel', t('travel'), travel], ['food', t('food'), food], ['events', t('events'), function () { events(false); }], menuChip()]);
    }).catch(function (e) { bubble.remove(); HIST.pop(); say(e.message); });
  }
  function pick() { start(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
