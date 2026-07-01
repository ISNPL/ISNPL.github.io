/* ISNP Lab homepage build — VARIANT (v2): adds pagination, auto-numbered
   publications, and an auto-numbered Projects section/page.
   Run from the site root:  node tools/build.js
   Data files (tools/): pubdata.json, content.json (news+members), projects.json.
   Build owns: Publications, News, Group(Members), Projects (+ their listing pages,
   search index, sitemap). About/Experience/Teaching/Services/Contact stay as
   direct index.html edits. Idempotent. */
const fs = require('fs'), path = require('path');

const TOOLS = __dirname;
const ROOT = path.dirname(TOOLS);
const data = JSON.parse(fs.readFileSync(path.join(TOOLS, 'pubdata.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(TOOLS, 'content.json'), 'utf8'));
const projects = (JSON.parse(fs.readFileSync(path.join(TOOLS, 'projects.json'), 'utf8')).projects) || [];
const events = (() => {
  try { return (JSON.parse(fs.readFileSync(path.join(TOOLS, 'events.json'), 'utf8')).events) || []; }
  catch (e) { return []; }
})();
const calConfig = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(TOOLS, 'calendar-config.json'), 'utf8'));
    return { googleCalendarId: c.googleCalendarId || '', googleApiKey: c.googleApiKey || '', timeZone: c.timeZone || 'Asia/Seoul', monthsBack: c.monthsBack || 2, koreanHolidays: c.koreanHolidays !== false };
  } catch (e) { return { googleCalendarId: '', googleApiKey: '', timeZone: 'Asia/Seoul', monthsBack: 2, koreanHolidays: true }; }
})();
const gallery = (() => {
  try { return (JSON.parse(fs.readFileSync(path.join(TOOLS, 'gallery.json'), 'utf8')).items) || []; }
  catch (e) { return []; }
})();
const teaching = content.teaching || [];
const latestTeachYear = teaching.length ? Math.max(...teaching.map((t) => t.year)) : 0;
const log = (...a) => console.log(...a);

// Canonical site origin (GitHub Pages user site served at the root). Used for
// canonical/og URLs, the author card link, and the sitemap. Change it here only.
const SITE_URL = 'https://kisung-park.github.io';

const HOME_PUB_LIMIT = 8, HOME_NEWS_LIMIT = 8, HOME_PROJ_LIMIT = 4;
const PER_PAGE_PUB = 20, PER_PAGE_NEWS = 10, PER_PAGE_ALUMNI = 12, PER_PAGE_PROJ = 10;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ISNP Lab members (PI + current + alumni) are emphasized in author lists.
const memberNames = Array.from(new Set([
  'Kisung Park',
  ...((content.members && content.members.current) || []).map((m) => m.name),
  ...((content.members && content.members.alumni) || []).map((a) => a.name),
])).sort((a, b) => b.length - a.length);
const boldKP = (a) => {
  let s = esc(a);
  for (const name of memberNames) s = s.split(name).join(`<strong class="isnp-member">${name}</strong>`);
  return s;
};
const yy = (y) => String(y).slice(-2);
const typeLabel = (t) => (t === 'intl-conf' || t === 'domestic-conf') ? 'Conference paper' : 'Journal article';
const doiUrl = (p) => p.doi ? `https://doi.org/${p.doi}` : `https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}`;
const doiLabel = (p) => p.doi ? 'DOI' : 'Google Scholar';
const detailHref = (p) => `/publication/${p.id}/`;

const pubs = data.publications;
const groups = data.groups;

/* ---- auto numbering (per group for pubs; global for projects); top/newest = highest ---- */
for (const g of groups) {
  const items = pubs.filter((p) => p.type === g.key);
  items.forEach((p, i) => { p._num = items.length - i; });
}
// Projects: sort by start date (year+month parsed from "period"), newest first; number top = highest.
const projStartKey = (p) => {
  const s = String(p.period || '');
  const ym = s.match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})/);   // "2024.03" / "2024-3" -> year*100+month
  if (ym) return parseInt(ym[1], 10) * 100 + parseInt(ym[2], 10);
  const y = s.match(/\d{4}/); return y ? parseInt(y[0], 10) * 100 : 0;   // year only -> month 0
};
projects.sort((a, b) => projStartKey(b) - projStartKey(a));
projects.forEach((p, i) => { p._num = projects.length - i; });

