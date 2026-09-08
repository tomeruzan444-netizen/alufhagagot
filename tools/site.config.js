// Site-wide facts lifted from the WordPress build. Everything here is carried
// over verbatim so the migration does not change any public-facing detail.
module.exports = {
  origin: 'https://roofschamp.co.il',
  siteName: 'אלוף הגגות',
  tagline: 'איטום גגות בפריסה ארצית',
  lang: 'he-IL',
  gtmId: 'GTM-MJQDDBTN',
  googleSiteVerification: 'adjj7vW4RoH5JQCDDH-uyrjnqN7wOL61wJgULHFCf1k',

  // Web3Forms: replace YOUR_ACCESS_KEY with the real key from web3forms.com.
  // Until then, forms fall back to WhatsApp so no lead is ever lost.
  formEndpoint: 'https://api.web3forms.com/submit',
  formAccessKey: 'YOUR_ACCESS_KEY',

  phones: [
    { label: '050-565-0223', tel: '0505650223' },
    { label: '053-225-0954', tel: '0532250954' },
  ],
  whatsapp: '972505650223',
  email: 'Menahemtoledo4@gmail.com',

  logo: '/wp-content/uploads/2024/06/אלוף-הגגות-11-300x210.png',
  favicons: {
    ico32: '/wp-content/uploads/2025/08/cropped-פאביקון-אלוף-הגגות-1-32x32.png',
    ico192: '/wp-content/uploads/2025/08/cropped-פאביקון-אלוף-הגגות-1-192x192.png',
    apple180: '/wp-content/uploads/2025/08/cropped-פאביקון-אלוף-הגגות-1-180x180.png',
  },

  nav: [
    { text: 'זיפות גגות', href: '/זיפות-גגות/' },
    { text: 'איטום גגות', href: '/איטום-גגות/' },
    { text: 'איתור נזילות', href: '/איתור-נזילות/' },
    {
      text: 'סוגי שירות', href: '#', children: [
        { text: 'תיקון רטיבות בקיר', href: '/רטיבות-בקיר/' },
        { text: 'סיוד והלבנת גגות', href: '/סיוד-גגות/' },
        { text: 'איטום מרפסת מרוצפת', href: '/איטום-מרפסת-מרוצפת/' },
        { text: 'תיקון גגות - מידע ומחירים', href: '/תיקון-גגות/' },
        { text: 'איטום ביריעות ביטומניות', href: '/יריעות-ביטומניות/' },
      ]
    },
    {
      text: 'אזורי שירות', href: '/אזורי-שירות/', children: [
        { text: 'איטום גגות במרכז', href: '/איטום-גגות-במרכז/' },
        { text: 'איטום גגות בדרום', href: '/איטום-גגות-בדרום/' },
        { text: 'איטום גגות בצפון', href: '/איטום-גגות-בצפון/' },
      ]
    },
    { text: 'חלק מהפרויקטים שלנו', href: '/הפרויקטים-של-אלוף-הגגות/' },
    { text: 'אודות', href: '/עמוד-אודות/' },
    { text: 'צרו קשר', href: '/צרו-קשר/' },
  ],

  footer: {
    company: [
      { text: 'עמוד הבית', href: '/' },
      { text: 'עמוד אודות', href: '/עמוד-אודות/' },
      { text: 'עמוד יצירת קשר', href: '/צרו-קשר/' },
      { text: 'פרוייקטים מורכבים', href: '/פרוייקטים-מורכבים/' },
    ],
    legal: [
      { text: 'מדיניות פרטיות', href: '/מדיניות-פרטיות/' },
      { text: 'הצהרת נגישות', href: '/הצהרת-נגישות/' },
      { text: 'תנאי שימוש', href: '/תנאי-שימוש/' },
    ],
    services: [
      { text: 'איטום גגות', href: '/איטום-גגות/' },
      { text: 'זיפות גגות', href: '/זיפות-גגות/' },
      { text: 'סיוד גגות', href: '/סיוד-גגות/' },
      { text: 'איתור נזילות', href: '/איתור-נזילות/' },
      { text: 'איטום ביריעות ביטומניות', href: '/יריעות-ביטומניות/' },
      { text: 'איטום גגות במריחה', href: '/איטום-גגות-במריחה/' },
    ],
    areas: [
      { text: 'איטום גגות במרכז', href: '/איטום-גגות-במרכז/' },
      { text: 'איטום גגות בצפון', href: '/איטום-גגות-בצפון/' },
      { text: 'איטום גגות בדרום', href: '/איטום-גגות-בדרום/' },
      { text: 'איטום גגות בקריות', href: '/איטום-גגות-בקריות/' },
      { text: 'איטום גגות בתל אביב', href: '/איטום-גגות-בתל-אביב/' },
      { text: 'איטום גגות בירושלים', href: '/איטום-גגות-בירושלים/' },
      { text: 'איטום גגות בחיפה', href: '/איטום-גגות-בחיפה/' },
      { text: 'איטום גגות בבאר שבע', href: '/איטום-גגות-בבאר-שבע/' },
      { text: 'איטום גגות בראשון לציון', href: '/איטום-גגות-בראשון-לציון/' },
      { text: 'איטום גגות ברמת גן', href: '/איטום-גגות-ברמת-גן/' },
      { text: 'איטום גגות בגבעתיים', href: '/איטום-גגות-בגבעתיים/' },
      { text: 'איטום גגות ברמת השרון', href: '/איטום-גגות-ברמת-השרון/' },
      { text: 'איטום גגות בבת ים', href: '/איטום-גגות-בבת-ים/' },
      { text: 'איטום גגות בחולון', href: '/איטום-גגות-בחולון/' },
      { text: 'איטום גגות במודיעין', href: '/איטום-גגות-במודיעין/' },
      { text: 'איטום גגות באשדוד', href: '/איטום-גגות-באשדוד/' },
    ],
  },

  social: [
    { name: 'Facebook', href: 'https://www.facebook.com/roofschampp/' },
    { name: 'Youtube', href: 'https://www.youtube.com/channel/UCmKd8ANeOIewvE58kEQsz9g' },
    { name: 'X', href: 'https://x.com/RoofschampC4406' },
    { name: 'Linkedin', href: 'https://www.linkedin.com/in/%D7%90%D7%9C%D7%95%D7%A3-%D7%94%D7%92%D7%92%D7%95%D7%AA-a36759326/' },
  ],
  reviewsUrl: 'https://easy.co.il/page/10137241',

  // Duplicate pages found during the crawl: the long slugs are copies created on
  // 2026-08-06; the short slugs are the older, ranking originals.
  redirects: [
    { from: '/איטום-גגות-בגן-יבנה-מידע-רלוונטי-ומחיר/', to: '/איטום-גגות-בגן-יבנה/' },
    { from: '/חומרי-איטום-שונים-אז-אילו-חומרים-קיימי/', to: '/חומרי-איטום/' },
  ],
};
