import fs from 'fs';
const en = fs.readFileSync('client/src/locales/en.ts', 'utf8');
const entries = [];
const regex = /^\s*'([^']+)':\s*['"`]/gm;
let m;
while ((m = regex.exec(en)) !== null) {
  entries.push(m[1]);
}
console.log('Total keys:', entries.length);
console.log('First 5:', entries.slice(0, 5));
console.log('Last 5:', entries.slice(-5));