/* ---- pagination helpers ---- */
function paginate(arr, per) { const out = []; for (let i = 0; i < arr.length; i += per) out.push(arr.slice(i, i + per)); return out.length ? out : [[]]; }
function pagerHtml(base, page, total) {
  const href = (p) => p === 1 ? base : `${base}page/${p}/`;
  let li = '';
  li += page > 1
    ? `<li class="page-item"><a class="page-link" href="${href(page - 1)}">&laquo; Prev</a></li>`
    : `<li class="page-item disabled"><span class="page-link">&laquo; Prev</span></li>`;
  for (let p = 1; p <= total; p++) {
    li += p === page
      ? `<li class="page-item active"><span class="page-link">${p}</span></li>`
      : `<li class="page-item"><a class="page-link" href="${href(p)}">${p}</a></li>`;
  }
  li += page < total
    ? `<li class="page-item"><a class="page-link" href="${href(page + 1)}">Next &raquo;</a></li>`
    : `<li class="page-item disabled"><span class="page-link">Next &raquo;</span></li>`;
  return `<nav class="pagination-nav" aria-label="Pagination"><ul class="pagination">${li}</ul><div class="page-info">Page ${page} of ${total}</div></nav>`;
}
const rmDir = (p) => { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); };
function writePageFiles(baseDir, baseUrl, pages, renderInner, chrome, title, desc, sitemap, wrap) {
  wrap = wrap || pageWrap;
  rmDir(path.join(baseDir, 'page'));
  const total = pages.length;
  pages.forEach((items, idx) => {
    const no = idx + 1;
    const inner = renderInner(items, no, total) + pagerHtml(baseUrl, no, total);
    const canonical = no === 1 ? baseUrl : `${baseUrl}page/${no}/`;
    const html = wrap(chrome, title, desc, canonical, inner);
    const outDir = no === 1 ? baseDir : path.join(baseDir, 'page', String(no));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    if (sitemap) sitemap.push(canonical);
  });
}

/* ---------- placeholder avatar + cv (only created if missing; never overwrite a real file the user uploaded) ---------- */
function writeAvatar() {
  const p = path.join(ROOT, 'img', 'avatar-placeholder.svg');
  if (fs.existsSync(p)) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="Profile photo placeholder">
  <rect width="400" height="400" fill="#d7dde3"/>
  <circle cx="200" cy="155" r="78" fill="#aeb8c2"/>
  <path d="M70 360c0-78 58-130 130-130s130 52 130 130z" fill="#aeb8c2"/>
  <text x="200" y="215" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.55">KP</text>
</svg>`;
  fs.writeFileSync(p, svg);
}
function writeCvPlaceholder() {
  const dir = path.join(ROOT, 'files');
  if (fs.existsSync(path.join(dir, 'cv.pdf'))) return;
  fs.mkdirSync(dir, { recursive: true });
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  const stream = 'BT /F1 20 Tf 72 760 Td (Curriculum Vitae) Tj /F1 14 Tf 0 -32 Td (Kisung Park, Ph.D.) Tj 0 -22 Td (Assistant Professor, Dept. of Smart Security, Gachon University) Tj 0 -22 Td (This is a placeholder. The full CV will be uploaded soon.) Tj ET';
  objs.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((b, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  fs.writeFileSync(path.join(dir, 'cv.pdf'), pdf, 'latin1');
}

/* ---------- publication renderers ---------- */
function pubItemHtml(p, num) {
  const numBadge = num ? `<span class="pub-num">${p._num}.</span>` : '';
  return `
<div class="pub-list-item" style="position: relative; margin-bottom: 0rem; display: flex; align-items: flex-start;">
  ${numBadge}<span class="pub-year">${yy(p.year)}</span>
  <div style="display: flex; align-items: flex-start;">
    <div class="pub-tag"><span class="pub-tag-label">${esc(p.abbr)}</span></div>
    <div style="flex-grow: 1;">
      <b class="articleTittle"><a href="${detailHref(p)}">${esc(p.title)}</a></b><br/>
      <div style="margin-left: 0rem;">
        <span class="article-metadata li-cite-author">${boldKP(p.authors)}</span><br/>
        <span class="li-cite-venue"><b>${esc(p.venue)}</b></span><br/>
        <p></p>
      </div>
    </div>
  </div>
</div>`;
}
function recentPubsHtml(limit) {
  return [...pubs].sort((a, b) => b.year - a.year).slice(0, limit).map((p) => pubItemHtml(p, false)).join('\n');
}
function groupHeading(typeKey) {
  const g = groups.find((x) => x.key === typeKey);
  const n = pubs.filter((x) => x.type === typeKey).length;
  return `\n<h3 class="pubGroupTitle" style="margin-top:1.6rem;border-bottom:2px solid #004e96;padding-bottom:.2rem;">${g.title} <small style="color:#888;font-weight:400;">(${n})</small></h3>\n`;
}
// numbered listing row: number (or star) on top, journal tag below, then content
function pubListingItem(p, mode) {
  const left = mode === 'star' ? `<span class="pub-star">&#9733;</span>` : `<span class="pub-num">${p._num}</span>`;
  return `<div class="pub-listing-item">
  <div class="pub-leftcol">${left}<span class="pub-vtag">${esc(p.abbr)}</span></div>
  <div class="pub-body">
    <div class="pub-title"><a href="${detailHref(p)}">${esc(p.title)}</a></div>
    <div class="pub-authors article-metadata">${boldKP(p.authors)}</div>
    <div class="pub-venue">${esc(p.venue)}</div>
  </div>
</div>`;
}
function catNavHtml(sections) {
  return `<div class="pub-cat-nav">` + sections.map((s) => `<a href="#${s.id}">${esc(s.title)} (${s.count})</a>`).join('') + `</div>`;
}

