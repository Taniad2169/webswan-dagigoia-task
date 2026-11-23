/* Rachel Bennet for WebSwan Media Network (online advertising for doctors & attorneys). */
(function () {
  var R = '<a href="tel:+13162486839">(316) 248-6839</a>', P = '<a href="tel:+14158770687">(415) 877-0687</a>';
  var SEB = '<a href="tel:+12295446718">(229) 544-6718</a>'; // Sebastien McIntosh, Marketing Operations Director -- packages/pricing/advertising. R (Rachel) is appointment-booking only now.
  var ADS = '<a href="https://ads.webswanmedianetwork.com/" target="_blank" rel="noopener">ads.webswanmedianetwork.com</a>';
  window.RACHEL_CONFIG = {
    name: 'Rachel Bennet',
    brand: 'WebSwan Media Network',
    subtitle: 'Advertising assistant · WebSwan Media Network',
    image: 'https://taniad2169.github.io/webswan-dagigoia-task/rachel-bot/rachel-wsmn.jpg',
    color: '#1b70c2', dark: '#062743',
    launchText: 'Ask Rachel: advertising',
    greeting: 'Hi, I’m <b>Rachel Bennet</b> with <b>WebSwan Media Network</b>. 👋 We help <b>doctors and attorneys</b> get found online. Ask me how advertising works, what it costs or how to join.',
    quick: ['What is WebSwan Media Network?', 'Who can advertise?', 'How much does it cost?', 'Is there a contract?', 'What do I get?', 'How do I join?', 'AI receptionist for my practice', 'Talk to someone'],
    fallback: 'Hmm 🤔 I don’t know the answer to that question, but you can call the number on the screen to ask Tania: <a href="tel:+14158770687"><b>📞 (415) 877-0687</b></a>',
    kb: [
      { k: ['what is', 'media network', 'wsmn', 'about', 'directory', 'platform'], a: '<b>WebSwan Media Network (WSMN)</b>, powered by The WebSwan, is an online advertising platform and professional directory for <b>doctors and attorneys</b>. Your hosted WSMN profile shows who you are, your specialties, your service area and how patients or clients can reach you, on a site built to rank on Google and in AI search. See it at ' + ADS + '.' },
      { k: ['who can', 'eligible', 'qualify', 'doctor', 'attorney', 'lawyer', 'chiropractor', 'dentist', 'surgeon', 'hairdresser', 'mechanic', 'trades'], a: 'WSMN is <b>only for doctors and attorneys</b>: medical professionals such as physicians, surgeons, chiropractors and dentists, and legal professionals such as attorneys and law firms. That focus keeps the network trusted and relevant for patients and clients.' },
      { k: ['price', 'pricing', 'cost', 'how much', 'fee', 'setup', 'annual', 'monthly', 'pay'], a: 'For doctors and attorneys, WSMN membership is simple and transparent: <b>$289 a year</b>, no setup fee, no contract, renews every 12 months. 🎉 That\'s our <b>holiday price, good through December 31, 2026</b> — lock it in now and you keep $289/year for life, even after pricing changes in January. Ready to lock it in? Call Sebastien at ' + SEB + ' or book your appointment with Tania.' },
      { k: ['contract', 'cancel', 'commitment', 'renew', 'refund'], a: '<b>No contract.</b> Your listing renews every 12 months. If you decide to cancel after the 12 months, you owe nothing further. The setup and annual fee are paid upfront and are non-refundable.' },
      { k: ['what do i get', 'include', 'benefit', 'listing', 'profile', 'features', 'why'], a: 'With WSMN you get:<ul><li>A professional profile with your specialties, service area and contact links</li><li>Placement in a nationwide directory for doctors and attorneys</li><li>SEO and AI-search friendly pages built by an award-winning, certified web developer</li><li>A link you can share anywhere</li></ul>' },
      { k: ['join', 'sign up', 'get started', 'apply', 'start', 'how do i'], a: 'Joining is easy: fill out the short form at ' + ADS + ', or call Sebastien at ' + SEB + '. We’ll confirm your eligibility, set up your profile and send it to you for approval.' },
      { k: ['receptionist', 'answer calls', 'missed call', 'after hours', '24/7', 'virtual assistant', 'rachel', 'swandesk', 'assistant', 'social media'], a: 'I can also answer your practice’s phones! <b>SwanDesk AI</b> gives you a 24/7 AI receptionist trained on your practice, and it never takes sensitive health or case details by phone. We also offer Eva, an executive assistant, and Tatiana, a social media manager — individually or all together. It\'s affordable, and Sebastien will give you the exact number once he knows what your practice needs. Try the receptionist <b>complimentary for one full week</b>: call ' + SEB + '.' },
      { k: ['seo', 'google', 'rank', 'found', 'visibility', 'ai search'], a: 'WSMN profiles are built for visibility on <b>Google and AI search</b> with clear, structured information about your practice. No one can guarantee rankings, but a strong, consistent profile on a focused professional network helps people find you.' },
      { k: ['website', 'my own site', 'web design'], a: 'Need a website too? That’s <b>The WebSwan</b>, our sister brand: custom websites, landing pages and phone apps. Doctors and attorneys with a WebSwan Premium website pay <b>no WSMN setup fee</b>. Call or text ' + P + '.' },
      { k: ['contact', 'call', 'talk', 'someone', 'human', 'phone', 'email', 'text'], a: 'Talk to us:<ul><li>📣 Sebastien (packages &amp; advertising): ' + SEB + '</li><li>📅 Rachel (appointments only): ' + R + '</li><li>📱 Call or text Tania: ' + P + '</li><li>✉️ <a href="mailto:designs@thewebswan.com">designs@thewebswan.com</a></li></ul>Hours: Monday to Friday, 10 AM to 8 PM.' },
      { k: ['no website', 'don\'t have a website', 'dont have a website', 'need a website', 'cheap website', 'low cost', 'keep cost low', 'keep costs low', 'tight budget', 'low budget', 'can\'t afford', 'cant afford', 'outdated website', 'old site', 'redesign'], a: 'If you don\'t have a website yet, or yours is outdated and you\'ve been thinking about a redesign, and you want to keep your cost low, we have an <b>$899 package</b> we can discuss with you. Call <b>Sebastien McIntosh</b> and ask him how it works, or fill out the form on the banner above and we\'ll get back to you. Our goal is to give you professional visibility: ' + SEB + '.' },
      { k: ['hi', 'hello', 'hey'], a: 'Hi! 👋 Are you a doctor or attorney looking to advertise online? Ask me how WSMN works, what it costs or how to join.' },
      { k: ['how are you', 'how r u', 'hows it going', 'how\'s it going', 'how are u', 'how you doing', 'how have you been', 'what\'s up', 'whats up'], a: 'I’m doing great, thank you for asking! 😊 And you? Whenever you’re ready — are you a doctor or attorney looking to advertise online? Ask me how WSMN works, what it costs or how to join.' },
      { k: ['i am good', 'i\'m good', 'im good', 'doing good', 'doing well', 'i am fine', 'i\'m fine', 'im fine', 'pretty good', 'not bad', 'good too', 'great thanks', 'i\'m great', 'im great', 'all good', 'same here'], a: 'Glad to hear it! 😊 Are you a doctor or attorney looking to advertise online? Ask me how WSMN works, what it costs or how to join.' },
      { k: ['thank you', 'thanks', 'appreciate it'], a: 'You’re so welcome! 😊 Anything else I can help with?' },
      { k: ['not ready', 'maybe later', 'catch up later', 'talk later', 'come back later', 'just looking', 'just browsing', 'no thanks for now'], a: 'That’s totally fine! 😊 I’ll be right here whenever you’re ready — take your time.' },
      { k: ['bye', 'goodbye', 'see you', 'see ya', 'take care', 'gotta go', 'got to go'], a: 'Take care! 👋 Come back anytime — I’m here 24/7.' }
    ]
  };
})();

/* Rachel offers an appointment with Tania, then a short form that emails Tania (Formspree). */
if (window.RACHEL_CONFIG) window.RACHEL_CONFIG.booking = { endpoint: 'https://formspree.io/f/xgoajlpg', brand: 'WebSwan Media Network', after: 3 };

/* "Take me there" announcement banner -- the $899/$499 Managed Website Program banner moved HERE
   from thewebswan.com, Nov 20 (Tania's call). Opens the form page, not a direct call. */
window.WS_PROMO = {"text": "Need a website but don't have the budget? This package is for you.", "link": "https://taniad2169.github.io/webswan-dagigoia-task/take-me-there/website-package/", "cta": "Take me there"};
(function () { var s = document.createElement('script'); s.src = 'https://taniad2169.github.io/webswan-dagigoia-task/rachel-bot/promo-banner.js'; s.defer = true; document.head.appendChild(s); })();

/* Swan Video: Tania's video bubble on this site (rachel-bot.js loads it). */
if (window.RACHEL_CONFIG) window.RACHEL_CONFIG.videoSite = 'wsmn';
