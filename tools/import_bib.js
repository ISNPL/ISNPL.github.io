/* Import a BibTeX file -> tools/pubdata.json entries.
   Download a fresh .bib from your DBLP page (e.g. https://dblp.org/pid/129/2718-2.bib)
   or Google Scholar, then:
     node tools/import_bib.js <file.bib>            # preview -> tools/pubdata.imported.json
     node tools/import_bib.js <file.bib> --merge    # merge new entries into tools/pubdata.json
   Dedupe is by DOI (or normalized title). Existing entries are kept; a backup
   pubdata.bak.json is written before --merge. Review the result and run `node tools/build.js`.
   NOTE: type is guessed (@article->intl-journal, @inproceedings->intl-conf). Move Korean/domestic
   items to domestic-journal / domestic-conf and adjust `abbr` as needed. */
const fs = require('fs'), path = require('path');
const TOOLS = __dirname;
const args = process.argv.slice(2);
const merge = args.includes('--merge');
const bibPath = args.find((a) => !a.startsWith('--'));
if (!bibPath) { console.error('Usage: node tools/import_bib.js <file.bib> [--merge]'); process.exit(1); }
const raw = fs.readFileSync(bibPath, 'utf8');

/* ---- minimal brace-aware BibTeX parser ---- */
function parseBib(s) {
  const entries = []; let i = 0;
  while (i < s.length) {
    if (s[i] !== '@') { i++; continue; }
    i++;
    let type = ''; while (i < s.length && /[a-zA-Z]/.test(s[i])) type += s[i++];
    while (i < s.length && s[i] !== '{' && s[i] !== '@') i++;
    if (s[i] !== '{') continue;
    i++;
    let key = ''; while (i < s.length && s[i] !== ',' && s[i] !== '}') key += s[i++];
    if (s[i] === ',') i++;
    const fields = {};
    while (i < s.length && s[i] !== '}') {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      if (s[i] === '}') break;
      let name = ''; while (i < s.length && /[a-zA-Z0-9_:-]/.test(s[i])) name += s[i++];
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] !== '=') { while (i < s.length && s[i] !== ',' && s[i] !== '}') i++; continue; }
      i++; while (i < s.length && /\s/.test(s[i])) i++;
      let val = '';
      if (s[i] === '{') {
        let depth = 0;
        while (i < s.length) {
          const c = s[i];
          if (c === '{') { depth++; if (depth > 1) val += c; i++; continue; }
          if (c === '}') { depth--; if (depth === 0) { i++; break; } val += c; i++; continue; }
          val += c; i++;
        }
      } else if (s[i] === '"') {
        i++; while (i < s.length && s[i] !== '"') val += s[i++]; i++;
      } else { while (i < s.length && s[i] !== ',' && s[i] !== '}') val += s[i++]; }
      fields[name.toLowerCase().trim()] = val.trim();
    }
    if (s[i] === '}') i++;
    if (type) entries.push({ type: type.toLowerCase(), key: key.trim(), fields });
  }
  return entries;
}

const clean = (v) => (v || '').replace(/[{}]/g, '').replace(/\\&/g, '&').replace(/\s+/g, ' ').trim();
const normName = (n) => clean(n).replace(/\s+\d{4}$/, '').replace(/\bKi[Ss]ung Park\b/, 'Kisung Park').trim();