/* ---------- news / members renderers ---------- */
function newsItemHtml(n) {
  const d = n.highlight ? ' newsHighlightDate' : '', t = n.highlight ? ' newsHighlightTitle' : '';
  return `<div><div class="newsDate${d}">${n.date}</div><div class="newsTitle${t}">${n.html}</div></div>`;
}
function memberListHtml(list) {
  if (!list || !list.length) return '<li>(Recruiting &mdash; positions open.)</li>';
  return list.map((m) => { const meta = [m.role, m.topic].filter(Boolean).join(' &mdash; '); return `<li>${esc(m.name)}${meta ? ` | <small>${meta}</small>` : ''}</li>`; }).join('\n');
}
function alumniListHtml(list) {
  if (!list || !list.length) return '<li class="text-muted">No alumni yet.</li>';
  return list.map((a) => { const deg = [a.degree, a.year].filter(Boolean).join(' '); return `<li><span class="name">${esc(a.name)}</span>${deg ? `, ${esc(deg)}` : ''}` + (a.thesis ? `<div class="thesis"><u>Thesis:</u> ${esc(a.thesis)}</div>` : '') + (a.now ? `<div class="job">(now ${esc(a.now)})</div>` : '') + `</li>`; }).join('\n');
}
/* ---------- project renderers ---------- */
function projectCardHtml(p) {
  const meta = [esc(p.period), p.funder ? esc(p.funder) : ''].filter(Boolean).join(' &middot; ');
  const title = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
  return `<div class="project-card">
  <div><span class="proj-num">#${p._num}</span> <span class="proj-meta">${meta}</span></div>
  <h4>${title}</h4>
  ${p.role ? `<div class="proj-meta">${esc(p.role)}</div>` : ''}
  ${p.description ? `<div class="proj-desc">${esc(p.description)}</div>` : ''}
</div>`;
}

