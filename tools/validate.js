/* Variant (v2) validator: checks the built site for structure + no Thang refs.
   Run from site root: node tools/validate.js */
const fs = require('fs'); const path = require('path');
const ROOT = path.dirname(__dirname);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'pubdata.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(__dirname, 'content.json'), 'utf8'));
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, 'projects.json'), 'utf8')).projects || [];
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const cnt = (s, re) => (s.match(re) || []).length;
const problems = [];
const PER_PUB = 20;

const idx = read(path.join(ROOT, 'index.html'));
// homepage
if (cnt(idx, /class="articleTittle"/g) > 8) problems.push('homepage shows >8 publications');
['/#projects', '/#publications', '/#group'].forEach(a => { if (!idx.includes(`href="${a}"`)) problems.push('homepage nav/link missing ' + a); });
if (!idx.includes('id="projects"')) problems.push('homepage missing Projects section');
if (!idx.includes('custom-theme.css')) problems.push('homepage missing custom-theme.css');
['/news/', '/members/', '/project/', '/publication/'].forEach(a => { if (!idx.includes(`href="${a}"`)) problems.push('homepage missing see-all link ' + a); });

// detail pages
let ok = 0;
for (const p of data.publications) {
  const f = path.join(ROOT, 'publication', p.id, 'index.html');
  if (!exists(f)) { problems.push('missing detail ' + p.id); continue; }
  const h = read(f);
  if (!/<\/html>/.test(h) || !h.includes('<h1>') || !h.includes('navbar-brand')) problems.push('malformed detail ' + p.id);
  if (!h.includes(p.doi ? `doi.org/${p.doi}` : 'scholar.google.com/scholar?q=')) problems.push('detail link wrong ' + p.id);
  if (/thanghoang|Thang Hoang/.test(h)) problems.push('Thang ref in detail ' + p.id);
  ok++;
}

// category-organized publication listing (single page, not paginated)
const pl = read(path.join(ROOT, 'publication', 'index.html'));
if (!pl.includes('class="pub-cat-nav"')) problems.push('publication page missing category nav');
if (!pl.includes('id="featured"')) problems.push('publication page missing Featured section');
for (const g of data.groups) { const n = data.publications.filter(p => p.type === g.key).length; if (n && !pl.includes(`id="${g.key}"`)) problems.push('publication missing category ' + g.title); }
const numbered = cnt(pl, /class="pub-num"/g);
if (numbered !== data.publications.length) problems.push(`numbered pubs ${numbered} != ${data.publications.length}`);
const stars = cnt(pl, /class="pub-star"/g), featCount = data.publications.filter(p => p.featured).length;
if (stars !== featCount) problems.push(`featured stars ${stars} != ${featCount}`);
if (!pl.includes('isnp-member')) problems.push('publication page missing ISNP-member emphasis');
if (exists(path.join(ROOT, 'publication', 'page'))) problems.push('stale /publication/page/ exists');

// news / members / project listing pages
for (const [dir, label] of [['news', 'News'], ['members', 'Members'], ['project', 'Projects']]) {
  const f = path.join(ROOT, dir, 'index.html');
  if (!exists(f)) { problems.push(`missing /${dir}/`); continue; }
  const h = read(f);
  if (!/Page 1 of/.test(h)) problems.push(`/${dir}/ missing pager`);
  if (!h.includes(label)) problems.push(`/${dir}/ missing title ${label}`);
}
if (!read(path.join(ROOT, 'members', 'index.html')).includes('Alumni')) problems.push('/members/ missing Alumni');
if (cnt(read(path.join(ROOT, 'project', 'index.html')), /class="proj-num"/g) !== projects.length) problems.push('project numbering count mismatch');

console.log(`detail pages OK: ${ok}/${data.publications.length}`);
console.log(`publication: category page; numbered entries: ${numbered}; featured: ${stars}`);
console.log(`projects: ${projects.length}; news: ${content.news.length}`);
console.log(problems.length ? 'PROBLEMS:\n - ' + problems.join('\n - ') : 'ALL CHECKS PASSED');
