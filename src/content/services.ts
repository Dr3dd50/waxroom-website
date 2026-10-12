// Long-form content for each service landing page (/services/<slug>/).
// Prices, durations and the service list itself come live from GlossGenius
// (src/data/business.json); this file is the editorial copy around them.

export type Step = { title: string; body: string };
export type Faq = { q: string; a: string };

export type ServicePage = {
  slug: string;
  /** GlossGenius category names whose services appear on this page. */
  categories: string[];
  name: string;
  /** Short label for nav menus and cross-links. */
  navLabel: string;
  /** One line for service cards and lists. */
  tagline: string;
  seoTitle: string;
  metaDescription: string;
  /** "Get your ___ ___" rotations for this page's hero. */
  flips: [noun: string, verb: string][];
  intro: string;
  /** Which service's photo leads the page, if it has one. */
  heroService?: string;
  highlights: Step[];
  expect: Step[];
  before: string[];
  after: string[];
  faqs: Faq[];
  /** Reviews whose text matches are shown on this page. */
  reviewMatch: RegExp;
  memberships: string[];
  packages: string[];
};

export const SERVICE_PAGES: ServicePage[] = [
  {
    slug: 'brazilian-waxing',
    categories: ['Intimate Waxing'],
    name: 'Brazilian & Intimate Waxing',
    navLabel: 'Brazilian & intimate',
    tagline: 'Smooth, quick and totally judgment-free.',
    seoTitle: 'Brazilian Wax in Midlothian, VA | The Wax Room',
    metaDescription:
      'Brazilian, bikini, French bikini and Manzilian waxing in Midlothian, VA. Fast, gentle and judgment-free, with first-visit rituals, memberships and online booking.',
    flips: [
      ['Brazilian', 'done'],
      ['bikini line', 'tidied'],
      ['French bikini', 'perfected'],
      ['Manzilian', 'handled'],
      ['confidence', 'back'],
    ],
    intro:
      'Intimate waxing is what The Wax Room is known for. Whether it’s your first Brazilian or your fiftieth, your appointment is quick, private and completely judgment-free, and you leave smooth for weeks.',
    heroService: 'Brazilian',
    highlights: [
      {
        title: 'Smooth for weeks',
        body: 'Waxing removes hair from the root rather than the surface, so results last three to four weeks instead of a few days.',
      },
      {
        title: 'Softer regrowth',
        body: 'Stay on a regular schedule and many clients notice regrowth coming in finer and sparser over time.',
      },
      {
        title: 'Every style, every body',
        body: 'Full Brazilian, bikini, French bikini or a Manzilian. Tell us what you want to keep and we’ll take care of the rest.',
      },
    ],
    expect: [
      {
        title: 'Check in & chat',
        body: 'We’ll confirm the style you want and ask about anything that affects your skin, like retinoids, recent sun or sensitivities.',
      },
      {
        title: 'Cleanse & wax',
        body: 'Skin is cleansed and prepped, then waxed section by section. Most intimate services take 20–30 minutes.',
      },
      {
        title: 'Soothe & go',
        body: 'We finish with a soothing product and check for strays, so you walk out smooth and comfortable.',
      },
    ],
    before: [
      'Let hair grow to about ¼ inch, roughly the length of a grain of rice (about 2–3 weeks after shaving).',
      'Gently exfoliate a day or two before, but not the day of.',
      'Skip lotions and oils on the area the day of your appointment.',
      'Avoid tanning and sunburn beforehand, and tell us if you use retinoids or acne medication.',
      'Wear loose, breathable clothing to and from your visit.',
    ],
    after: [
      'For 24–48 hours, skip hot baths, saunas, intense workouts and tight clothing.',
      'Keep the area clean and avoid scented products while skin settles.',
      'Start gentle exfoliation after 2–3 days to help prevent ingrown hairs.',
      'Rebook every 3–5 weeks to keep hair on the same growth cycle.',
    ],
    faqs: [
      {
        q: 'Does a Brazilian hurt?',
        a: 'There’s a quick sting, and it’s usually most noticeable on your first visit. Each wax tends to feel easier as hair grows back finer. Our team works fast to keep discomfort brief.',
      },
      {
        q: 'What’s the difference between a bikini, French bikini and Brazilian?',
        a: 'A bikini cleans up the sides and top of the bikini line. A French bikini removes more from the front and leaves a strip or small shape. A Brazilian removes everything from front to back, unless you ask us to leave a strip.',
      },
      {
        q: 'Can I come in on my period?',
        a: 'Yes. Most clients are fine to come in wearing a tampon or cup. Skin can be more sensitive around your cycle, so if you’d rather reschedule, just let us know.',
      },
      {
        q: 'Do you wax men?',
        a: 'Yes. Our Manzilian removes unwanted hair from the front, back and everything in between.',
      },
      {
        q: 'I’ve never been here before. Is there a first-visit deal?',
        a: 'Yes. The New Client Ritual pairs your first Brazilian with a complimentary 1-hour V-steam at an introductory price, with a small deposit when booking.',
      },
    ],
    reviewMatch: /brazilian|bikini|intimate|manzilian/i,
    memberships: ['Monthly Cookie Club', 'The Basic Bundle', 'Wax and Steam Pass'],
    packages: ['Brazilian Bundle', 'The V-Glow', 'The Wax Room Wow'],
  },
  {
    slug: 'body-waxing',
    categories: ['Body and Facial Waxing'],
    name: 'Body & Facial Waxing',
    navLabel: 'Body & face',
    tagline: 'Lip to toe, done in minutes.',
    seoTitle: 'Body & Facial Waxing in Midlothian, VA | The Wax Room',
    metaDescription:
      'Leg, arm, underarm, back, chest and facial waxing in Midlothian, VA. Quick appointments, smooth results that last for weeks, and easy online booking.',
    flips: [
      ['legs', 'smoothed'],
      ['underarms', 'cleared'],
      ['lip', 'cleaned up'],
      ['back', 'waxed'],
      ['arms', 'silky'],
    ],
    intro:
      'From a quick lip or chin wax to a full-leg or full-torso service, body waxing at The Wax Room is fast and thorough. Most services take 10 to 20 minutes, and you stay smooth far longer than with shaving.',
    heroService: 'Full Leg',
    highlights: [
      {
        title: 'No daily shaving',
        body: 'Hair is removed from the root, so you skip the razor and the stubble for weeks at a time.',
      },
      {
        title: 'Lip to toe',
        body: 'Face, underarms, arms, legs, back, chest, belly and toes. Add services together in one visit.',
      },
      {
        title: 'In and out',
        body: 'Most body and facial services take 10 to 20 minutes, which makes them easy to fit into a lunch break.',
      },
    ],
    expect: [
      {
        title: 'Quick consult',
        body: 'Tell us which areas you’d like done and mention any skincare like retinoids or exfoliating acids, especially for facial waxing.',
      },
      {
        title: 'Prep & wax',
        body: 'We cleanse the area, apply wax in sections and remove it quickly and cleanly.',
      },
      {
        title: 'Finish',
        body: 'A soothing finish calms the skin. Mild redness is normal and usually fades within a few hours.',
      },
    ],
    before: [
      'Let hair grow to about ¼ inch (around 2–3 weeks after shaving).',
      'Stop retinoids and exfoliating acids on the face a few days before a facial wax, and tell us if you use them.',
      'Avoid sunburn and tanning on the area.',
      'Come with clean, lotion-free skin.',
    ],
    after: [
      'Avoid heat, sweat and sun on the area for 24–48 hours.',
      'Hold off on makeup over freshly waxed facial skin for a few hours if you can.',
      'Exfoliate gently a few days after to prevent ingrown hairs.',
      'Rebook every 3–5 weeks for the smoothest results.',
    ],
    faqs: [
      {
        q: 'How long does body waxing last?',
        a: 'Usually three to four weeks, depending on the area and your hair growth cycle. Regular appointments help keep results consistent.',
      },
      {
        q: 'Can I wax if I use retinol or acne medication?',
        a: 'Tell us before your appointment. Retinoids and some acne medications thin the skin and can make waxing unsafe for that area, especially the face. We’ll advise you on what’s safe.',
      },
      {
        q: 'Can I book several areas at once?',
        a: 'Yes. Combine as many services as you like in one booking. The Wax Room Wow package bundles a Brazilian, half-leg and underarm wax.',
      },
    ],
    reviewMatch: /\b(legs?|underarms?|arms?|lip|chin|chest|stomach|full body|torso)\b/i,
    memberships: ['The Basic Bundle'],
    packages: ['The Wax Room Wow'],
  },
  {
    slug: 'brows',
    categories: ['Brow Art'],
    name: 'Brow Waxing, Lamination & Henna',
    navLabel: 'Brows',
    tagline: 'Mapped, shaped, laminated and tinted.',
    seoTitle: 'Brow Wax, Lamination & Henna Brows in Midlothian, VA | The Wax Room',
    metaDescription:
      'Eyebrow waxing, brow lamination and henna brow tinting in Midlothian, VA. Shaped to your natural arch for fuller, defined brows.',
    flips: [
      ['brows', 'snatched'],
      ['brows', 'laminated'],
      ['arch', 'defined'],
      ['brows', 'tinted'],
      ['eyes', 'framed'],
    ],
    intro:
      'Great brows change your whole face. We shape to your natural arch and bone structure, and then, if you want more, lamination brushes your brows into a fuller, lifted shape and henna adds depth and definition.',
    heroService: 'Brow Lamination and Wax',
    highlights: [
      {
        title: 'Shaped for your face',
        body: 'We map your brow’s start, arch and tail before waxing, so the shape suits your features instead of following a trend.',
      },
      {
        title: 'Lamination for fullness',
        body: 'Lamination sets brow hairs in a brushed-up position, so sparse or unruly brows look fuller and stay in place for weeks.',
      },
      {
        title: 'Henna for definition',
        body: 'Henna tints the hairs and lightly stains the skin beneath, filling gaps for a soft, defined look.',
      },
    ],
    expect: [
      {
        title: 'Map',
        body: 'We look at your natural shape and talk about how full, thin or defined you want your brows.',
      },
      {
        title: 'Treat',
        body: 'Depending on your service, that means waxing, lamination, henna tinting, or a combination.',
      },
      {
        title: 'Perfect',
        body: 'We tweeze any final strays and brush your brows into place, then send you off with aftercare tips.',
      },
    ],
    before: [
      'Grow brows out for 3–4 weeks before your first shaping, and skip tweezing in between.',
      'Avoid retinoids and exfoliating acids around the brows for a few days before.',
      'Come with brows free of makeup if possible.',
    ],
    after: [
      'Lamination: keep brows dry and avoid steam, makeup and heavy products for 24 hours.',
      'Henna: avoid water and cleansers on the brows for about 24 hours so the tint can set.',
      'Brush laminated brows into place each morning, and use a nourishing brow oil once they’ve set.',
      'Rebook a wax every 3–4 weeks to keep your shape crisp.',
    ],
    faqs: [
      {
        q: 'How long does brow lamination last?',
        a: 'Typically around six to eight weeks, depending on your hair and how you care for it.',
      },
      {
        q: 'What’s the difference between henna and regular tint?',
        a: 'Henna stains both the brow hairs and the skin underneath, so it fills in sparse areas as well as darkening hairs. The skin stain fades first, usually within one to two weeks.',
      },
      {
        q: 'Is lamination safe for my brows?',
        a: 'Lamination is gentle when done correctly and spaced out properly. We’ll check how your brows are doing before every treatment.',
      },
    ],
    reviewMatch: /brow/i,
    memberships: [],
    packages: [],
  },
  {
    slug: 'lash-extensions',
    categories: ['Lash Art'],
    name: 'Lash Extensions',
    navLabel: 'Lashes',
    tagline: 'Full sets and fills that last.',
    seoTitle: 'Lash Extensions & Fills in Midlothian, VA | The Wax Room',
    metaDescription:
      'Full sets of eyelash extensions, 1–4 week fills and lash baths in Midlothian, VA. Wake up with length and volume, no mascara needed.',
    flips: [
      ['lashes', 'extended'],
      ['set', 'filled'],
      ['mornings', 'back'],
      ['lashes', 'refreshed'],
      ['volume', 'up'],
    ],
    intro:
      'Lash extensions give you length and volume from the moment you wake up, with no mascara or curler needed. Each extension is applied individually to one of your natural lashes for a full, natural-feeling set that lasts with regular fills.',
    heroService: 'Full Set of Lash Extensions',
    highlights: [
      {
        title: 'Wake up ready',
        body: 'Skip mascara and falsies. Your lashes look done from the moment you open your eyes.',
      },
      {
        title: 'One lash at a time',
        body: 'Each extension is bonded to a single natural lash, so your set moves and grows out with your own lashes.',
      },
      {
        title: 'Fills that fit your life',
        body: 'Natural lashes shed every day. 1, 2, 3 and 4-week fills replace what’s grown out and keep your set full.',
      },
    ],
    expect: [
      {
        title: 'Design',
        body: 'We talk through the length, curl and fullness you want, and the look that suits your eye shape.',
      },
      {
        title: 'Relax',
        body: 'You lie back with your eyes closed while extensions are applied one by one. A full set takes about two hours, and many clients nap.',
      },
      {
        title: 'Reveal',
        body: 'Lashes are brushed out and checked. You leave with aftercare and a suggested fill schedule.',
      },
    ],
    before: [
      'Come with clean lashes: no mascara, and no oily makeup remover around the eyes.',
      'If you wear contacts, bring your case. You may want to take them out for the appointment.',
      'Skip caffeine right before if it makes it hard for you to keep still.',
    ],
    after: [
      'Keep lashes dry and away from steam for the first 24–48 hours while the adhesive cures.',
      'Use oil-free cleansers and makeup removers around the eyes.',
      'Don’t use mascara on extensions, and avoid mechanical lash curlers.',
      'Brush lashes gently each day, and book a Lash Bath before fills to keep them clean.',
      'Avoid rubbing your eyes or sleeping face-down when you can.',
    ],
    faqs: [
      {
        q: 'How often do I need a fill?',
        a: 'Most clients come in every two to three weeks. We offer 1, 2, 3 and 4-week fills, priced by how much has grown out. If more than half your set has shed, you may need a new full set.',
      },
      {
        q: 'Do lash extensions damage natural lashes?',
        a: 'When extensions are sized correctly and applied to one natural lash at a time, they grow out naturally. Problems usually come from picking or pulling, so let us remove them for you.',
      },
      {
        q: 'Is there a lash membership?',
        a: 'Yes. The Luxe Lash Pass gives you member pricing on fills every month.',
      },
    ],
    reviewMatch: /lash/i,
    memberships: ['Luxe Lash Pass'],
    packages: [],
  },
  {
    slug: 'skin-treatments',
    categories: ['Skin Therapy'],
    name: 'Jet Plasma & Advanced Skin Treatments',
    navLabel: 'Jet Plasma & skin',
    tagline: 'Jet Plasma, BioRePeel and the vajacial.',
    seoTitle: 'Jet Plasma Facial & BioRePeel in Midlothian, VA | The Wax Room',
    metaDescription:
      'Jet Plasma facials, eye and body treatments, BioRePeel and vajacials in Midlothian, VA. Non-invasive treatments for fine lines, scarring, pigmentation and texture.',
    flips: [
      ['wrinkles', 'removed'],
      ['skin', 'resurfaced'],
      ['glow', 'back'],
      ['eyes', 'brightened'],
      ['texture', 'smoothed'],
    ],
    intro:
      'Our advanced skin menu targets what a basic facial can’t. Jet Plasma uses plasma technology to stimulate collagen and tighten skin. BioRePeel resurfaces with little to no peeling. And the vajacial brings the same care to your bikini line.',
    heroService: 'Jet Plasma Facial',
    highlights: [
      {
        title: 'Jet Plasma',
        body: 'A non-invasive plasma treatment that stimulates collagen, tightens skin and improves texture. It targets fine lines, acne scars and hyperpigmentation with no numbing and no downtime.',
      },
      {
        title: 'BioRePeel',
        body: 'An Italian-made, medical-grade peel made with vitamins and amino acids. It resurfaces, hydrates and fades pigmentation with little to no peeling, and it’s suitable for all skin types.',
      },
      {
        title: 'Vajacial',
        body: 'A facial for the bikini area that cleanses, gently exfoliates and calms skin to help reduce ingrown hairs. It pairs well with a wax.',
      },
    ],
    expect: [
      {
        title: 'Skin consult',
        body: 'We review your concerns, skin history and products to choose the right treatment, or a combination.',
      },
      {
        title: 'Treatment',
        body: 'Skin is cleansed and treated. Jet Plasma facials take about 90 minutes and BioRePeel about an hour.',
      },
      {
        title: 'Glow plan',
        body: 'You go home with aftercare, SPF guidance and a recommended treatment schedule for your goals.',
      },
    ],
    before: [
      'Tell us if you’re pregnant or breastfeeding, have a pacemaker or metal implants, or are using Accutane or prescription retinoids. We’ll advise whether a treatment is right for you.',
      'Pause retinoids and exfoliating acids for several days before a peel or plasma treatment.',
      'Avoid sunburn, tanning and waxing on the treatment area in the week before.',
      'Arrive with clean, makeup-free skin if you can.',
    ],
    after: [
      'Wear broad-spectrum SPF every day. Freshly treated skin is more sensitive to sun.',
      'Keep skincare gentle and hydrating for a few days: no scrubs, acids or retinoids.',
      'Avoid saunas, steam and heavy sweating for 24–48 hours.',
      'Don’t pick at any flaking. Let skin renew on its own.',
    ],
    faqs: [
      {
        q: 'Does Jet Plasma hurt?',
        a: 'No numbing is required. Most clients describe a warm, tingling sensation during treatment.',
      },
      {
        q: 'Is there downtime?',
        a: 'Jet Plasma and BioRePeel are both no-downtime treatments. Some temporary redness or light flaking is normal for a day or two.',
      },
      {
        q: 'What can Jet Plasma help with?',
        a: 'Fine lines, wrinkles, acne, scarring, hyperpigmentation and overall texture. It also comes as an eye treatment to reduce puffiness, and as a body treatment.',
      },
      {
        q: 'How many sessions will I need?',
        a: 'It depends on your skin and goals. Many concerns respond best to a short series of treatments. We’ll recommend a plan at your consultation.',
      },
    ],
    reviewMatch: /plasma|facial|peel|skin|vajacial/i,
    memberships: [],
    packages: ['The V-Glow'],
  },
  {
    slug: 'yoni-steam',
    categories: ['Yoni Steam'],
    name: 'Yoni Steam',
    navLabel: 'Yoni steam',
    tagline: 'Pause, breathe, restore.',
    seoTitle: 'Yoni Steam in Midlothian, VA | The Wax Room',
    metaDescription:
      'Private yoni steam sessions with premium herbal blends in Midlothian, VA. A quiet self-care ritual, available on its own or with a wax.',
    flips: [
      ['steam', 'on'],
      ['calm', 'back'],
      ['ritual', 'started'],
      ['me time', 'booked'],
    ],
    intro:
      'A yoni steam is a quiet, seated session over a warm infusion of herbs: a private moment to pause, breathe and reset. It’s one of our most-loved add-ons after a wax, and you can book it on its own or as a weekly ritual.',
    highlights: [
      {
        title: 'Premium herbal blends',
        body: 'Sessions use custom, premium-grade herbal blends steeped into a warm, gentle steam.',
      },
      {
        title: 'Private & unhurried',
        body: 'You relax in your own space, fully covered and in control, for an hour of steam.',
      },
      {
        title: 'Better together',
        body: 'Pair it with a Brazilian, or join The Steam Society for weekly sessions.',
      },
    ],
    expect: [
      { title: 'Settle in', body: 'We explain the session and get you comfortable in a private space.' },
      { title: 'Steam', body: 'You sit over a warm herbal steam, draped for comfort. Just relax, breathe and unwind.' },
      { title: 'Rest', body: 'Take a moment to rehydrate before heading out.' },
    ],
    before: [
      'Skip steaming if you’re pregnant, on your period, or have an active infection, and check with your doctor if you have any health concerns.',
      'Drink water before your session.',
      'Wear comfortable, loose clothing.',
    ],
    after: [
      'Rehydrate and take it easy for the rest of the day.',
      'Wear breathable cotton underwear.',
      'If you feel any discomfort or irritation, stop and let us know.',
    ],
    faqs: [
      {
        q: 'Is the steam hot?',
        a: 'It should feel warm and comfortable, never hot. Tell us right away if it feels too warm and we’ll adjust it.',
      },
      {
        q: 'Can I steam right after a wax?',
        a: 'Yes. Pairing them is popular, and it’s how our New Client Ritual and V-Glow package work. We make sure the steam is gentle on freshly waxed skin.',
      },
      {
        q: 'Is a yoni steam a medical treatment?',
        a: 'No. We offer it as a relaxation and self-care ritual, not as a treatment for any condition. Please see your healthcare provider for medical concerns.',
      },
    ],
    reviewMatch: /steam|yoni/i,
    memberships: ['The Steam Society', 'Wax and Steam Pass'],
    packages: ['The V-Glow'],
  },
  {
    slug: 'hair-restoration',
    categories: ['Hair Restoration'],
    name: 'Hair Restoration & Wig Installs',
    navLabel: 'Hair restoration',
    tagline: 'Plasma regrowth and luxury wig installs.',
    seoTitle: 'Jet Plasma Hair Restoration & Wig Installs in Midlothian, VA | The Wax Room',
    metaDescription:
      'Non-invasive Jet Plasma hair restoration and glueless HD lace wig installation in Midlothian, VA. Book a consultation online.',
    flips: [
      ['hair', 'restored'],
      ['wig', 'installed'],
      ['volume', 'back'],
      ['install', 'flawless'],
    ],
    intro:
      'Two ways to love your hair again. Jet Plasma Hair Restoration is a non-invasive treatment that stimulates the scalp to encourage thicker, fuller-looking hair without surgery. Our luxury wig installs give you a flawless, glueless HD lace look tailored to you.',
    heroService: 'Jet Plasma Hair Restoration',
    highlights: [
      {
        title: 'No needles, no surgery',
        body: 'Plasma energy stimulates the scalp to support thicker, fuller-looking hair with a non-invasive approach.',
      },
      {
        title: 'Glueless HD lace',
        body: 'Wig installs are customized to your hairline and style, with no glue.',
      },
      {
        title: 'Start with a consult',
        body: 'Not sure where to begin? A quick install consultation helps us plan the right look for you.',
      },
    ],
    expect: [
      { title: 'Consult', body: 'We talk about your hair goals, history and the look you want.' },
      { title: 'Treat or install', body: 'A plasma scalp treatment takes about an hour. Installs are fitted and styled to your hairline.' },
      { title: 'Maintain', body: 'We map out a treatment plan or maintenance schedule so results last.' },
    ],
    before: [
      'Come with clean, product-free hair and scalp for plasma treatments.',
      'Tell us about any scalp conditions, medications or recent procedures.',
      'For installs, bring your unit or book a consultation first to plan it.',
    ],
    after: [
      'Be gentle with the scalp for a few days after plasma treatment: no harsh products or heavy styling.',
      'Protect your scalp from the sun.',
      'Follow your install care plan to keep the lace and hairline looking fresh.',
    ],
    faqs: [
      {
        q: 'How many hair restoration sessions will I need?',
        a: 'Plasma treatments are often done as a series, and results vary from person to person. We’ll recommend a plan after your consultation.',
      },
      {
        q: 'Is Jet Plasma Hair Restoration painful?',
        a: 'It’s non-invasive. Most clients feel warmth and light tingling on the scalp.',
      },
      {
        q: 'Do you provide the wig?',
        a: 'Book an install consultation and we’ll talk through units, sourcing and the style you want.',
      },
    ],
    reviewMatch: /wig|hair restor|regrow|plasma hair/i,
    memberships: [],
    packages: [],
  },
];