/* ---------- homepage sections ---------- */
function sectionPublications() {
  const nSCIE = pubs.filter((p) => p.type === 'intl-journal').length;
  const nIntlConf = pubs.filter((p) => p.type === 'intl-conf').length;
  return `<section id="publications" class="home-section wg-publications   "  >
    <div class="container">
<div class="row">
  <div class="col-12 col-lg-4 section-heading">
    <h1>Publication</h1>
    <div class="see-all"><a href="/publication/">All publications<i class="fas fa-angle-double-right"></i></a></div>
    <div style="padding-bottom: 1rem"><small><strong>Bold</strong> = ISNP Lab &middot; showing ${HOME_PUB_LIMIT} most recent</small><br>
      <small class="pub-counts">SCIE Journals: <strong>${nSCIE}</strong> &middot; International Conferences: <strong>${nIntlConf}</strong></small></div>
  </div>
  <div class="col-12 col-lg-8">
${recentPubsHtml(HOME_PUB_LIMIT)}
  </div>
</div>
    </div>
  </section>`;
}
function sectionNews() {
  const items = content.news.slice(0, HOME_NEWS_LIMIT).map(newsItemHtml).join('\n            ');
  return `<section id="news" class="home-section wg-news   " style="custom" >
    <div class="container">
<div class="row">
  <div class="col-12 col-lg-4 section-heading"><h1>Recent News</h1>
    <div class="see-all"><a href="/news/">All news<i class="fas fa-angle-double-right"></i></a></div>
  </div>
  <div class="col-12 col-lg-8 news">
    <div class="view-list-item">
      <i class="" aria-hidden="true"></i>
      ${items}
    </div>
  </div>
</div>
    </div>
  </section>`;
}
function sectionGroup() {
  return `<section id="group" class="home-section wg-group   " style="custom" >
    <div class="container">
<div class="row">
  <div class="col-12 col-lg-4 section-heading"><h1>Members</h1>
    <div class="see-all"><a href="/members/">All members<i class="fas fa-angle-double-right"></i></a></div>
  </div>
  <div class="col-12 col-lg-8 " >
      <div class="view-list-item">
        <i class="" aria-hidden="true"></i>
        <div>I am fortunate to work with the following members of the ISNP Lab</div>
          <h3>Current Members</h3>
          <ul>
            ${memberListHtml(content.members.current)}
          </ul>
          <h3>Join us</h3>
          <ul>
            <li>The lab is always open to highly motivated graduate / undergraduate students and postdocs. Please <a href="/#contact">contact</a> Prof. Park with your CV.</li>
          </ul>
      </div>
  </div>
</div>
    </div>
  </section>`;
}
function sectionProjects() {
  const cards = projects.slice(0, HOME_PROJ_LIMIT).map(projectCardHtml).join('\n');
  return `<section id="projects" class="home-section wg-portfolio   " style="custom" >
    <div class="container">
<div class="row">
  <div class="col-12 col-lg-4 section-heading"><h1>Projects</h1>
    <div class="see-all"><a href="/project/">All projects<i class="fas fa-angle-double-right"></i></a></div>
  </div>
  <div class="col-12 col-lg-8 ">
    <div class="proj-carousel">
      <div class="project-row">
${cards || '<p class="text-muted">Projects will be listed here.</p>'}
      </div>
    </div>
  </div>
</div>
    </div>
<script src="/js/lab-projects.js"></script>
  </section>`;
}

// one term block: "<b>2026 Spring</b><ul>...courses...</ul>"
function termBlock(t) {
  //return `<div style="margin-bottom:.6rem;"><b>${t.year} ${esc(t.term)}</b>\n<ul>\n${(t.courses || []).map((c) => `  <li>${esc(c)}</li>`).join('\n')}\n</ul></div>`; original font size
  return `<div style="margin-bottom:.6rem;"><h3>${t.year} ${esc(t.term)}</h3>\n<ul>\n${(t.courses || []).map((c) => `  <li>${esc(c)}</li>`).join('\n')}\n</ul></div>`; //updated font size
}
function sectionTeaching() {
  const cur = teaching.filter((t) => t.year === latestTeachYear);
  return `<section id="teaching" class="home-section wg-teaching   " style="custom" >
    <div class="container">
<div class="row">
  <div class="col-12 col-lg-4 section-heading"><h1>Teaching</h1>
    <div class="see-all"><a href="/teaching/">All teaching<i class="fas fa-angle-double-right"></i></a></div>
  </div>
  <div class="col-12 col-lg-8 " >
      <div class="view-list-item">
        <i class="" aria-hidden="true"></i>
        <div>Courses at Gachon University (${latestTeachYear || ''})</div>
        ${cur.map(termBlock).join('\n') || '<p class="text-muted">No courses listed.</p>'}
      </div>
  </div>
</div>
    </div>
  </section>`;
}

