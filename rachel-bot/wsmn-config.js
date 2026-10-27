/* Rachel Bennet for WebSwan Media Network (online advertising for doctors & attorneys). */
(function () {
  var R = '<a href="tel:+13476467086">(347) 646-7086</a>', P = '<a href="tel:+14158770687">(415) 877-0687</a>';
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
      { k: ['price', 'pricing', 'cost', 'how much', 'fee', 'setup', 'annual', 'monthly', 'pay'], a: 'For doctors and attorneys, WSMN is simple and transparent:<ul><li><b>$400 setup + $289 annual fee</b>, paid together upfront (non-refundable)</li><li><b>$29/month</b> maintenance</li><li>Renews every 12 months, <b>no contract</b></li></ul>If you cancel after your 12 months, you owe nothing further.' },
      { k: ['contract', 'cancel', 'commitment', 'renew', 'refund'], a: '<b>No contract.</b> Your listing renews every 12 months. If you decide to cancel after the 12 months, you owe nothing further. The setup and annual fee are paid upfront and are non-refundable.' },
      { k: ['what do i get', 'include', 'benefit', 'listing', 'profile', 'features', 'why'], a: 'With WSMN you get:<ul><li>A professional profile with your specialties, service area and contact links</li><li>Placement in a nationwide directory for doctors and attorneys</li><li>SEO and AI-search friendly pages built by an award-winning, certified web developer</li><li>A link you can share anywhere</li></ul>' },
      { k: ['join', 'sign up', 'get started', 'apply', 'start', 'how do i'], a: 'Joining is easy: fill out the short form at ' + ADS + ', or call me at ' + R + '. We’ll confirm your eligibility, set up your profile and send it to you for approval.' },
      { k: ['receptionist', 'answer calls', 'missed call', 'after hours', '24/7', 'virtual assistant', 'rachel'], a: 'I can also answer your practice’s phones! The <b>24/7 AI virtual receptionist</b> is trained on your practice and never takes sensitive health or case details by phone.<ul><li>Partial Service: $299/month + $200 setup</li><li>Full Service: $499/month + $200 setup</li></ul>Try me <b>free for one full week</b>: call ' + R + '.' },
      { k: ['seo', 'google', 'rank', 'found', 'visibility', 'ai search'], a: 'WSMN profiles are built for visibility on <b>Google and AI search</b> with clear, structured information about your practice. No one can guarantee rankings, but a strong, consistent profile on a focused professional network helps people find you.' },
      { k: ['website', 'my own site', 'web design'], a: 'Need a website too? That’s <b>The WebSwan</b>, our sister brand: custom websites, landing pages and phone apps. Doctors and attorneys with a WebSwan Premium website pay <b>no WSMN setup fee</b>. Call or text ' + P + '.' },
      { k: ['contact', 'call', 'talk', 'someone', 'human', 'phone', 'email', 'text'], a: 'Talk to us:<ul><li>📞 Rachel (calls only): ' + R + '</li><li>📱 Call or text Tania: ' + P + '</li><li>✉️ <a href="mailto:designs@thewebswan.com">designs@thewebswan.com</a></li></ul>Hours: Monday to Friday, 10 AM to 8 PM.' },
      { k: ['hi', 'hello', 'hey'], a: 'Hi! 👋 Are you a doctor or attorney looking to advertise online? Ask me how WSMN works, what it costs or how to join.' }
    ]
  };
})();
