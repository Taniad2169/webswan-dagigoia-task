/*!
 * Travel Hub+ — lowest-price finder, city explorer and trip plan for travel-pwa.
 * By The WebSwan. Self-contained: injects its own styles and section above the link cards.
 * Live data: Wikivoyage (free travel guide) + Open-Meteo (free weather). No API keys.
 */
(function () {
  'use strict';
  if (window.__travelPlus) return; window.__travelPlus = true;

  var KIWI_AFF = 'travelpayoutsdeeplink_www.webswanmedianetwork.com_04b50ff9e8fc41388648bb3cd-701416';
  var LS = 'travelplus_v1';

  /* ---------------- airports (code, city, name) ---------------- */
  var AIRPORTS = [
    ['ATL','Atlanta','Hartsfield-Jackson'],['LAX','Los Angeles','LAX'],['ORD','Chicago','O\'Hare'],['MDW','Chicago','Midway'],['DFW','Dallas','Dallas/Fort Worth'],['DAL','Dallas','Love Field'],['DEN','Denver','Denver Intl'],['JFK','New York','JFK'],['LGA','New York','LaGuardia'],['EWR','Newark','Newark Liberty'],
    ['SFO','San Francisco','SFO'],['OAK','Oakland','Oakland Intl'],['SJC','San Jose','Mineta San Jose'],['SEA','Seattle','Seattle-Tacoma'],['LAS','Las Vegas','Harry Reid'],['MCO','Orlando','Orlando Intl'],['MIA','Miami','Miami Intl'],['FLL','Fort Lauderdale','Fort Lauderdale-Hollywood'],['PBI','West Palm Beach','Palm Beach Intl'],['TPA','Tampa','Tampa Intl'],
    ['CLT','Charlotte','Charlotte Douglas'],['PHX','Phoenix','Sky Harbor'],['IAH','Houston','Bush Intercontinental'],['HOU','Houston','Hobby'],['BOS','Boston','Logan'],['MSP','Minneapolis','Minneapolis-St Paul'],['DTW','Detroit','Detroit Metro'],['PHL','Philadelphia','Philadelphia Intl'],['BWI','Baltimore','BWI'],['DCA','Washington DC','Reagan National'],
    ['IAD','Washington DC','Dulles'],['SLC','Salt Lake City','Salt Lake City Intl'],['SAN','San Diego','San Diego Intl'],['SMF','Sacramento','Sacramento Intl'],['PDX','Portland','Portland Intl'],['AUS','Austin','Austin-Bergstrom'],['SAT','San Antonio','San Antonio Intl'],['BNA','Nashville','Nashville Intl'],['MSY','New Orleans','Louis Armstrong'],['RDU','Raleigh-Durham','RDU'],
    ['STL','St. Louis','St. Louis Lambert'],['MCI','Kansas City','Kansas City Intl'],['CLE','Cleveland','Hopkins'],['CMH','Columbus','John Glenn'],['IND','Indianapolis','Indianapolis Intl'],['PIT','Pittsburgh','Pittsburgh Intl'],['CVG','Cincinnati','CVG'],['MKE','Milwaukee','Mitchell'],['JAX','Jacksonville','Jacksonville Intl'],['RSW','Fort Myers','Southwest Florida Intl'],
    ['HNL','Honolulu','Daniel K. Inouye'],['OGG','Maui','Kahului'],['ANC','Anchorage','Ted Stevens'],['SNA','Orange County','John Wayne'],['BUR','Burbank','Hollywood Burbank'],['ONT','Ontario CA','Ontario Intl'],['LGB','Long Beach','Long Beach'],['ABQ','Albuquerque','Sunport'],['TUS','Tucson','Tucson Intl'],['ELP','El Paso','El Paso Intl'],
    ['OKC','Oklahoma City','Will Rogers'],['MEM','Memphis','Memphis Intl'],['BHM','Birmingham','Birmingham-Shuttlesworth'],['CHS','Charleston','Charleston Intl'],['SAV','Savannah','Savannah/Hilton Head'],['RIC','Richmond','Richmond Intl'],['ORF','Norfolk','Norfolk Intl'],['BDL','Hartford','Bradley'],['PVD','Providence','T.F. Green'],['BUF','Buffalo','Buffalo Niagara'],
    ['SJU','San Juan','Luis Muñoz Marín'],['YYZ','Toronto','Pearson'],['YUL','Montreal','Trudeau'],['YVR','Vancouver','Vancouver Intl'],['MEX','Mexico City','Benito Juárez'],['CUN','Cancún','Cancún Intl'],['GDL','Guadalajara','Guadalajara Intl'],['SJD','Los Cabos','Los Cabos Intl'],['PVR','Puerto Vallarta','Puerto Vallarta Intl'],
    ['PAP','Port-au-Prince','Toussaint Louverture'],['CAP','Cap-Haïtien','Cap-Haïtien Intl'],['SDQ','Santo Domingo','Las Américas'],['PUJ','Punta Cana','Punta Cana Intl'],['HAV','Havana','José Martí'],['MBJ','Montego Bay','Sangster'],['KIN','Kingston','Norman Manley'],['NAS','Nassau','Lynden Pindling'],['AUA','Aruba','Queen Beatrix'],['PTY','Panama City','Tocumen'],
    ['GRU','São Paulo','Guarulhos'],['CGH','São Paulo','Congonhas'],['GIG','Rio de Janeiro','Galeão'],['SDU','Rio de Janeiro','Santos Dumont'],['BSB','Brasília','Brasília Intl'],['SSA','Salvador','Salvador Intl'],['REC','Recife','Guararapes'],['FOR','Fortaleza','Pinto Martins'],['EZE','Buenos Aires','Ezeiza'],['SCL','Santiago','Arturo Merino Benítez'],
    ['BOG','Bogotá','El Dorado'],['MDE','Medellín','José María Córdova'],['LIM','Lima','Jorge Chávez'],['UIO','Quito','Mariscal Sucre'],['SJO','San José CR','Juan Santamaría'],['LHR','London','Heathrow'],['LGW','London','Gatwick'],['CDG','Paris','Charles de Gaulle'],['ORY','Paris','Orly'],['AMS','Amsterdam','Schiphol'],
    ['FRA','Frankfurt','Frankfurt'],['MUC','Munich','Munich'],['MAD','Madrid','Barajas'],['BCN','Barcelona','El Prat'],['LIS','Lisbon','Humberto Delgado'],['FCO','Rome','Fiumicino'],['MXP','Milan','Malpensa'],['ZRH','Zurich','Zurich'],['DUB','Dublin','Dublin'],['ATH','Athens','Athens Intl'],
    ['IST','Istanbul','Istanbul'],['DXB','Dubai','Dubai Intl'],['DOH','Doha','Hamad'],['CAI','Cairo','Cairo Intl'],['JNB','Johannesburg','O.R. Tambo'],['CPT','Cape Town','Cape Town Intl'],['LOS','Lagos','Murtala Muhammed'],['ACC','Accra','Kotoka'],['NRT','Tokyo','Narita'],['HND','Tokyo','Haneda'],
    ['ICN','Seoul','Incheon'],['PEK','Beijing','Capital'],['HKG','Hong Kong','Hong Kong Intl'],['SIN','Singapore','Changi'],['BKK','Bangkok','Suvarnabhumi'],['DEL','Delhi','Indira Gandhi'],['BOM','Mumbai','Chhatrapati Shivaji'],['SYD','Sydney','Kingsford Smith'],['MEL','Melbourne','Tullamarine'],['AKL','Auckland','Auckland']
  ];
  var US_STATES = { Alabama: 'al', Alaska: 'ak', Arizona: 'az', Arkansas: 'ar', California: 'ca', Colorado: 'co', Connecticut: 'ct', Delaware: 'de', 'District of Columbia': 'dc', Florida: 'fl', Georgia: 'ga', Hawaii: 'hi', Idaho: 'id', Illinois: 'il', Indiana: 'in', Iowa: 'ia', Kansas: 'ks', Kentucky: 'ky', Louisiana: 'la', Maine: 'me', Maryland: 'md', Massachusetts: 'ma', Michigan: 'mi', Minnesota: 'mn', Mississippi: 'ms', Missouri: 'mo', Montana: 'mt', Nebraska: 'ne', Nevada: 'nv', 'New Hampshire': 'nh', 'New Jersey': 'nj', 'New Mexico': 'nm', 'New York': 'ny', 'North Carolina': 'nc', 'North Dakota': 'nd', Ohio: 'oh', Oklahoma: 'ok', Oregon: 'or', Pennsylvania: 'pa', 'Rhode Island': 'ri', 'South Carolina': 'sc', 'South Dakota': 'sd', Tennessee: 'tn', Texas: 'tx', Utah: 'ut', Vermont: 'vt', Virginia: 'va', Washington: 'wa', 'West Virginia': 'wv', Wisconsin: 'wi', Wyoming: 'wy' };

  /* ---------------- helpers ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var enc = encodeURIComponent;
  function load() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function store(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function yymmdd(s) { return s ? s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10) : ''; }
  function nice(s) { try { return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return s; } }
  function toast(m) { var t = document.getElementById('toast'); if (t) { t.textContent = m; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 3000); } }
  // "Miami", "MIA" or "Miami (MIA)" -> {code, city}
  function resolve(v) {
    v = String(v || '').trim(); if (!v) return null;
    var m = v.match(/\(([A-Za-z]{3})\)\s*$/) || v.match(/^([A-Za-z]{3})$/);
    if (m) { var c = m[1].toUpperCase(); var a = AIRPORTS.find(function (x) { return x[0] === c; }); return { code: c, city: a ? a[1] : c }; }
    var low = v.toLowerCase();
    var hit = AIRPORTS.find(function (x) { return x[1].toLowerCase() === low; }) || AIRPORTS.find(function (x) { return x[1].toLowerCase().indexOf(low) === 0; });
    return hit ? { code: hit[0], city: hit[1] } : { code: '', city: v };
  }

  /* ---------------- styles ---------------- */
  var css = [
    '#travelPlus{background:rgba(255,255,255,.95);border-radius:clamp(15px,3vw,20px);box-shadow:0 10px 30px rgba(0,0,0,.15);padding:clamp(15px,3vw,25px);margin:0 0 30px;position:relative;z-index:2;color:#1d2b4a}',
    '#travelPlus *{box-sizing:border-box}',
    '#travelPlus h2{margin:0 0 4px;font-size:clamp(1.3rem,3vw,1.7rem);background:linear-gradient(45deg,#0b1d59,#0bb3c0);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}',
    '#travelPlus .tp-sub{margin:0 0 14px;color:#566;font-size:.95rem}',
    '.tp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}',
    '.tp-tab{border:2px solid #77c6e0;background:#fff;color:#0b1d59;border-radius:999px;padding:9px 16px;font-weight:700;font-size:.95rem;cursor:pointer}',
    '.tp-tab[aria-selected="true"]{background:linear-gradient(45deg,#0b1d59,#77c6e0);color:#fff;border-color:transparent}',
    '.tp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:10px}',
    '#travelPlus label{display:block;font-size:.8rem;font-weight:700;color:#0b1d59;margin-bottom:4px}',
    '#travelPlus input,#travelPlus select{width:100%;padding:11px 12px;border:2px solid #cfe9f2;border-radius:12px;font-size:1rem;background:#fff;color:#1d2b4a}',
    '#travelPlus input:focus,#travelPlus select:focus,#travelPlus button:focus-visible,#travelPlus a:focus-visible{outline:3px solid #ffbf47;outline-offset:2px;border-color:#0b1d59}',
    '.tp-modes{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
    '.tp-modes label{display:inline-flex!important;align-items:center;gap:6px;background:#eef9fc;border:1px solid #cfe9f2;border-radius:999px;padding:7px 12px;font-size:.9rem!important;cursor:pointer;margin:0!important}',
    '.tp-modes input{width:auto!important;margin:0}',
    '.tp-go{border:0;border-radius:999px;padding:13px 22px;font-weight:800;font-size:1rem;color:#fff;background:linear-gradient(45deg,#0b1d59,#0bb3c0);cursor:pointer;box-shadow:0 6px 18px rgba(11,29,89,.25)}',
    '.tp-go:hover{transform:translateY(-1px)}',
    '.tp-res{margin-top:18px}',
    '.tp-res h3{margin:16px 0 8px;font-size:1.1rem;color:#0b1d59}',
    '.tp-res .tp-note{font-size:.85rem;color:#566;margin:0 0 10px}',
    '.tp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:10px}',
    '.tp-card{display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fff;text-decoration:none;color:#1d2b4a;transition:transform .2s,box-shadow .2s}',
    '.tp-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.12)}',
    '.tp-card .ic{width:38px;height:38px;flex:none;border-radius:10px;display:grid;place-items:center;font-size:1.2rem;background:linear-gradient(45deg,#77c6e0,#0be0c0)}',
    '.tp-card b{display:block;font-size:.98rem}.tp-card small{color:#667;font-size:.8rem}',
    '.tp-card.best{border:2px solid #0bb3c0;background:#f1fdfb}',
    '.tp-badge{display:inline-block;font-size:.7rem;font-weight:800;color:#fff;background:#0bb3c0;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}',
    '.tp-weather{display:flex;gap:8px;flex-wrap:wrap}',
    '.tp-day{flex:1 1 90px;text-align:center;background:#eef9fc;border-radius:12px;padding:10px}',
    '.tp-day b{display:block}.tp-day span{font-size:1.6rem}',
    '.tp-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}',
    '.tp-list li{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:12px;padding:10px 12px;font-size:.93rem;line-height:1.45}',
    '.tp-list li b{color:#0b1d59}',
    '.tp-list li a{color:#0b6fa4;font-weight:700;margin-left:6px;font-size:.85rem}',
    '.tp-intro{background:#f6fbfd;border-left:4px solid #77c6e0;border-radius:10px;padding:12px;font-size:.95rem;line-height:1.55}',
    '.tp-check{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid rgba(0,0,0,.07);margin-bottom:8px}',
    '.tp-check input{width:22px!important;height:22px;margin-top:2px;flex:none}',
    '.tp-check.done span{text-decoration:line-through;color:#889}',
    '.tp-next{background:linear-gradient(45deg,#0b1d59,#0bb3c0);color:#fff;border-radius:14px;padding:14px;margin:10px 0 14px;font-weight:700}',
    '.tp-loading{color:#566;font-style:italic}',
    '.tp-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '@media(max-width:600px){.tp-tab{flex:1 1 auto;text-align:center}}'
  ].join('\n');

  /* ---------------- markup ---------------- */
  var opts = AIRPORTS.map(function (a) { return '<option value="' + esc(a[1] + ' (' + a[0] + ')') + '">' + esc(a[2]) + '</option>'; }).join('');
  var today = iso(new Date());
  var html =
    '<h2>💸 Find the lowest price &amp; explore</h2><p class="tp-sub">Compare flights, hotels, Airbnb and car rentals side by side, then discover events, restaurants and things to do anywhere.</p>' +
    '<div class="tp-tabs" role="tablist" aria-label="Travel tools">' +
      '<button class="tp-tab" role="tab" id="tpt-price" aria-controls="tpp-price" aria-selected="true">💸 Lowest prices</button>' +
      '<button class="tp-tab" role="tab" id="tpt-explore" aria-controls="tpp-explore" aria-selected="false">🗺️ Explore a city</button>' +
      '<button class="tp-tab" role="tab" id="tpt-plan" aria-controls="tpp-plan" aria-selected="false">✅ My trip plan</button>' +
    '</div>' +
    '<datalist id="tp-airports">' + opts + '</datalist>' +
    /* price panel */
    '<div id="tpp-price" role="tabpanel" aria-labelledby="tpt-price"><form id="tp-price-form" autocomplete="off">' +
      '<div class="tp-grid">' +
        '<div><label for="tp-from">From</label><input id="tp-from" list="tp-airports" placeholder="City or airport, e.g. Oakland (OAK)" required></div>' +
        '<div><label for="tp-to">To</label><input id="tp-to" list="tp-airports" placeholder="City or airport, e.g. Miami (MIA)" required></div>' +
        '<div><label for="tp-dep">Leave</label><input id="tp-dep" type="date" min="' + today + '" required></div>' +
        '<div><label for="tp-ret">Return (optional)</label><input id="tp-ret" type="date" min="' + today + '"></div>' +
        '<div><label for="tp-pax">Travelers</label><select id="tp-pax">' + [1, 2, 3, 4, 5, 6].map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<fieldset class="tp-modes" style="border:0;padding:0"><legend class="tp-sr">What to compare</legend>' +
        '<label><input type="checkbox" id="tp-m-fl" checked> ✈️ Flights</label><label><input type="checkbox" id="tp-m-ht" checked> 🏨 Hotels</label><label><input type="checkbox" id="tp-m-ab" checked> 🏠 Airbnb</label><label><input type="checkbox" id="tp-m-car" checked> 🚗 Car rental</label>' +
      '</fieldset>' +
      '<button class="tp-go" type="submit">🔎 Compare lowest prices</button>' +
    '</form><div class="tp-res" id="tp-price-res" aria-live="polite"></div></div>' +
    /* explore panel */
    '<div id="tpp-explore" role="tabpanel" aria-labelledby="tpt-explore" hidden><form id="tp-ex-form" autocomplete="off"><div class="tp-grid">' +
      '<div style="grid-column:span 2"><label for="tp-city">City</label><input id="tp-city" list="tp-cities" placeholder="e.g. Miami, Rio de Janeiro, Paris" required></div>' +
      '<div><label for="tp-exdate">When (optional)</label><input id="tp-exdate" type="date" min="' + today + '"></div>' +
      '</div><datalist id="tp-cities">' + Array.from(new Set(AIRPORTS.map(function (a) { return a[1]; }))).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<p style="margin:12px 0 0"><button class="tp-go" type="submit">🗺️ Show me events, food &amp; things to do</button></p></form>' +
      '<div class="tp-res" id="tp-ex-res" aria-live="polite"></div></div>' +
    /* plan panel */
    '<div id="tpp-plan" role="tabpanel" aria-labelledby="tpt-plan" hidden><div id="tp-plan"></div></div>';

  /* ---------------- price comparison ---------------- */
  function card(icon, name, sub, href, best) {
    return '<a class="tp-card' + (best ? ' best' : '') + '" href="' + esc(href) + '" target="_blank" rel="noopener"><span class="ic" aria-hidden="true">' + icon + '</span><span><b>' + esc(name) + (best ? '<span class="tp-badge">Start here</span>' : '') + '</b><small>' + esc(sub) + '</small></span></a>';
  }
  function priceResults(f) {
    var o = f.from, d = f.to, dep = f.dep, ret = f.ret, pax = f.pax, both = o.code && d.code;
    var stayIn = ret || addDays(dep, 3);
    var out = '';
    if (f.fl) {
      var gq = 'Flights from ' + (o.code || o.city) + ' to ' + (d.code || d.city) + ' on ' + dep + (ret ? ' through ' + ret : ' one way') + (pax > 1 ? ' for ' + pax + ' adults' : '');
      out += '<h3>✈️ Flights ' + esc(o.city) + ' → ' + esc(d.city) + ' · ' + nice(dep) + (ret ? ' – ' + nice(ret) : ' (one way)') + '</h3>' +
        '<p class="tp-note">Each site opens already searched and sorted by lowest price. Google Flights and Kayak scan hundreds of airlines; Skiplagged finds “hidden city” deals.</p><div class="tp-cards">' +
        card('🟦', 'Google Flights', 'Cheapest across airlines + price graph', 'https://www.google.com/travel/flights?q=' + enc(gq) + '&curr=USD', true) +
        (both ? card('🟧', 'Kayak', 'Sorted by price', 'https://www.kayak.com/flights/' + o.code + '-' + d.code + '/' + dep + (ret ? '/' + ret : '') + (pax > 1 ? '/' + pax + 'adults' : '') + '?sort=price_a') : '') +
        (both ? card('🔷', 'Skyscanner', 'Cheapest option first', 'https://www.skyscanner.com/transport/flights/' + o.code.toLowerCase() + '/' + d.code.toLowerCase() + '/' + yymmdd(dep) + '/' + (ret ? yymmdd(ret) + '/' : '') + '?adultsv2=' + pax + '&rtn=' + (ret ? 1 : 0) + '&sortby=price') : '') +
        (both ? card('🟢', 'Kiwi.com', 'Mixes airlines for lower fares', 'https://www.kiwi.com/deep?affilid=' + enc(KIWI_AFF) + '&from=' + o.code + '&to=' + d.code + '&departure=' + dep + (ret ? '&return=' + ret : '') + '&adults=' + pax + '&sortBy=price') : '') +
        (both ? card('🎯', 'Skiplagged', 'Hidden-city & cheap fares', 'https://skiplagged.com/flights/' + o.code + '/' + d.code + '/' + dep + (ret ? '/' + ret : '')) : '') +
        (both ? card('🟣', 'Momondo', 'Sorted by price', 'https://www.momondo.com/flight-search/' + o.code + '-' + d.code + '/' + dep + (ret ? '/' + ret : '') + (pax > 1 ? '/' + pax + 'adults' : '') + '?sort=price_a') : '') +
        '</div>';
      if (both) {
        out += '<h3>📅 Flexible dates? Find the cheapest day</h3><div class="tp-cards">' +
          card('📊', 'Skyscanner whole month', 'See prices for every day', 'https://www.skyscanner.com/transport/flights/' + o.code.toLowerCase() + '/' + d.code.toLowerCase() + '/?oym=' + yymmdd(dep).slice(0, 4) + (ret ? '&iym=' + yymmdd(ret).slice(0, 4) : '') + '&adultsv2=' + pax + '&rtn=' + (ret ? 1 : 0)) +
          card('🗓️', 'Google Flights date grid', 'Tap “Date grid” to compare days', 'https://www.google.com/travel/flights?q=' + enc('Flights from ' + o.code + ' to ' + d.code + ' in ' + new Date(dep + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))) +
          card('🌍', 'Google Explore', 'Cheapest places to fly from ' + o.city, 'https://www.google.com/travel/explore?q=' + enc('flights from ' + o.code)) +
          '</div>';
      } else {
        out += '<p class="tp-note">Tip: pick an airport from the list (like “Miami (MIA)”) to unlock Kayak, Skyscanner, Kiwi, Skiplagged and Momondo.</p>';
      }
    }
    var city = d.city;
    if (f.ht) {
      out += '<h3>🏨 Hotels in ' + esc(city) + ' · ' + nice(dep) + ' – ' + nice(stayIn) + '</h3><div class="tp-cards">' +
        card('🟦', 'Google Hotels', 'Compares Booking, Expedia, Hotels.com & more', 'https://www.google.com/travel/search?q=' + enc('hotels in ' + city + ' ' + dep + ' to ' + stayIn), true) +
        card('🅱️', 'Booking.com', 'Sorted by lowest price', 'https://www.booking.com/searchresults.html?ss=' + enc(city) + '&checkin=' + dep + '&checkout=' + stayIn + '&group_adults=' + pax + '&no_rooms=1&order=price') +
        card('🏨', 'Hotels.com', 'Lowest price first', 'https://www.hotels.com/Hotel-Search?destination=' + enc(city) + '&startDate=' + dep + '&endDate=' + stayIn + '&adults=' + pax + '&sort=PRICE_LOW_TO_HIGH') +
        card('🟧', 'Kayak Hotels', 'Sorted by price', 'https://www.kayak.com/hotels/' + enc(city) + '/' + dep + '/' + stayIn + '/' + pax + 'adults?sort=price_a') +
        card('🅰️', 'Agoda', 'Great deals worldwide', 'https://www.agoda.com/search?textToSearch=' + enc(city) + '&checkIn=' + dep + '&checkOut=' + stayIn + '&adults=' + pax + '&rooms=1') +
        '</div>';
    }
    if (f.ab) {
      out += '<h3>🏠 Airbnb &amp; vacation rentals in ' + esc(city) + '</h3><div class="tp-cards">' +
        card('🏠', 'Airbnb', 'Homes for your dates', 'https://www.airbnb.com/s/' + enc(city) + '/homes?checkin=' + dep + '&checkout=' + stayIn + '&adults=' + pax, true) +
        card('🏡', 'Vrbo', 'Whole homes & condos', 'https://www.vrbo.com/search?destination=' + enc(city) + '&startDate=' + dep + '&endDate=' + stayIn + '&adults=' + pax + '&sort=PRICE_LOW_TO_HIGH') +
        card('🅱️', 'Booking.com apartments', 'Apartments & homes', 'https://www.booking.com/searchresults.html?ss=' + enc(city) + '&checkin=' + dep + '&checkout=' + stayIn + '&group_adults=' + pax + '&nflt=ht_id%3D201&order=price') +
        '</div>';
    }
    if (f.car) {
      var where = d.code || city;
      out += '<h3>🚗 Car rental at ' + esc(d.code ? city + ' (' + d.code + ')' : city) + ' · ' + nice(dep) + ' – ' + nice(stayIn) + '</h3><div class="tp-cards">' +
        card('🟧', 'Kayak Cars', 'Compares all rental companies, cheapest first', 'https://www.kayak.com/cars/' + enc(where) + '/' + dep + '/' + stayIn + '?sort=price_a', true) +
        card('🔷', 'Skyscanner Car Hire', 'Compare rental prices', 'https://www.skyscanner.com/carhire/results/' + enc(where) + '/' + enc(where) + '/' + dep + 'T10:00/' + stayIn + 'T10:00/30') +
        card('🟦', 'Google: car rentals', 'Local rental companies & reviews', 'https://www.google.com/search?q=' + enc('car rental ' + (d.code ? d.code + ' airport' : city))) +
        card('🚙', 'Turo', 'Cars from local owners', 'https://turo.com/us/en/search?location=' + enc(city) + '&startDate=' + dep + '&endDate=' + stayIn) +
        '</div>';
    }
    out += '<p class="tp-note" style="margin-top:14px">Prices change by the minute and are shown on each site. Booking and payment always stay with you.</p>' +
      '<p><button class="tp-go" type="button" id="tp-add-plan">✅ Start a trip plan for ' + esc(city) + '</button> <button class="tp-go" type="button" id="tp-explore-city" style="background:linear-gradient(45deg,#0bb3c0,#77c6e0)">🗺️ Explore ' + esc(city) + '</button></p>';
    return out;
  }

  /* ---------------- explore a city (live) ---------------- */
  var WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'] };
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var WV = 'https://en.wikivoyage.org/w/api.php?format=json&origin=*&redirects=1&action=parse&page=';
  function listings(html, max) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
    doc.querySelectorAll('.vcard, li').forEach(function (el) {
      if (out.length >= max) return;
      if (el.tagName === 'LI' && el.querySelector('.vcard')) return;
      var name = el.querySelector('.listing-name, .fn');
      var nm = name ? name.textContent.trim() : '';
      if (!nm && el.tagName === 'LI') { var b = el.querySelector('b'); nm = b ? b.textContent.trim() : ''; }
      if (!nm) return;
      var desc = (el.querySelector('.listing-content') || el).textContent.replace(/\s+/g, ' ').replace(nm, '').trim();
      desc = desc.replace(/^[\s,.:–-]+/, '').replace(/\(\s*updated\s+[^)]*\)/i, '').slice(0, 220);
      if (out.some(function (x) { return x.name === nm; })) return;
      out.push({ name: nm, desc: desc });
    });
    return out;
  }
  function explore(cityRaw, date) {
    var box = $('#tp-ex-res'), city = String(cityRaw || '').replace(/\s*\([A-Z]{3}\)\s*$/, '').trim();
    if (!city) return;
    var q = enc(city), when = date ? ' ' + new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
    box.innerHTML = '<p class="tp-loading">Looking up ' + esc(city) + '…</p>';
    var weather = getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + q).then(function (g) {
      var p = g.results && g.results[0]; if (!p) return null;
      return getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=5').then(function (w) { return { place: p, daily: w.daily }; });
    }).catch(function () { return null; });
    var guide = getJSON(WV + q + '&prop=sections|text&section=0').then(function (s0) {
      var intro = new DOMParser().parseFromString(s0.parse.text['*'], 'text/html');
      intro.querySelectorAll('table,style,.pagebanner,.noprint,sup,.mw-empty-elt').forEach(function (e) { e.remove(); });
      var para = Array.from(intro.querySelectorAll('p')).map(function (p) { return p.textContent.trim(); }).filter(Boolean).slice(0, 2).join(' ');
      return getJSON(WV + q + '&prop=sections').then(function (s) {
        var secs = s.parse.sections, title = s.parse.title, want = { See: 8, Do: 8, Events: 6, Eat: 8, Drink: 5 };
        var jobs = Object.keys(want).map(function (k) {
          var sec = secs.find(function (x) { return x.line === k && x.toclevel <= 2; });
          if (!sec) return Promise.resolve([k, []]);
          return getJSON(WV + enc(title) + '&prop=text&section=' + sec.index).then(function (r) { return [k, listings(r.parse.text['*'], want[k])]; }).catch(function () { return [k, []]; });
        });
        return Promise.all(jobs).then(function (res) { var o = { title: title, intro: para }; res.forEach(function (r) { o[r[0]] = r[1]; }); return o; });
      });
    }).catch(function () { return null; });
    Promise.all([weather, guide]).then(function (r) {
      var w = r[0], g = r[1], st = w && w.place && w.place.country_code === 'US' && US_STATES[w.place.admin1];
      var region = w && w.place ? [w.place.admin1, w.place.country].filter(Boolean).join(', ') : '';
      var o = '<h3>📍 ' + esc(g ? g.title : city) + (region ? ' <small style="color:#667;font-weight:500">· ' + esc(region) + '</small>' : '') + '</h3>';
      if (g && g.intro) o += '<div class="tp-intro">' + esc(g.intro.slice(0, 600)) + (g.intro.length > 600 ? '…' : '') + '</div>';
      if (w && w.daily) {
        o += '<h3>🌤️ Weather, next 5 days</h3><div class="tp-weather">' + w.daily.time.map(function (t, i) { var c = WX[w.daily.weathercode[i]] || ['🌡️', '']; return '<div class="tp-day"><b>' + new Date(t + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) + '</b><span aria-hidden="true">' + c[0] + '</span><div>' + Math.round(w.daily.temperature_2m_max[i]) + '° / ' + Math.round(w.daily.temperature_2m_min[i]) + '°F</div><small>' + c[1] + '</small></div>'; }).join('') + '</div>';
      }
      function block(title, icon, items, links) {
        var s = '<h3>' + icon + ' ' + title + '</h3>';
        if (items && items.length) s += '<ul class="tp-list">' + items.map(function (x) { return '<li><b>' + esc(x.name) + '</b>' + (x.desc ? ' — ' + esc(x.desc) : '') + '<a href="https://www.google.com/maps/search/' + enc(x.name + ' ' + city) + '" target="_blank" rel="noopener">Map ↗</a></li>'; }).join('') + '</ul>';
        s += '<div class="tp-cards" style="margin-top:10px">' + links.join('') + '</div>';
        return s;
      }
      o += block('Events' + (when ? ' around' + esc(when) : ' & what’s happening'), '🎟️', g && g.Events, [
        card('📅', 'Google Events', 'Concerts, festivals, shows', 'https://www.google.com/search?ibp=htl;events&q=' + enc('events in ' + city + when), true),
        card('🎫', 'Ticketmaster', 'Concerts, sports & theater', 'https://www.ticketmaster.com/search?q=' + q),
        card('🟠', 'Eventbrite', 'Local events & classes', st ? 'https://www.eventbrite.com/d/' + st + '--' + city.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/all-events/' : 'https://www.eventbrite.com/d/online/' + q + '/')
      ]);
      o += block('Good restaurants', '🍽️', (g && g.Eat || []).concat((g && g.Drink) || []).slice(0, 10), [
        card('📍', 'Google Maps: best restaurants', 'Top rated near you', 'https://www.google.com/maps/search/' + enc('best restaurants in ' + city), true),
        card('🔴', 'Yelp', 'Reviews & photos', 'https://www.yelp.com/search?find_desc=Restaurants&find_loc=' + q + '&sortby=rating'),
        card('🍷', 'OpenTable', 'Book a table', 'https://www.opentable.com/s?term=' + q),
        card('🦉', 'Tripadvisor restaurants', 'Traveler favorites', 'https://www.tripadvisor.com/Search?q=' + enc(city + ' restaurants'))
      ]);
      o += block('Things to do', '🎡', (g && g.See || []).concat((g && g.Do) || []).slice(0, 12), [
        card('📍', 'Google Maps: things to do', 'Attractions on the map', 'https://www.google.com/maps/search/' + enc('things to do in ' + city), true),
        card('🦉', 'Tripadvisor', 'Top attractions', 'https://www.tripadvisor.com/Search?q=' + enc(city + ' things to do')),
        card('🎒', 'Viator tours', 'Tours & experiences', 'https://www.viator.com/searchResults/all?text=' + q),
        card('🧭', 'GetYourGuide', 'Tickets & activities', 'https://www.getyourguide.com/s/?q=' + q)
      ]);
      o += '<p class="tp-note" style="margin-top:12px">' + (g ? 'Guide highlights from <a href="https://en.wikivoyage.org/wiki/' + enc(g.title) + '" target="_blank" rel="noopener">Wikivoyage</a> (free travel guide, CC BY-SA). ' : 'No free guide found for this city yet, so here are the best places to look. ') + 'Weather by Open-Meteo.</p>';
      box.innerHTML = o;
    });
  }

  /* ---------------- trip plan (critical path) ---------------- */
  var STEPS = [
    ['flight', '✈️ Book your flight', 'Compare in “Lowest prices”, then book the best fare.'],
    ['stay', '🏨 Book where you’ll stay', 'Hotel or Airbnb near what you want to see.'],
    ['car', '🚗 Ground transport', 'Rental car, ride share or airport shuttle.'],
    ['docs', '🛂 Documents', 'ID or passport valid 6+ months; check visa rules for your destination.'],
    ['money', '💳 Money & phone', 'Tell your bank, check roaming or get an eSIM.'],
    ['fun', '🎟️ Plan activities & dinners', 'Use “Explore a city” and book the must-do’s.'],
    ['pack', '🧳 Pack & check in', 'Online check-in opens 24 hours before your flight.']
  ];
  function renderPlan() {
    var s = load(), p = s.plan, el = $('#tp-plan');
    if (!p) { el.innerHTML = '<p class="tp-sub">No trip yet. Compare prices first, then tap <b>“Start a trip plan”</b>, or start one here:</p><form id="tp-plan-new" class="tp-grid"><div><label for="tp-pn-city">Where to?</label><input id="tp-pn-city" required placeholder="e.g. Miami"></div><div><label for="tp-pn-date">Leaving</label><input id="tp-pn-date" type="date" min="' + today + '"></div><div style="align-self:end"><button class="tp-go" type="submit">Start plan</button></div></form>'; $('#tp-plan-new').onsubmit = function (e) { e.preventDefault(); newPlan($('#tp-pn-city').value, $('#tp-pn-date').value); }; return; }
    var next = STEPS.find(function (x) { return !p.done[x[0]]; });
    var days = p.date ? Math.ceil((new Date(p.date + 'T12:00:00') - new Date()) / 864e5) : null;
    el.innerHTML = '<h3 style="margin:0 0 4px;color:#0b1d59">🧳 Trip to ' + esc(p.city) + (p.date ? ' · ' + nice(p.date) : '') + '</h3>' +
      (days != null ? '<p class="tp-sub">' + (days > 0 ? days + ' day' + (days === 1 ? '' : 's') + ' to go' : days === 0 ? 'Today’s the day! ✈️' : 'Trip date has passed') + '</p>' : '') +
      '<div class="tp-next">' + (next ? 'Next action: ' + esc(next[1].replace(/^\S+\s/, '')) + ' — ' + esc(next[2]) : '🎉 Everything’s ready. Enjoy your trip!') + '</div>' +
      STEPS.map(function (x) { var d = !!p.done[x[0]]; return '<label class="tp-check' + (d ? ' done' : '') + '"><input type="checkbox" data-step="' + x[0] + '"' + (d ? ' checked' : '') + '><span><b>' + esc(x[1]) + '</b><br><small>' + esc(x[2]) + '</small></span></label>'; }).join('') +
      '<p><button class="tp-go" type="button" id="tp-plan-ex" style="background:linear-gradient(45deg,#0bb3c0,#77c6e0)">🗺️ Explore ' + esc(p.city) + '</button> <button class="tp-go" type="button" id="tp-plan-clear" style="background:#fff;color:#a12c2c;border:2px solid #f0c9c9;box-shadow:none">Clear plan</button></p>';
    el.querySelectorAll('input[data-step]').forEach(function (cb) { cb.onchange = function () { var s2 = load(); s2.plan.done[cb.dataset.step] = cb.checked; store(s2); renderPlan(); }; });
    $('#tp-plan-clear').onclick = function () { if (confirm('Clear this trip plan?')) { var s2 = load(); delete s2.plan; store(s2); renderPlan(); } };
    $('#tp-plan-ex').onclick = function () { tab('explore'); $('#tp-city').value = p.city; explore(p.city, p.date); };
  }
  function newPlan(city, date) { var s = load(); s.plan = { city: String(city).replace(/\s*\([A-Z]{3}\)\s*$/, ''), date: date || '', done: {} }; store(s); tab('plan'); renderPlan(); toast('Trip plan started 🧳'); }

  /* ---------------- tabs + wiring ---------------- */
  function tab(name) {
    ['price', 'explore', 'plan'].forEach(function (n) { var on = n === name; $('#tpt-' + n).setAttribute('aria-selected', String(on)); $('#tpp-' + n).hidden = !on; });
    if (name === 'plan') renderPlan();
  }
  function mount() {
    if (document.getElementById('travelPlus')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var sec = document.createElement('section'); sec.id = 'travelPlus'; sec.setAttribute('aria-label', 'Lowest price finder and city explorer'); sec.innerHTML = html;
    var grid = document.getElementById('categoryGrid'), main = document.getElementById('main-content') || document.querySelector('main') || document.body;
    if (grid && grid.parentNode) grid.parentNode.insertBefore(sec, grid); else main.insertBefore(sec, main.firstChild);
    ['price', 'explore', 'plan'].forEach(function (n) { $('#tpt-' + n).onclick = function () { tab(n); }; });
    $('#travelPlus .tp-tabs').addEventListener('keydown', function (e) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var t = Array.from(document.querySelectorAll('.tp-tab')), i = t.indexOf(document.activeElement); if (i < 0) return; var j = (i + (e.key === 'ArrowRight' ? 1 : t.length - 1)) % t.length; t[j].focus(); t[j].click(); });
    var s = load();
    if (s.last) { ['from', 'to'].forEach(function (k) { if (s.last[k]) $('#tp-' + k).value = s.last[k]; }); }
    $('#tp-dep').addEventListener('change', function () { $('#tp-ret').min = $('#tp-dep').value; if ($('#tp-ret').value && $('#tp-ret').value < $('#tp-dep').value) $('#tp-ret').value = ''; });
    $('#tp-price-form').onsubmit = function (e) {
      e.preventDefault();
      var from = resolve($('#tp-from').value), to = resolve($('#tp-to').value), dep = $('#tp-dep').value, ret = $('#tp-ret').value;
      if (!from || !to || !dep) return;
      if (ret && ret < dep) { toast('Return date must be after you leave.'); return; }
      var f = { from: from, to: to, dep: dep, ret: ret, pax: Number($('#tp-pax').value) || 1, fl: $('#tp-m-fl').checked, ht: $('#tp-m-ht').checked, ab: $('#tp-m-ab').checked, car: $('#tp-m-car').checked };
      if (!f.fl && !f.ht && !f.ab && !f.car) { toast('Pick at least one: flights, hotels, Airbnb or cars.'); return; }
      var s2 = load(); s2.last = { from: $('#tp-from').value, to: $('#tp-to').value }; store(s2);
      var res = $('#tp-price-res'); res.innerHTML = priceResults(f); res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#tp-add-plan').onclick = function () { newPlan(to.city, dep); };
      $('#tp-explore-city').onclick = function () { tab('explore'); $('#tp-city').value = to.city; $('#tp-exdate').value = dep; explore(to.city, dep); };
    };
    $('#tp-ex-form').onsubmit = function (e) { e.preventDefault(); explore($('#tp-city').value, $('#tp-exdate').value); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
