/* Homepage-specific layout.

   The other 165 pages keep the article + sidebar layout that mirrors the
   WordPress build. The homepage is a landing page instead: full-bleed hero,
   trust strip, service cards, a dark band and a closing CTA.

   Every string rendered here already exists on the page - this file only
   decides where each existing block goes, it never writes copy.
*/

// Real project photos from the media library, matched to the service they show.
// Services with no genuine photo get a branded card instead of a misleading one.
const SERVICE_PHOTOS = {
  '/איטום-גגות/': '/wp-content/uploads/2024/09/איטום-אלוף-הגגות.png',
  '/זיפות-גגות/': '/wp-content/uploads/2024/08/זיפות-גגות.png',
  '/רטיבות-בקיר/': '/wp-content/uploads/2024/06/רטיבות-בקיר-אלוף-הגגות.png',
  '/יריעות-ביטומניות/': '/wp-content/uploads/2024/09/איטום-ביריעות-ביטומניות.png',
  '/רטיבות-בתקרה/': '/wp-content/uploads/2024/06/רטיבות-בגג-אלוף-הגגות.png',
  '/איטום-מבנים/': '/wp-content/uploads/2024/09/פרויקט-איטום-בית-ספר-גוונים.png',
  '/איטום-גגות-מרוצפים/': '/wp-content/uploads/2025/11/פרוייקט-מורכב-איטום-גגות.png',
  '/איטום-גג-איסכורית/': '/wp-content/uploads/2024/09/איטום-גג-ביריעות.png',
  '/איטום-קירות-חיצוניים/': '/wp-content/uploads/2024/09/פרוייקט-איטום.png',
  '/איטום-בהתזה/': '/wp-content/uploads/2024/09/איטום-גגות-אלוף-הגגות.png',
};

const HERO_PHOTO = '/wp-content/uploads/2024/09/איטום-גג-מקצועי.png';

/** Six marks for the "why us" strip, in the order the source lists them. */
const TRUST_ICONS = ['shield', 'building', 'tag', 'clock', 'spark', 'star'];

/**
 * Splits the homepage blocks into the roles the landing layout needs.
 * Anything not claimed by a role falls through to `article`, so a block can
 * never be dropped by accident.
 */
function plan(blocks) {
  const used = new Set();
  const take = (b) => { if (b) used.add(b); return b; };
  const find = (pred) => blocks.find(b => !used.has(b) && pred(b));
  const headingLike = (re) => find(b => b.type === 'heading' && re.test(b.text || ''));

  const h1 = take(find(b => b.type === 'heading' && b.level === 1));
  const lede = take(find(b => b.type === 'richtext'));

  // "למה לבחור דווקא בנו?" + the six reasons under it
  const trustHeading = take(headingLike(/^למה לבחור/));
  const trustList = take(find(b => b.type === 'list' && b.items.length >= 5));

  // A label and its list are adjacent in the source, so pair them by position -
  // matching on shape alone would hand the services grid the 3-item area list.
  const nextOfType = (after, type) => {
    if (!after) return null;
    const at = blocks.indexOf(after);
    for (let i = at + 1; i < blocks.length && i <= at + 3; i++) {
      if (blocks[i].type === type && !used.has(blocks[i])) return blocks[i];
    }
    return null;
  };

  // "בין השירותים שלנו" + the service links
  const servicesLabel = take(find(b => b.type === 'button' && /השירותים/.test(b.text || '')));
  const servicesList = take(nextOfType(servicesLabel, 'list'));

  // "אזורי שירות" + its three links
  const areasLabel = take(find(b => b.type === 'button' && /אזורי שירות/.test(b.text || '')));
  const areasList = take(nextOfType(areasLabel, 'list'));

  // lead form and the price calculator
  const formHeading = take(headingLike(/^השאירו פרטים/));
  const form = take(find(b => b.type === 'form'));
  const calcHeading = take(headingLike(/^מחשבון/));
  const calc = take(find(b => b.type === 'html' && /calculator|מחשב|quiz|option-button/i.test(b.html)));

  // the dark band
  const bandHeading = take(headingLike(/^מומחים באיטום/));
  // the paragraph that belongs to that heading is the one directly after it
  const bandText = take((() => {
    if (!bandHeading) return null;
    const at = blocks.indexOf(bandHeading);
    for (let i = at + 1; i < blocks.length; i++) {
      if (blocks[i].type === 'richtext' && !used.has(blocks[i])) return blocks[i];
      if (blocks[i].type === 'heading') break;
    }
    return null;
  })());

  // closing contact block
  const contactLabel = take(find(b => b.type === 'button' && /צרו איתנו קשר/.test(b.text || '')));
  const contactForm = take(find(b => b.type === 'form'));

  const article = blocks.filter(b => !used.has(b) && b.region === 'article');
  article.forEach(b => used.add(b));

  const rest = blocks.filter(b => !used.has(b));   // sidebar widgets, tip, video…

  return {
    h1, lede,
    trustHeading, trustList,
    servicesLabel, servicesList,
    areasLabel, areasList,
    formHeading, form, calcHeading, calc,
    bandHeading, bandText,
    contactLabel, contactForm,
    article, rest,
  };
}

module.exports = { plan, SERVICE_PHOTOS, HERO_PHOTO, TRUST_ICONS };