/* ---------- global text fixes ---------- */
function applyGlobalFixes(html) {
  return html
    .split('thanghoang.github.io').join('kisung-park.github.io')
    .split('isnpl.github.io').join('kisung-park.github.io')
    .split('kisungpark.github.io').join('kisung-park.github.io')
    .split('Thang Hoang').join('Kisung Park')
    .split('Applied Cryptograhy').join('Applied Cryptography')
    .split('thanghoang@vt.edu').join('kisung@gachon.ac.kr')
    .split('UA-68425805-1').join('')
    .split('/author/thang-hoang/avatar_hu2388996322735743103.jpg').join('/img/avatar-placeholder.svg')
    .split('/author/thang-hoang/avatar.jpg').join('/img/avatar-placeholder.svg')
    .split('VCjqqogAAAAJ').join('MbfHgJsAAAAJ')
    .split('https://github.com/thanghoang').join('https://github.com/')
    .split('/files/Thang.Hoang.CV.Academic.pdf').join('/files/cv.pdf');
}

/* ---------- chrome + page wrappers ---------- */
function extractChrome(idx) {
  const searchM = idx.match(/<aside class="search-results"[\s\S]*?<\/aside>/);
  return {
    head: idx.match(/<head>([\s\S]*?)<\/head>/)[1],
    search: searchM ? searchM[0] : '',   // search overlay (needed for the nav search button to work)
    nav: idx.match(/<nav class="navbar[\s\S]*?<\/nav>/)[0],
    tail: idx.match(/\n\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/3\.4\.1[\s\S]*<\/html>/)[0],
  };
}
function pageHead(head, title, desc, canonical) {
  return head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}">`);
}
function pageWrap(chrome, title, desc, canonicalPath, inner) {
  const head = pageHead(chrome.head, `${title} | Kisung Park`, desc, SITE_URL + canonicalPath);
  return `<!DOCTYPE html><html lang="en-us"><head>${head}</head>
<body id="top" data-spy="scroll" data-offset="70">
${chrome.search}
${chrome.nav}
<div class="pub"><div class="article-container pt-3">
${inner}
</div></div>
${chrome.tail}`;
}
// Wide wrapper (full page width like the homepage) — used for the grid-based Projects page
function pageWrapWide(chrome, title, desc, canonicalPath, inner) {
  const head = pageHead(chrome.head, `${title} | Kisung Park`, desc, SITE_URL + canonicalPath);
  return `<!DOCTYPE html><html lang="en-us"><head>${head}</head>
<body id="top" data-spy="scroll" data-offset="70">
${chrome.search}
${chrome.nav}
<div class="container wide-page pt-3">
${inner}
</div>
${chrome.tail}`;
}
function authorCard() {
  return `<div class="media author-card content-widget-hr">
      <img class="avatar mr-3 avatar-circle" src="/img/avatar-placeholder.svg" alt="Kisung Park">
      <div class="media-body">
        <h5 class="card-title"><a href="${SITE_URL}/">Kisung Park</a></h5>
        <h6 class="card-subtitle">Assistant Professor, Gachon University</h6>
        <ul class="network-icon" aria-hidden="true">
          <li><a href="/#contact"><i class="fas fa-envelope"></i></a></li>
          <li><a href="https://scholar.google.com/citations?user=MbfHgJsAAAAJ&amp;hl=en" target="_blank" rel="noopener"><i class="ai ai-google-scholar"></i></a></li>
          <li><a href="https://dblp.uni-trier.de/pid/129/2718-2.html" target="_blank" rel="noopener"><i class="ai ai-dblp"></i></a></li>
          <li><a href="https://www.linkedin.com/in/kisung-park/" target="_blank" rel="noopener"><i class="fab fa-linkedin-in"></i></a></li>
        </ul>
      </div>
    </div>`;
}
function detailPage(chrome, p) {
  const inner = `
<div class="article-container pt-3" style="padding:0;">
  <h1>${esc(p.title)}</h1>
  <div class="article-metadata"><div>${boldKP(p.authors)}</div><span class="article-date">${p.year}</span></div>
  <div class="btn-links mb-3"><a class="btn btn-outline-primary my-1 mr-1" href="${doiUrl(p)}" target="_blank" rel="noopener">${doiLabel(p)}</a></div>
</div>
<div class="article-container" style="padding:0;">
  <div class="row"><div class="col-md-1"></div><div class="col-md-10"><div class="row">
    <div class="col-12 col-md-3 pub-row-heading">Type</div><div class="col-12 col-md-9"><a href="/publication/">${typeLabel(p.type)}</a></div>
  </div></div><div class="col-md-1"></div></div>
  <div class="d-md-none space-below"></div>
  <div class="row"><div class="col-md-1"></div><div class="col-md-10"><div class="row">
    <div class="col-12 col-md-3 pub-row-heading">Publication</div><div class="col-12 col-md-9">${esc(p.venue)}</div>
  </div></div><div class="col-md-1"></div></div>
  <div class="space-below"></div>
  ${authorCard()}
</div>`;
  return pageWrap(chrome, p.title, p.venue, `/publication/${p.id}/`, inner);
}

