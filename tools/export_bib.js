/* Export tools/pubdata.json -> tools/publications.bib (BibTeX).
   Useful as a starting .bib and for the Hugo version's `academic import`.
   Run:  node tools/export_bib.js */
const fs = require('fs'), path = require('path');
const TOOLS = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(TOOLS, 'pubdata.json'), 'utf8'));
const isConf = (t) => t === 'intl-conf' || t === 'domestic-conf';
const f = (k, v) => (v || v === 0) ? `  ${k} = {${v}},\n` : '';

let out = '% Publications of Kisung Park (ISNP Lab, Gachon University)\n% Generated from tools/pubdata.json by tools/export_bib.js\n\n';
for (const p of data.publications) {
  const authors = p.authors.split(',').map((s) => s.trim()).join(' and ');
  out += `@${isConf(p.type) ? 'inproceedings' : 'article'}{${p.id},\n`;
  out += f('title', p.title);
  out += f('author', authors);
  out += f(isConf(p.type) ? 'booktitle' : 'journal', p.venue);
  out += f('year', p.year);
  out += f('doi', p.doi || '');
  out += f('keywords', p.type);     // carries intl/domestic + journal/conf
  out += '}\n\n';
}
fs.writeFileSync(path.join(TOOLS, 'publications.bib'), out);
console.log(`wrote tools/publications.bib (${data.publications.length} entries)`);