/** Lowest starting price across a page's GlossGenius categories. */
export const fromPrice = (p: ServicePage, categories: { name: string; services: { price: number }[] }[]) =>
  Math.min(...categories.filter((c) => p.categories.includes(c.name)).flatMap((c) => c.services.map((s) => s.price)));

export const findServicePage = (slug: string) => SERVICE_PAGES.find((p) => p.slug === slug);
export const servicePath = (p: ServicePage) => `/services/${p.slug}/`;
/** Which landing page covers a GlossGenius category, if any. */
export const pageForCategory = (category: string) => SERVICE_PAGES.find((p) => p.categories.includes(category));

// ── Problem-based groups ──────────────────────────────────────────────────────
// How services are presented in menus and on the home page: by what the client
// wants fixed, each group opening into every named service it covers.

export type ServiceGroup = {
  key: string;
  label: string;
  /** The problem this group solves, in the client's words. */
  problem: string;
  /** Doodle video used for the group. */
  video: string;
  /** Landing pages in this group; the first is the group's main page. */
  pages: string[];
  /** Extra GlossGenius categories with no landing page of their own. */
  extraCategories?: string[];
  /**
   * A landing page for the group itself, at /services/<key>/, for groups that
   * span more than one service page or category. Groups without one use their
   * single service page as their landing page.
   */
  landing?: GroupLanding;
};

