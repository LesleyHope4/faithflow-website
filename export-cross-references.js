#!/usr/bin/env node
// One-time (rerun-on-data-change) export of the mobile app's
// cross_references.db into small per-book JSON files the web client can
// fetch directly — same pattern as bible/data/kjv/*.json, which is already
// an export of the mobile app's bible.db rather than the raw SQLite file
// itself. Mirrors the mobile query in
// faithflow_bible/lib/database_helper.dart#getCrossReferences: top 5
// references per verse, ranked by votes, votes > 0 only.
//
// Usage: node export-cross-references.js [path-to-cross_references.db]
// Defaults to the mobile app's asset on this machine. The .db file itself
// is a build input only — it is not committed to this repo, only the
// exported JSON is.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DEFAULT_SOURCE = 'C:/FaithFlowProject/faithflow_bible/assets/cross_references.db';
const SOURCE = process.argv[2] || DEFAULT_SOURCE;
const OUT_DIR = path.join(__dirname, 'bible', 'data', 'crossrefs');
const TOP_N = 5;

const books = JSON.parse(fs.readFileSync(path.join(__dirname, 'bible', 'data', 'books.json'), 'utf8'));
const bookByNumber = new Map(books.map((b, i) => [i + 1, b])); // cross_references.db book numbers are 1-66, confirmed identical order to books.json

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`cross_references.db not found at ${SOURCE}`);
    console.error('Pass its path explicitly: node export-cross-references.js <path>');
    process.exit(1);
  }

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });
  const db = new SQL.Database(fs.readFileSync(SOURCE));

  // Ordered so each (from_book, from_chapter, from_verse) group's rows
  // arrive highest-votes-first — we just take the first TOP_N per group.
  const result = db.exec(`
    SELECT from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end
    FROM cross_references
    WHERE votes > 0
    ORDER BY from_book, from_chapter, from_verse, votes DESC
  `)[0];
  db.close();

  // perBook[bookNumber] = { [chapter]: { [verse]: [[toBook,toChapter,startV,endV], ...] } }
  const perBook = new Map();
  let lastKey = null;
  let countInGroup = 0;

  for (const row of result.values) {
    const [fromBook, fromChapter, fromVerse, toBook, toChapter, toStart, toEnd] = row;
    const key = `${fromBook}.${fromChapter}.${fromVerse}`;
    if (key !== lastKey) { lastKey = key; countInGroup = 0; }
    if (countInGroup >= TOP_N) continue;
    countInGroup++;

    if (!perBook.has(fromBook)) perBook.set(fromBook, {});
    const chapters = perBook.get(fromBook);
    if (!chapters[fromChapter]) chapters[fromChapter] = {};
    if (!chapters[fromChapter][fromVerse]) chapters[fromChapter][fromVerse] = [];
    chapters[fromChapter][fromVerse].push([toBook, toChapter, toStart, toEnd]);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let verseCount = 0;
  for (const [bookNumber, chapters] of perBook) {
    const meta = bookByNumber.get(bookNumber);
    if (!meta) { console.warn(`Unknown book number ${bookNumber}, skipping`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${meta.file}.json`), JSON.stringify(chapters));
    for (const ch of Object.values(chapters)) verseCount += Object.keys(ch).length;
  }

  console.log(`Exported cross-references for ${perBook.size} books, ${verseCount} verses, into ${OUT_DIR}`);
}

main();
