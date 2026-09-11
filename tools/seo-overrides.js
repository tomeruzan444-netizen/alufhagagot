/* Explicit SEO corrections applied at build time.

   Each entry fixes a defect that existed in the WordPress site: a duplicate
   title, a duplicate/missing description, or a page that should not be indexed.
   Everything here is deliberate and reviewable - nothing is generated blindly.
*/

module.exports = {
  /* --- duplicate <title>: three pages shared one title. The main service page
         keeps it; the two city pages get their own. --- */
  title: {
    '/איטום-גגות-בבית-שמש/': 'איטום גגות בבית שמש - מחירים, שיטות ואחריות | אלוף הגגות',
    '/איטום-גגות-בקדימה-צורן/': 'איטום גגות בקדימה צורן - מחירון ומידע מלא | אלוף הגגות',

    /* This page's URL and H1 both say בנימינה, but its title and description
       described טירת הכרמל - which has its own page. The title now matches the
       page it is actually on, and stays distinct from /איטום-גגות-בבנימינה/. */
    '/איטום-גגות-בבנימינה-2/': 'איטום גגות בבנימינה - זיפות ואיטום במחיר משתלם',

    // was 73 characters and would be truncated in the result page
    '/איטום-גגות-בקרית-עקרון/': 'איטום גגות בקרית עקרון - זיפות ויריעות ביטומניות | מחירון',

    // was 17 characters, too thin to describe the page
    '/בלוג/': 'בלוג אלוף הגגות - מדריכים ומחירים לאיטום גגות',
  },

  /* --- duplicate or missing meta description --- */
  description: {
    '/איטום-גגות-בבית-שמש/':
      'איטום גגות בבית שמש: זיפות, יריעות ביטומניות ותיקון נזילות. מחירון שקוף, אחריות בכתב וניסיון של מעל 20 שנה. צרו קשר להצעת מחיר חינם.',
    '/איטום-גגות-בקדימה-צורן/':
      'איטום גגות בקדימה צורן: כל שיטות האיטום, מחירון מלא ואחריות בכתב. צוות מנוסה שמגיע לאבחון בשטח. הצעת מחיר ללא עלות וללא התחייבות.',
    '/איטום-במעגן-מיכאל/':
      'איטום גגות במעגן מיכאל: זיפות, יריעות ביטומניות ואיתור נזילות. מחירון מלא, עבודה עם אחריות בכתב והצעת מחיר חינם עד אליכם.',
    '/איטום-גגות-באופקים/':
      'איטום גגות באופקים: פתרונות לגג שטוח, רעפים ובטון. מחירון מפורט, אחריות בכתב וצוות מקצועי שמגיע עד אליכם. הצעת מחיר ללא עלות.',
    '/איטום-גגות-בגדרה/':
      'איטום גגות בגדרה: איתור נזילות, זיפות ואיטום ביריעות ביטומניות. מחירים מעודכנים, אחריות בכתב וצוות שמגיע במהירות להצעת מחיר חינם.',
    '/בלוג/':
      'מדריכים ומאמרים מקצועיים על איטום גגות: חומרי איטום, מחירים, בחירת קבלן איטום ותחזוקה מונעת. הידע של אלוף הגגות במקום אחד.',
    '/category/uncategorized/':
      'ארכיון מאמרים של אלוף הגגות בנושא איטום גגות, חומרי איטום ותחזוקת גג.',

    // matches the page it actually sits on (see the title note above)
    '/איטום-גגות-בבנימינה-2/':
      'איטום וזיפות גגות בבנימינה עם אלוף הגגות: שירות אמין, מחירים הוגנים וצוות מנוסה עם אחריות בכתב. הצעת מחיר חינם עד אליכם.',

    /* --- descriptions that were a repeat of the page name --- */
    '/אזורי-שירות/':
      'אלוף הגגות מגיעים לאיטום וזיפות גגות בכל הארץ - מרכז, צפון, דרום והקריות. בדקו אם אנחנו מגיעים לאזור שלכם וקבלו הצעת מחיר חינם.',
    '/עמוד-אודות/':
      'אלוף הגגות - חברת איטום ותיקה עם מעל 20 שנות ניסיון באיטום גגות, מבנים ומרפסות בכל רחבי הארץ. הכירו את הצוות, השיטות והאחריות שאנחנו נותנים.',
    '/הפרויקטים-של-אלוף-הגגות/':
      'הצצה לפרויקטים של אלוף הגגות: איטום גגות שטוחים, מבני ציבור, בתים פרטיים ומרפסות בכל הארץ - עם תמונות מהשטח ופירוט העבודה שבוצעה.',
    '/בטקל-לאיטום/':
      'בטקל לאיטום: מה זה, למה משתמשים בו, איך מיישמים אותו נכון וכמה זה עולה. מדריך מלא עם מחירון מפורט מצוות אלוף הגגות.',
    '/מדיניות-פרטיות/':
      'מדיניות הפרטיות של אתר אלוף הגגות: איזה מידע נאסף, כיצד הוא נשמר, למי הוא מועבר ומה הזכויות שלכם בנוגע אליו.',
    '/הצהרת-נגישות/':
      'הצהרת הנגישות של אתר אלוף הגגות: התאמות הנגישות שבוצעו באתר, רמת התקן שאליה אנחנו מכוונים ודרכי פנייה לרכז הנגישות.',
    '/תנאי-שימוש/':
      'תנאי השימוש באתר אלוף הגגות: זכויות היוצרים בתכנים, גבולות האחריות על המידע המוצג ותנאי הפנייה דרך טפסי האתר.',

    /* --- descriptions that ran past the length Google shows --- */
    '/איטום-גגות-בגבעת-זאב/':
      'מחפשים איטום גגות בגבעת זאב? אלוף הגגות מבצעים איטום ביריעות ביטומניות, זיפות ותיקוני רטיבות עם אחריות מלאה. הצעת מחיר חינם.',
    '/יריעות-ביטומניות/':
      'כל מה שצריך לדעת על איטום גגות ומרפסות ביריעות ביטומניות: סוגים, יתרונות, שלבי ההתקנה, תחזוקה ומחירון מלא מצוות אלוף הגגות.',
  },

  /* Alt text for images the WordPress editor left without one. Keyed by file
     name, so the same photo is described consistently wherever it appears. */
  alt: {
    'נדב-אוטם-גג.png': 'טכנאי של אלוף הגגות מבצע עבודת איטום על גג',
    'פרויקט-איטום-בית-ספר-גוונים-1024x576.png': 'פרויקט איטום גג בבית ספר גוונים',
    'פרויקט-איטום-בית-ספר-גוונים.png': 'פרויקט איטום גג בבית ספר גוונים',
    'זיפות-גגות.png': 'זיפות גג בזפת חמה על ידי צוות אלוף הגגות',
  },

  /* Images that no longer exist anywhere - deleted from the media library while
     the reference stayed in the content. Verified 404 on the old WordPress
     server too, so there is nothing to restore; the reference is dropped. */
  missingImages: [
    'אלוף-הגגות-9.png',
  ],

  /* --- pages that should not be indexed ---
         A thank-you page has no search value and competes with nothing; the
         "Uncategorized" archive is a WordPress artefact that duplicates a post.
         Both keep working and stay linked (follow), they just leave the index. */
  robots: {
    '/עמוד-תודה/': 'noindex, follow',
    '/category/uncategorized/': 'noindex, follow',
  },

  /* --- merged into the Organization node of every page's schema ---
         The two founders, as the About page names them (see
         content-additions.js). Only confirmed facts: add Moshe's last name
         here and on the About page once it is known. */
  organization: {
    founder: [
      { '@type': 'Person', name: 'משה' },
      { '@type': 'Person', name: 'מנחם טולדו', knowsAbout: ['איטום גגות', 'זיפות גגות', 'איטום בסנפלינג', 'איטום בניינים'] },
    ],
  },
};
