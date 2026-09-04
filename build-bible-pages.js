#!/usr/bin/env node
// Generates a static, crawlable HTML page for every KJV chapter (and one
// book-index alias per book) from bible/index.html as a template, plus
// sitemap.xml and robots.txt. Run with: node build-bible-pages.js
//
// Why this exists: faithflownetwork.co.za is plain GitHub Pages (no server,
// no build step previously) — the reader used to be one single URL with all
// 1189 chapters swapped in via client-side JS state, so Google had nothing
// but the homepage to index. This bakes real per-chapter HTML files at
// build time (verse text present without JS) while the existing client
// router (see slugify/chapterPath/renderChapter in bible/index.html) takes
// over for in-app navigation after load, so it still feels like one app.
//
// Keep slugify() here byte-identical to slugify() in bible/index.html —
// both must agree on the same book-name -> URL-slug mapping.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BIBLE_DIR = path.join(ROOT, 'bible');
const SITE_ORIGIN = 'https://faithflownetwork.co.za';

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function chapterMeta(bookName, chapter) {
  return {
    title: `${bookName} ${chapter} KJV — Read Online Free | FaithFlow`,
    description: `Read ${bookName} chapter ${chapter} (King James Version) online free at FaithFlow. Full text with verse numbers — no sign-up required.`,
  };
}

const books = JSON.parse(fs.readFileSync(path.join(BIBLE_DIR, 'data', 'books.json'), 'utf8'));
const TEMPLATE = fs.readFileSync(path.join(BIBLE_DIR, 'index.html'), 'utf8');

const bookCache = new Map();
function loadBook(meta) {
  if (bookCache.has(meta.file)) return bookCache.get(meta.file);
  const data = JSON.parse(fs.readFileSync(path.join(BIBLE_DIR, 'data', 'kjv', `${meta.file}.json`), 'utf8'));
  bookCache.set(meta.file, data);
  return data;
}

function prevTarget(bookIndex, chapter) {
  if (chapter > 1) return { bookIndex, chapter: chapter - 1 };
  if (bookIndex > 0) return { bookIndex: bookIndex - 1, chapter: books[bookIndex - 1].chapters };
  return null;
}

function nextTarget(bookIndex, chapter) {
  const book = books[bookIndex];
  if (chapter < book.chapters) return { bookIndex, chapter: chapter + 1 };
  if (bookIndex < books.length - 1) return { bookIndex: bookIndex + 1, chapter: 1 };
  return null;
}

function chapterPath(bookIndex, chapter) {
  return `/bible/${slugify(books[bookIndex].name)}/${chapter}/`;
}

function verseHtml(bookName, chapter, verses) {
  const rows = verses.map((text, idx) => {
    const vnum = idx + 1;
    return `      <div class="verse"><span class="vnum">${vnum}</span><span class="vtext">${escapeHtml(text)}</span></div>
      <div class="verse-actions"><button class="copy-btn">Copy</button></div>`;
  }).join('\n');
  return `<div class="chapter-heading">${escapeHtml(bookName)} ${chapter}</div>\n${rows}`;
}

function navAnchor(id, cls, label, target) {
  const attrs = target
    ? `href="${escapeAttr(chapterPath(target.bookIndex, target.chapter))}"`
    : `href="#" aria-disabled="true"`;
  const iconLabel = id === 'prevBtn' ? ` aria-label="Previous chapter" title="Previous chapter"`
    : id === 'nextBtn' ? ` aria-label="Next chapter" title="Next chapter"`
    : '';
  return `<a id="${id}"${cls ? ` class="${cls}"` : ''} ${attrs}${iconLabel}>${label}</a>`;
}

const OLD_HEAD = `<title>FaithFlow Web — Read the King James Bible Online</title>
<meta name="description" content="Read the full King James Bible online, free, with FaithFlow Web. Sign in to pick up where you left off, or browse as a guest.">
<link rel="canonical" href="https://faithflownetwork.co.za/bible/">`;