/* ---------- rewrite index.html ---------- */
function rewriteHome() {
  let idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const replaceSection = (id, html) => {
    const re = new RegExp(`<section id="${id}"[\\s\\S]*?</section>`);
    if (re.test(idx)) idx = idx.replace(re, html); else log(`WARN: section ${id} not found`);
  };
  replaceSection('news', sectionNews());
  replaceSection('publications', sectionPublications());
  replaceSection('group', sectionGroup());
  replaceSection('teaching', sectionTeaching());
  if (/<section id="projects"[\s\S]*?<\/section>/.test(idx)) {
    idx = idx.replace(/<section id="projects"[\s\S]*?<\/section>/, sectionProjects());
  } else {
    idx = idx.replace(/(<section id="publications"[\s\S]*?<\/section>)/, `$1\n\n  ${sectionProjects()}`);
  }
  idx = idx.replace(/<!--\s*<p>I am an Assistant Professor in the department of <a href="https:\/\/cs\.vt\.edu\/"[\s\S]*?-->/, '');
  idx = applyGlobalFixes(idx);
  fs.writeFileSync(path.join(ROOT, 'index.html'), idx);
  log('index.html rewritten');
  return idx;
}

/* ---------- build pages ---------- */
function buildDetailPages(chrome) {
  const pubDir = path.join(ROOT, 'publication');
  for (const e of fs.readdirSync(pubDir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== 'page') rmDir(path.join(pubDir, e.name));
  }
  for (const p of pubs) {
    const dir = path.join(pubDir, p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), detailPage(chrome, p));
  }
  const xml = path.join(pubDir, 'index.xml'); if (fs.existsSync(xml)) fs.rmSync(xml);
  log(`generated ${pubs.length} detail pages`);
}
function buildListings(chrome, sitemap) {
  // Publications: single page organized by CATEGORY (Featured + groups), numbered per category
  rmDir(path.join(ROOT, 'publication', 'page'));
  const featured = pubs.filter((p) => p.featured);
  const sections = [];
  if (featured.length) sections.push({ id: 'featured', title: 'Featured Publications', count: featured.length, items: featured, mode: 'star' });
  for (const g of groups) { const items = pubs.filter((p) => p.type === g.key); if (items.length) sections.push({ id: g.key, title: g.title, count: items.length, items, mode: 'num' }); }
  let pubBody = `<h1>Publications</h1>\n<p><small><strong class="isnp-member">Bold</strong> = ISNP Lab member &middot; grouped by category, newest first.</small></p>\n`;
  pubBody += catNavHtml(sections);
  for (const s of sections) {
    pubBody += `\n<h3 id="${s.id}" class="pub-cat-title">${esc(s.title)} <small>(${s.count})</small></h3>\n`;
    pubBody += s.items.map((p) => pubListingItem(p, s.mode)).join('\n');
  }
  fs.writeFileSync(path.join(ROOT, 'publication', 'index.html'), pageWrap(chrome, 'Publications', 'Publications of Prof. Kisung Park (ISNP Lab, Gachon University)', '/publication/', pubBody));
  sitemap.push('/publication/');

  // News: paginated
  writePageFiles(path.join(ROOT, 'news'), '/news/', paginate(content.news, PER_PAGE_NEWS), (items) =>
    `<h1>News</h1>\n<div class="news"><div class="view-list-item">\n${items.map(newsItemHtml).join('\n')}\n</div></div>`,
    chrome, 'News', 'News from the ISNP Lab (Gachon University)', sitemap);

  // Members: current members on page 1; alumni paginated
  writePageFiles(path.join(ROOT, 'members'), '/members/', paginate(content.members.alumni, PER_PAGE_ALUMNI), (al, no) => {
    let body = `<h1>Members</h1>`;
    if (no === 1) body += `\n<h3>Current Members</h3>\n<ul>\n${memberListHtml(content.members.current)}\n</ul>`;
    body += `\n<h2 style="margin-top:1.5rem;">Alumni</h2>\n<ul>\n${alumniListHtml(al)}\n</ul>`;
    return body;
  }, chrome, 'Members', 'Members and alumni of the ISNP Lab (Gachon University)', sitemap);

  // Projects: numbered + paginated (wide, full-page-width layout like the homepage)
  writePageFiles(path.join(ROOT, 'project'), '/project/', paginate(projects, PER_PAGE_PROJ), (items) =>
    `<h1>Projects</h1>\n<p><small>Numbered automatically.</small></p>\n<div class="project-grid">\n${items.map(projectCardHtml).join('\n') || '<p class="text-muted">No projects yet.</p>'}\n</div>`,
    chrome, 'Projects', 'Research projects of the ISNP Lab (Gachon University)', sitemap, pageWrapWide);

  // Teaching: full history grouped by year (single page)
  rmDir(path.join(ROOT, 'teaching', 'page'));
  const years = [...new Set(teaching.map((t) => t.year))].sort((a, b) => b - a);
  let teachBody = `<h1>Teaching</h1>\n<p><small>Courses taught at Gachon University.</small></p>`;
  for (const y of years) {
    teachBody += `\n<h3 class="pub-cat-title">${y}</h3>\n`;
    teachBody += teaching.filter((t) => t.year === y).map((t) =>
      `<div style="margin-bottom:.6rem;"><b>${esc(t.term)}</b>\n<ul>\n${(t.courses || []).map((c) => `  <li>${esc(c)}</li>`).join('\n')}\n</ul></div>`).join('\n');
  }
  fs.mkdirSync(path.join(ROOT, 'teaching'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'teaching', 'index.html'), pageWrap(chrome, 'Teaching', 'Courses taught by Prof. Kisung Park at Gachon University', '/teaching/', teachBody));
  sitemap.push('/teaching/');

  log('generated listings: publication, news, members, project, teaching');
}