/** Editorial copy for a group landing page; services, prices and offers come from its pages. */
export type GroupLanding = {
  seoTitle: string;
  metaDescription: string;
  flips: [noun: string, verb: string][];
  intro: string;
  highlights: Step[];
  faqs: Faq[];
  reviewMatch: RegExp;
  /** Offers for the group's extra categories, on top of those from its pages. */
  memberships?: string[];
};

const WAXING: GroupLanding = {
  seoTitle: 'Waxing in Midlothian, VA: Brazilian, Body & Facial | The Wax Room',
  metaDescription:
    'Brazilian, bikini, leg, underarm, back and facial waxing in Midlothian, VA. Quick, judgment-free appointments, memberships that keep you smooth, and online booking.',
  flips: [
    ['wax', 'done'],
    ['Brazilian', 'booked'],
    ['legs', 'smoothed'],
    ['underarms', 'cleared'],
    ['lip', 'cleaned up'],
  ],
  intro:
    'Waxing is what The Wax Room is known for. From a Brazilian to a full leg or a quick lip wax, every appointment is fast, private and judgment-free, and because hair comes out from the root, you stay smooth for weeks.',
  highlights: [
    {
      title: 'Smooth for weeks',
      body: 'Waxing removes hair from the root rather than the surface, so results last three to four weeks instead of a few days.',
    },
    {
      title: 'Softer regrowth',
      body: 'Stay on a regular schedule and many clients notice regrowth coming in finer and sparser over time.',
    },
    {
      title: 'Head to toe',
      body: 'Intimate, body and facial waxing, for every body. Add services together and get it all done in one visit.',
    },
  ],
  faqs: [
    {
      q: 'How long does waxing last?',
      a: 'Usually three to four weeks, depending on the area and your hair growth cycle. Rebooking every 3–5 weeks keeps hair on the same cycle and results consistent.',
    },
    {
      q: 'How long should my hair be?',
      a: 'About ¼ inch, roughly the length of a grain of rice. That’s usually 2–3 weeks after shaving.',
    },
    {
      q: 'Does waxing hurt?',
      a: 'There’s a quick sting, usually most noticeable on your first visit. Each wax tends to feel easier as hair grows back finer, and our team works fast to keep it brief.',
    },
    {
      q: 'I’ve never been here before. Is there a first-visit deal?',
      a: 'Yes. The New Client Ritual pairs your first Brazilian with a complimentary 1-hour V-steam at an introductory price, with a small deposit when booking.',
    },
  ],
  reviewMatch: /wax|brazilian|bikini|leg|underarm/i,
};

