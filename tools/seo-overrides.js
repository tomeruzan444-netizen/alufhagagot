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
  },

  /* --- pages that should not be indexed ---
         A thank-you page has no search value and competes with nothing; the
         "Uncategorized" archive is a WordPress artefact that duplicates a post.
         Both keep working and stay linked (follow), they just leave the index. */
  robots: {
    '/עמוד-תודה/': 'noindex, follow',
    '/category/uncategorized/': 'noindex, follow',
  },
};