const ABBR = [
  [/IEEE Access/i, 'Access'], [/Internet of Things Journal/i, 'IoTJ'], [/Consumer Electronics/i, 'TCE'],
  [/Information Forensics/i, 'TIFS'], [/Intelligent Transportation/i, 'TITS'], [/Dependable and Secure/i, 'TDSC'],
  [/Network Science/i, 'TNSE'], [/\bSensors\b/i, 'Sensors'], [/\bElectronics\b/i, 'Electronics'],
  [/\bMathematics\b/i, 'Math'], [/Applied Sciences/i, 'ApplSci'], [/Applied Energy/i, 'ApplEnergy'],
  [/Internet of Things\b/i, 'IoT'], [/Systems Architecture/i, 'JSA'], [/Peer-to-Peer/i, 'PPNA'],
  [/Communication Systems/i, 'IJCS'], [/Distributed Sensor/i, 'IJDSN'], [/ICTC/i, 'ICTC'],
  [/Computer Communication and Networks|ICCCN/i, 'ICCCN'], [/ICEIC/i, 'ICEIC'], [/Computing Conference/i, 'Computing'],
];
const abbrOf = (venue) => { for (const [re, a] of ABBR) if (re.test(venue)) return a; const m = clean(venue).match(/[A-Z]{2,}/); return m ? m[0] : (clean(venue).split(' ')[0] || 'Pub'); };
const isConf = (t) => t === 'inproceedings' || t === 'conference' || t === 'proceedings';

function toPub(e) {
  const fields = e.fields;
  const authors = clean(fields.author).split(/\s+and\s+/).map(normName).filter(Boolean).join(', ');
  const base = clean(fields.journal || fields.booktitle || fields.publisher || '');
  const vp = [];
  if (fields.volume) vp.push('vol. ' + clean(fields.volume));
  if (fields.number) vp.push('no. ' + clean(fields.number));
  if (fields.pages) vp.push('pp. ' + clean(fields.pages).replace(/--/g, '-'));
  if (fields.year) vp.push(clean(fields.year));
  const venue = vp.length ? `${base}, ${vp.join(', ')}` : base;
  return {
    type: isConf(e.type) ? 'intl-conf' : 'intl-journal',
    year: parseInt(clean(fields.year), 10) || 0,
    abbr: abbrOf(base),
    title: clean(fields.title),
    authors,
    venue,
    doi: fields.doi ? clean(fields.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null,
  };
}

const parsed = parseBib(raw).filter((e) => /article|inproceedings|conference|proceedings|book/.test(e.type));
const imported = parsed.map(toPub).filter((p) => p.title);

// load existing
const pdPath = path.join(TOOLS, 'pubdata.json');
const pd = JSON.parse(fs.readFileSync(pdPath, 'utf8'));
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const seen = new Set(pd.publications.map((p) => (p.doi ? 'doi:' + p.doi.toLowerCase() : 'ti:' + normTitle(p.title))));
const nextId = (type) => {
  const pre = { 'intl-journal': 'ij', 'intl-conf': 'ic', 'domestic-journal': 'dj', 'domestic-conf': 'dc' }[type];
  let n = 1; const used = new Set(pd.publications.concat(added).map((p) => p.id));
  while (used.has(`${pre}-${String(n).padStart(2, '0')}`)) n++;
  return `${pre}-${String(n).padStart(2, '0')}`;
};
const added = [];
let skipped = 0;
for (const p of imported) {
  const k = p.doi ? 'doi:' + p.doi.toLowerCase() : 'ti:' + normTitle(p.title);
  if (seen.has(k)) { skipped++; continue; }
  seen.add(k);
  p.id = nextId(p.type);
  added.push(p);
}

console.log(`parsed ${parsed.length} bib entries -> ${imported.length} pubs; new ${added.length}, duplicate ${skipped}`);
if (merge) {
  fs.writeFileSync(path.join(TOOLS, 'pubdata.bak.json'), JSON.stringify(pd, null, 2));
  pd.publications.push(...added);
  fs.writeFileSync(pdPath, JSON.stringify(pd, null, 2));
  console.log(`merged ${added.length} into pubdata.json (backup: pubdata.bak.json). Review, fix type/abbr, then: node tools/build.js`);
} else {
  fs.writeFileSync(path.join(TOOLS, 'pubdata.imported.json'), JSON.stringify({ publications: added }, null, 2));
  console.log('wrote tools/pubdata.imported.json (preview). Re-run with --merge to add them.');
}