const OLD_NAV_TOP = `<div class="chapter-nav">
        <a id="prevBtn" href="#" aria-label="Previous chapter" title="Previous chapter">‹</a>
        <a id="nextBtn" href="#" aria-label="Next chapter" title="Next chapter">›</a>
      </div>`;

const OLD_VERSE_CONTAINER = `<article id="verseContainer" class="verse-container" aria-live="polite">
      <div class="skeleton">
        <div class="skel-line" style="width:60%"></div>
        <div class="skel-line" style="width:92%"></div>
        <div class="skel-line" style="width:85%"></div>
        <div class="skel-line" style="width:70%"></div>
        <div class="skel-line" style="width:90%"></div>
      </div>
    </article>`;

const OLD_NAV_BOTTOM = `<div class="reader-toolbar bottom">
      <a id="prevBtn2" class="btn btn-ghost" href="#">‹ Previous</a>
      <a id="nextBtn2" class="btn btn-primary" href="#">Next chapter ›</a>
    </div>`;

function renderPage(bookIndex, chapter, canonicalOverride) {
  const meta = books[bookIndex];
  const data = loadBook(meta);
  const verses = data.chapters[chapter - 1];
  const { title, description } = chapterMeta(meta.name, chapter);
  const canonicalPath = canonicalOverride || chapterPath(bookIndex, chapter);
  const prev = prevTarget(bookIndex, chapter);
  const next = nextTarget(bookIndex, chapter);

  let html = TEMPLATE;

  html = html.replace(OLD_HEAD, `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${SITE_ORIGIN}${canonicalPath}">${prev ? `\n<link rel="prev" href="${SITE_ORIGIN}${chapterPath(prev.bookIndex, prev.chapter)}">` : ''}${next ? `\n<link rel="next" href="${SITE_ORIGIN}${chapterPath(next.bookIndex, next.chapter)}">` : ''}`);

  html = html.replace(OLD_NAV_TOP, `<div class="chapter-nav">
        ${navAnchor('prevBtn', null, '‹', prev)}
        ${navAnchor('nextBtn', null, '›', next)}
      </div>`);

  html = html.replace(OLD_VERSE_CONTAINER,
    `<article id="verseContainer" class="verse-container" aria-live="polite">\n      ${verseHtml(meta.name, chapter, verses)}\n    </article>`);

  html = html.replace(OLD_NAV_BOTTOM, `<div class="reader-toolbar bottom">
      ${navAnchor('prevBtn2', 'btn btn-ghost', '‹ Previous', prev)}
      ${navAnchor('nextBtn2', 'btn btn-primary', 'Next chapter ›', next)}
    </div>`);

  return html;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const sitemapUrls = [
  `${SITE_ORIGIN}/`,
  `${SITE_ORIGIN}/bible/`,
  `${SITE_ORIGIN}/privacy-policy.html`,
  `${SITE_ORIGIN}/terms-conditions.html`,
  `${SITE_ORIGIN}/data-deletion.html`,
];

let pageCount = 0;
for (let bookIndex = 0; bookIndex < books.length; bookIndex++) {
  const book = books[bookIndex];
  const slug = slugify(book.name);

  for (let chapter = 1; chapter <= book.chapters; chapter++) {
    const html = renderPage(bookIndex, chapter);
    writeFile(path.join(BIBLE_DIR, slug, String(chapter), 'index.html'), html);
    sitemapUrls.push(`${SITE_ORIGIN}${chapterPath(bookIndex, chapter)}`);
    pageCount++;
  }

  // Book-root alias (/bible/<slug>/) mirrors chapter 1's content but
  // canonicalizes to /bible/<slug>/1/ so it isn't indexed as a near-duplicate.
  const aliasHtml = renderPage(bookIndex, 1, chapterPath(bookIndex, 1));
  writeFile(path.join(BIBLE_DIR, slug, 'index.html'), aliasHtml);
}

writeFile(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapUrls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);

writeFile(path.join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);

console.log(`Generated ${pageCount} chapter pages + ${books.length} book-index aliases across ${books.length} books.`);
console.log(`sitemap.xml: ${sitemapUrls.length} URLs.`);