const WELLNESS: GroupLanding = {
  seoTitle: 'Yoni Steam & Bio Scans in Midlothian, VA | The Wax Room',
  metaDescription:
    'Private yoni steam sessions with premium herbal blends, and quick bio scans, in Midlothian, VA. Self-care on its own or alongside a wax. Book online.',
  flips: [
    ['steam', 'on'],
    ['calm', 'back'],
    ['me time', 'booked'],
    ['scan', 'done'],
  ],
  intro:
    'Wellness at The Wax Room is about slowing down. Settle into a private yoni steam over a warm herbal infusion, or add a quick bio scan for insight into your body’s health and wellness.',
  highlights: [
    {
      title: 'A real pause',
      body: 'An hour of warm herbal steam in your own private space, fully covered and in control.',
    },
    {
      title: 'Five-minute bio scan',
      body: 'A quick scan that gives you insight into your body’s health and wellness, so your care can be personalized.',
    },
    {
      title: 'Better together',
      body: 'Pair a steam with a Brazilian, or join a membership for weekly steams or daily scans.',
    },
  ],
  faqs: [
    {
      q: 'Is the steam hot?',
      a: 'It should feel warm and comfortable, never hot. Tell us right away if it feels too warm and we’ll adjust it.',
    },
    {
      q: 'What is a bio scan?',
      a: 'A quick, five-minute scan that gives insight into your body’s health and wellness to help personalize your care. You can book it on its own or add it to another visit.',
    },
    {
      q: 'Are these medical treatments?',
      a: 'No. We offer yoni steams and bio scans as wellness and self-care services, not to diagnose or treat any condition. Please see your healthcare provider for medical concerns.',
    },
  ],
  reviewMatch: /steam|yoni|scan|relax/i,
  memberships: [],
};

