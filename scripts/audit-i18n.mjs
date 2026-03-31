import fs from 'fs';
import path from 'path';

const strictMode = process.argv.includes('--strict');
const localesDir = path.resolve('client', 'src', 'locales');
const localeFilePattern = /^[a-z]{2,3}(?:_[A-Z]{2})?\.ts$/;

function extractKeys(content) {
    const keys = [];
    const duplicates = new Set();
    const seen = new Set();
    const regex = /^\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]/gm;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        keys.push(key);
        if (seen.has(key)) {
            duplicates.add(key);
        }
        seen.add(key);
    }

    return { keys, duplicates: Array.from(duplicates) };
}

function preview(items, max = 5) {
    if (items.length <= max) return items.join(', ');
    return `${items.slice(0, max).join(', ')} ... (+${items.length - max})`;
}

function fail(message) {
    console.error(`[i18n:audit] ${message}`);
    process.exit(1);
}

if (!fs.existsSync(localesDir)) {
    fail(`Locales directory not found: ${localesDir}`);
}

const localeFiles = fs.readdirSync(localesDir)
    .filter((file) => localeFilePattern.test(file))
    .sort();

if (!localeFiles.includes('en.ts')) {
    fail('Base locale file en.ts not found.');
}

const enPath = path.join(localesDir, 'en.ts');
const enContent = fs.readFileSync(enPath, 'utf8');
const { keys: enKeys, duplicates: enDuplicates } = extractKeys(enContent);

if (enKeys.length === 0) {
    fail('No translation keys found in en.ts.');
}

if (enDuplicates.length > 0) {
    fail(`Duplicate keys found in en.ts: ${preview(enDuplicates)}`);
}

const enSet = new Set(enKeys);
const problematicLocales = [];

for (const file of localeFiles) {
    if (file === 'en.ts') continue;

    const filePath = path.join(localesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { keys, duplicates } = extractKeys(content);
    const keySet = new Set(keys);

    const missing = enKeys.filter((key) => !keySet.has(key));
    const extra = keys.filter((key) => !enSet.has(key));

    if (missing.length > 0 || extra.length > 0 || duplicates.length > 0) {
        problematicLocales.push({ file, missing, extra, duplicates });
    }
}

const localeCount = localeFiles.length - 1;
if (problematicLocales.length === 0) {
    console.log(`[i18n:audit] OK - ${localeCount} locales aligned with en.ts (${enKeys.length} keys).`);
    process.exit(0);
}

console.log(`[i18n:audit] Found ${problematicLocales.length} locale files with key drift.`);
for (const issue of problematicLocales) {
    const parts = [];
    if (issue.missing.length > 0) {
        parts.push(`missing=${issue.missing.length} [${preview(issue.missing)}]`);
    }
    if (issue.extra.length > 0) {
        parts.push(`extra=${issue.extra.length} [${preview(issue.extra)}]`);
    }
    if (issue.duplicates.length > 0) {
        parts.push(`duplicates=${issue.duplicates.length} [${preview(issue.duplicates)}]`);
    }
    console.log(` - ${issue.file}: ${parts.join(' | ')}`);
}

if (strictMode) {
    process.exit(1);
}

console.log('[i18n:audit] Non-strict mode: exiting with success. Use --strict to fail on drift.');