/* ---------- search index + sitemap ---------- */
function rebuildSearchIndex() {
  const file = path.join(ROOT, 'index.json');
  let keys = ['objectID', 'title', 'content', 'relpermalink', 'section'];
  try { const cur = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(cur) && cur.length) keys = Object.keys(cur[0]); } catch (e) {}
  const mk = (o) => { const x = {}; for (const k of keys) x[k] = ''; if ('tags' in x) x.tags = []; if ('categories' in x) x.categories = []; return Object.assign(x, o); };
  const entries = [mk({ objectID: 'home', title: 'Kisung Park', content: 'ISNP Lab, Gachon University. Authentication, blockchain, DID, IoT security, post-quantum cryptography.', relpermalink: '/' })];
  for (const p of pubs) entries.push(mk({ objectID: `/publication/${p.id}/`, title: p.title, content: `${p.authors}. ${p.venue}.`, relpermalink: `/publication/${p.id}/`, section: 'publication' }));
  for (const p of projects) entries.push(mk({ objectID: `/project/#${p._num}`, title: p.title, content: `${p.role || ''} ${p.funder || ''} ${p.description || ''}`, relpermalink: '/project/', section: 'project' }));
  fs.writeFileSync(file, JSON.stringify(entries));
  log(`index.json rebuilt (${entries.length} entries)`);
}
function rebuildSitemap(extra) {
  const base = SITE_URL;
  const urls = ['/', ...pubs.map((p) => `/publication/${p.id}/`), ...extra];
  const body = [...new Set(urls)].map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  const top = path.join(ROOT, 'index.xml'); if (fs.existsSync(top)) fs.rmSync(top);
  log('sitemap.xml rebuilt');
}

/* ---------- cleanup ---------- */
function cleanup() {
  rmDir(path.join(ROOT, 'kisungpark.github.io-master'));
  for (const d of ['author', 'authors', 'categories', 'tags', 'publication-type', 'publication_types', 'post', 'slides', 'talk', 'services']) rmDir(path.join(ROOT, d));
  const cv = path.join(ROOT, 'files', 'Thang.Hoang.CV.Academic.pdf'); if (fs.existsSync(cv)) fs.rmSync(cv);
  for (const f of ['404.html', 'manifest.webmanifest']) { const fp = path.join(ROOT, f); if (fs.existsSync(fp)) fs.writeFileSync(fp, applyGlobalFixes(fs.readFileSync(fp, 'utf8'))); }
  const adm = path.join(ROOT, 'admin', 'config.yml'); if (fs.existsSync(adm)) fs.writeFileSync(adm, applyGlobalFixes(fs.readFileSync(adm, 'utf8')));
  log('cleanup + global fixes done');
}