export const SERVICE_GROUPS: ServiceGroup[] = [
  { key: 'waxing', label: 'Waxing', problem: 'Unwanted hair, gone for weeks', video: 'brazilian-waxing', pages: ['brazilian-waxing', 'body-waxing'], landing: WAXING },
  { key: 'brows', label: 'Brows', problem: 'Sparse, uneven or unruly brows', video: 'brows', pages: ['brows'] },
  { key: 'lashes', label: 'Lashes', problem: 'Short or thin lashes', video: 'lash-extensions', pages: ['lash-extensions'] },
  { key: 'skin', label: 'Skin', problem: 'Fine lines, scars, pigmentation and texture', video: 'skin-treatments', pages: ['skin-treatments'] },
  { key: 'hair', label: 'Hair', problem: 'Thinning hair or a flawless install', video: 'hair-restoration', pages: ['hair-restoration'] },
  { key: 'wellness', label: 'Wellness', problem: 'Stress, rest and self-care', video: 'yoni-steam', pages: ['yoni-steam'], extraCategories: ['Bio scans'], landing: WELLNESS },
];

export const serviceAnchor = (name: string) =>
  name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

type Catalog = { name: string; services: { name: string; price: number; priceVaries: boolean; duration: number }[] }[];

/** Every named service in a group, each linking to its row on the right landing page. */
export function groupServices(g: ServiceGroup, categories: Catalog) {
  const items: { name: string; price: number; priceVaries: boolean; duration: number; href: string }[] = [];
  for (const slug of g.pages) {
    const page = findServicePage(slug)!;
    for (const c of categories.filter((c) => page.categories.includes(c.name))) {
      for (const sv of c.services) items.push({ ...sv, href: `${servicePath(page)}#${serviceAnchor(sv.name)}` });
    }
  }
  for (const c of categories.filter((c) => g.extraCategories?.includes(c.name))) {
    for (const sv of c.services) items.push({ ...sv, href: g.landing ? `/services/${g.key}/#${serviceAnchor(sv.name)}` : '/#prices' });
  }
  return items;
}

export const groupPath = (g: ServiceGroup) => `/services/${g.key}/`;
/** Where a group links to: its own landing page, or else its single service page. */
export const groupHref = (g: ServiceGroup) => (g.landing ? groupPath(g) : servicePath(findServicePage(g.pages[0])!));
export const findGroupLanding = (key: string) => SERVICE_GROUPS.find((g) => g.key === key && g.landing);
/** The group a service page belongs to. */
export const groupForPage = (slug: string) => SERVICE_GROUPS.find((g) => g.pages.includes(slug))!;
/** The GlossGenius categories under a group, its main page's first. */
export const groupCategories = (g: ServiceGroup) => [...g.pages.flatMap((slug) => findServicePage(slug)!.categories), ...(g.extraCategories ?? [])];
