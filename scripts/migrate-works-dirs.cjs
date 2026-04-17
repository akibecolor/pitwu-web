// One-shot migration: rename slug-named work dirs to 4-digit years,
// move root-level illustration files into their year dirs,
// and update all /images/works/{slug}/ paths in wp-pages.json.
const fs = require('fs');
const path = require('path');

const WORKS_DIR = path.resolve(__dirname, '../public/images/works');
const JSON_PATH = path.resolve(__dirname, '../src/data/wp-pages.json');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

// Build slug → year-folder mapping (e.g. "2020-2022" → "2020")
const slugToYear = {};
for (const song of data.songs) {
  slugToYear[song.slug] = String(song.year).slice(0, 4);
}

// 1. Rename slug directories to year directories
for (const [slug, year] of Object.entries(slugToYear)) {
  const oldDir = path.join(WORKS_DIR, slug);
  const newDir = path.join(WORKS_DIR, year);
  if (!fs.existsSync(oldDir)) { console.log(`SKIP (not found): ${slug}`); continue; }
  if (fs.existsSync(newDir)) {
    // Year dir already exists — move individual files
    for (const f of fs.readdirSync(oldDir)) {
      fs.renameSync(path.join(oldDir, f), path.join(newDir, f));
    }
    fs.rmdirSync(oldDir);
    console.log(`Merged:  ${slug}/ → ${year}/`);
  } else {
    fs.renameSync(oldDir, newDir);
    console.log(`Renamed: ${slug}/ → ${year}/`);
  }
}

// 2. Move root-level illustration files (2017.jpg, 2018.jpg)
for (const file of fs.readdirSync(WORKS_DIR)) {
  const match = file.match(/^(\d{4})\.(jpg|png)$/i);
  if (!match) continue;
  const year = match[1];
  const src = path.join(WORKS_DIR, file);
  const destDir = path.join(WORKS_DIR, year);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, file);
  fs.renameSync(src, dest);
  console.log(`Moved:   ${file} → ${year}/${file}`);
}

// 3. Update all path references in wp-pages.json
let raw = fs.readFileSync(JSON_PATH, 'utf8');
for (const [slug, year] of Object.entries(slugToYear)) {
  const from = `/images/works/${slug}/`;
  const to   = `/images/works/${year}/`;
  const before = raw;
  raw = raw.split(from).join(to);
  if (raw !== before) console.log(`Updated JSON: ${from} → ${to}`);
}
// Also fix root-level illustration refs (e.g. /images/works/2017.jpg → /images/works/2017/2017.jpg)
for (const file of ['2017.jpg', '2018.jpg']) {
  const year = file.slice(0, 4);
  const from = `/images/works/${file}`;
  const to   = `/images/works/${year}/${file}`;
  const before = raw;
  raw = raw.split(from).join(to);
  if (raw !== before) console.log(`Updated JSON: ${from} → ${to}`);
}
fs.writeFileSync(JSON_PATH, raw);

console.log('\nDone.');