/* ---------- lab calendar (/calendar/) ---------- */
function buildCalendar(chrome, sitemap) {
  const sorted = events.slice().sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
  // escape '<' so embedded data can never break out of the <script> tag
  const dataJson = JSON.stringify(sorted).replace(/</g, '\\u003c');
  const cfgJson = JSON.stringify(calConfig).replace(/</g, '\\u003c');
  const synced = !!(calConfig.googleCalendarId && calConfig.googleApiKey);
  const note = synced
    ? 'Synced from Google Calendar.'
    : 'ISNP Lab schedule &mdash; seminars, group meetings, deadlines, and events. Times are local (KST).';
  const inner = `<div class="cal-wrap">
  <h1>Lab Calendar</h1>
  <p><small>${note}</small></p>
  <div id="lab-calendar"></div>
  <div class="cal-up">
    <h2>Upcoming Events</h2>
    <div id="lab-upcoming"></div>
  </div>
</div>
<script>window.LAB_CAL_CONFIG = ${cfgJson}; window.LAB_EVENTS = ${dataJson};</script>
<script src="/js/lab-calendar.js"></script>`;
  const dir = path.join(ROOT, 'calendar');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'),
    pageWrapWide(chrome, 'Calendar', 'ISNP Lab schedule and upcoming events.', '/calendar/', inner));
  sitemap.push('/calendar/');
  log(`generated /calendar/ (${synced ? 'Google Calendar sync ON' : events.length + ' local events (events.json)'})`);
}

/* ---------- gallery (/gallery/) ---------- */
function buildGallery(chrome, sitemap) {
  // each box may hold one image ("src") or several ("images":[...]) -> normalize to {images,caption,date}
  const norm = gallery.map((g) => {
    const images = Array.isArray(g.images) ? g.images.filter(Boolean) : (g.src ? [g.src] : []);
    return { images, caption: g.caption || '', date: g.date || '' };
  }).filter((g) => g.images.length);
  const cards = norm.map((g, i) => {
    const cap = g.caption
      ? `<figcaption class="gal-cap">${esc(g.caption)}${g.date ? ` <span class="gal-date">${esc(g.date)}</span>` : ''}</figcaption>`
      : '';
    const badge = g.images.length > 1
      ? `<span class="gal-badge"><i class="fas fa-images" aria-hidden="true"></i> ${g.images.length}</span>` : '';
    return `<figure class="gal-item" data-gi="${i}"><div class="gal-thumb"><img src="${esc(g.images[0])}" alt="${esc(g.caption || 'Gallery image')}" loading="lazy">${badge}</div>${cap}</figure>`;
  }).join('\n');
  const dataJson = JSON.stringify(norm).replace(/</g, '\\u003c');
  const inner = `<div class="gal-wrap">
  <h1>Gallery</h1>
  <p><small>ISNP Lab moments.</small></p>
  ${norm.length ? `<div class="gal-grid">\n${cards}\n</div>` : '<p class="text-muted">No photos yet.</p>'}
</div>
<script>window.LAB_GALLERY = ${dataJson};</script>
<script src="/js/lab-gallery.js"></script>`;
  const dir = path.join(ROOT, 'gallery');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'),
    pageWrapWide(chrome, 'Gallery', 'ISNP Lab photo gallery.', '/gallery/', inner));
  sitemap.push('/gallery/');
  log(`generated /gallery/ (${norm.length} boxes, ${norm.reduce((n, g) => n + g.images.length, 0)} photos)`);
}

/* ===== run ===== */
writeAvatar();
writeCvPlaceholder();
const idx = rewriteHome();
const chrome = extractChrome(idx);
buildDetailPages(chrome);
const sitemap = [];
buildListings(chrome, sitemap);
buildCalendar(chrome, sitemap);
buildGallery(chrome, sitemap);
rebuildSearchIndex();
rebuildSitemap(sitemap);
cleanup();
log('\nBUILD COMPLETE (variant v2)');
