import fs from 'fs';
import path from 'path';

const strictMode = process.argv.includes('--strict');
const printUnchangedSamples = process.argv.includes('--print-unchanged-samples');
const localeArg = process.argv.find((arg) => arg.startsWith('--locales='));
const localeFilter = new Set(
    String(localeArg?.split('=')[1] || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace('-', '_'))
        .filter(Boolean),
);
const reportFileArg = process.argv.find((arg) => arg.startsWith('--report-file='));
const reportFilePath = reportFileArg ? path.resolve(String(reportFileArg.split('=')[1] || '').trim()) : null;

const localesDir = path.resolve('client', 'src', 'locales');
const localeRegistryFile = path.resolve('client', 'src', 'locales', 'index.ts');
const i18nFile = path.resolve('client', 'src', 'lib', 'i18n.tsx');

const localeFilePattern = /^[a-z]{2,3}(?:_[A-Z]{2})?\.ts$/;
const SKIP_EQUAL_KEYS = new Set(['app.name']);
const UNCHANGED_WARN_RATIO = 0.12;
const UNCHANGED_FAIL_RATIO = 0.28;
const UNCHANGED_FAIL_RATIO_OVERRIDES = new Map([
    ['sn.ts', 0.35],
]);
const INTERNAL_TOKEN_REGEX = /_VEX_I18N_SYNC_SEPARATOR__|_VEX_PH_[0-9]+__|__VEX_PH_[0-9]+__/i;

/**
 * @typedef {{ entries: Map<string, string>, duplicates: string[] }} ExtractedEntries
 */

/**
 * @typedef {{ key: string, missing: string[], extra: string[] }} PlaceholderMismatch
 */

/**
 * @typedef {{
 *   file: string,
 *   missing: string[],
 *   extra: string[],
 *   duplicates: string[],
 *   placeholderMismatch: PlaceholderMismatch[],
 *   emptyValues: string[],
 *   tokenLeaks: string[],
 *   unchanged: string[],
 *   unchangedRatio: number,
 *   unchangedFailRatio: number,
 * }} LocaleIssue
 */

/**
 * @typedef {{ file: string, unchangedCount: number, unchangedRatio: number, unchangedSample: string[] }} LocaleWarning
 */

/** @param {string} fileName */
function getUnchangedFailRatio(fileName) {
    return UNCHANGED_FAIL_RATIO_OVERRIDES.get(fileName) ?? UNCHANGED_FAIL_RATIO;
}

/** @param {string} content
 * @returns {ExtractedEntries}
 */
function extractEntries(content) {
    /** @type {Map<string, string>} */
    const entries = new Map();
    /** @type {Set<string>} */
    const duplicates = new Set();
    const regex = /^\s*['"`]([^'"`]+)['"`]\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,?\s*$/gm;
    /** @type {RegExpExecArray | null} */
    let match;

    while ((match = regex.exec(content)) !== null) {
        const key = match[1];
        const rawValue = match[3];

        if (entries.has(key)) {
            duplicates.add(key);
        }

        entries.set(key, rawValue);
    }

    return { entries, duplicates: Array.from(duplicates) };
}

/** @param {string} value
 * @returns {string[]}
 */
function extractPlaceholders(value) {
    /** @type {Set<string>} */
    const placeholders = new Set();
    const regex = /\{\{(\w+)\}\}|\{(\w+)\}/g;
    /** @type {RegExpExecArray | null} */
    let match;

    while ((match = regex.exec(String(value || ''))) !== null) {
        placeholders.add(match[1] || match[2]);
    }

    return Array.from(placeholders).sort();
}

/** @param {string} value */
function hasTranslatableText(value) {
    const stripped = String(value || '')
        .replace(/\{\{?\w+\}?\}/g, '')
        .trim();

    return /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF]/.test(stripped);
}

/** @param {string} value */
function containsInternalTokens(value) {
    return INTERNAL_TOKEN_REGEX.test(String(value || ''));
}

/** @param {string} fileName */
function normalizeLocaleCodeFromFile(fileName) {
    return fileName.replace(/\.ts$/, '').replace('_', '-');
}

/**
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {T[]}
 */
function setDiff(a, b) {
    return Array.from(a).filter((item) => !b.has(item));
}

/** @param {string[]} items
 * @param {number} [max]
 */
function preview(items, max = 6) {
    if (!items || items.length === 0) return '-';
    if (items.length <= max) return items.join(', ');
    return `${items.slice(0, max).join(', ')} ... (+${items.length - max})`;
}

/** @param {string} content
 * @returns {string[]}
 */
function parseLanguageTypeCodes(content) {
    const blockMatch = content.match(/export\s+type\s+Language\s*=\s*([\s\S]*?);/m);
    if (!blockMatch) return [];

    /** @type {Set<string>} */
    const codes = new Set();
    const regex = /'([a-z]{2,3}(?:-[A-Z]{2})?)'/g;
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = regex.exec(blockMatch[1])) !== null) {
        codes.add(match[1]);
    }

    return Array.from(codes).sort();
}

/** @param {string} content
 * @returns {string[]}
 */
function parseLanguageListCodes(content) {
    const blockMatch = content.match(/languages:\s*LanguageInfo\[\]\s*=\s*\[([\s\S]*?)\];/m);
    if (!blockMatch) return [];

    /** @type {Set<string>} */
    const codes = new Set();
    const regex = /code:\s*'([a-z]{2,3}(?:-[A-Z]{2})?)'/g;
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = regex.exec(blockMatch[1])) !== null) {
        codes.add(match[1]);
    }

    return Array.from(codes).sort();
}

/** @param {string} content
 * @returns {string[]}
 */
function parseRtlCodes(content) {
    const blockMatch = content.match(/const\s+rtlLanguages:\s*Language\[\]\s*=\s*\[([\s\S]*?)\];/m);
    if (!blockMatch) return [];

    /** @type {Set<string>} */
    const codes = new Set();
    const regex = /'([a-z]{2,3}(?:-[A-Z]{2})?)'/g;
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = regex.exec(blockMatch[1])) !== null) {
        codes.add(match[1]);
    }

    return Array.from(codes).sort();
}

/** @param {string} content
 * @returns {Map<string, string>}
 */
function parseLoaderMap(content) {
    /** @type {Map<string, string>} */
    const out = new Map();
    const regex = /^\s*(?:'([a-z]{2,3}(?:-[A-Z]{2})?)'|([a-z]{2,3}))\s*:\s*\(\)\s*=>\s*import\('\.\/([a-z]{2,3}(?:_[A-Z]{2})?)'\)/gm;
    /** @type {RegExpExecArray | null} */
    let match;

    while ((match = regex.exec(content)) !== null) {
        const code = match[1] || match[2];
        const fileStem = match[3];
        out.set(code, fileStem);
    }

    return out;
}

/** @param {string} message */
function fail(message) {
    console.error(`[i18n:quality] ${message}`);
    process.exit(1);
}

if (!fs.existsSync(localesDir)) {
    fail(`Locales directory not found: ${localesDir}`);
}

if (!fs.existsSync(localeRegistryFile)) {
    fail(`Locale registry not found: ${localeRegistryFile}`);
}

if (!fs.existsSync(i18nFile)) {
    fail(`i18n provider file not found: ${i18nFile}`);
}

const localeFiles = fs.readdirSync(localesDir).filter((f) => localeFilePattern.test(f)).sort();
if (!localeFiles.includes('en.ts')) {
    fail('Missing base locale file: en.ts');
}

const targetLocaleFiles = localeFiles.filter((fileName) => {
    if (fileName === 'en.ts') return true;
    if (localeFilter.size === 0) return true;
    const code = fileName.replace(/\.ts$/, '').toLowerCase();
    return localeFilter.has(code) || localeFilter.has(code.replace('_', '-'));
});

if (localeFilter.size > 0 && targetLocaleFiles.filter((f) => f !== 'en.ts').length === 0) {
    fail(`No locale files matched --locales filter: ${Array.from(localeFilter).join(', ')}`);
}

const enContent = fs.readFileSync(path.join(localesDir, 'en.ts'), 'utf8');
const { entries: enEntries, duplicates: enDuplicates } = extractEntries(enContent);

if (enEntries.size === 0) {
    fail('No translation entries found in en.ts');
}

if (enDuplicates.length > 0) {
    fail(`Duplicate keys in en.ts: ${preview(enDuplicates)}`);
}

/** @type {LocaleIssue[]} */
const issues = [];
/** @type {LocaleWarning[]} */
const warnings = [];

for (const file of targetLocaleFiles) {
    if (file === 'en.ts') continue;

    const fullPath = path.join(localesDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { entries, duplicates } = extractEntries(content);

    const missing = [];
    const extra = [];
    const placeholderMismatch = [];
    const emptyValues = [];
    const unchanged = [];
    const tokenLeaks = [];

    const entryKeys = new Set(entries.keys());
    const enKeys = new Set(enEntries.keys());

    for (const key of enKeys) {
        if (!entryKeys.has(key)) {
            missing.push(key);
            continue;
        }

        const enValue = enEntries.get(key) || '';
        const localeValue = entries.get(key) || '';

        if (!localeValue.trim()) {
            emptyValues.push(key);
        }

        if (containsInternalTokens(localeValue)) {
            tokenLeaks.push(key);
        }

        const enPh = extractPlaceholders(enValue);
        const localePh = extractPlaceholders(localeValue);

        const enPhSet = new Set(enPh);
        const localePhSet = new Set(localePh);

        const phMissing = setDiff(enPhSet, localePhSet);
        const phExtra = setDiff(localePhSet, enPhSet);

        if (phMissing.length > 0 || phExtra.length > 0) {
            placeholderMismatch.push({ key, missing: phMissing, extra: phExtra });
        }

        if (
            localeValue === enValue
            && !SKIP_EQUAL_KEYS.has(key)
            && hasTranslatableText(enValue)
        ) {
            unchanged.push(key);
        }
    }

    for (const key of entryKeys) {
        if (!enKeys.has(key)) {
            extra.push(key);
        }
    }

    const translatableBaseCount = Array.from(enEntries.entries()).filter(([k, v]) => {
        return !SKIP_EQUAL_KEYS.has(k) && hasTranslatableText(v);
    }).length;

    const unchangedRatio = translatableBaseCount > 0 ? unchanged.length / translatableBaseCount : 0;
    const unchangedFailRatio = getUnchangedFailRatio(file);

    const hasHardIssue = missing.length > 0
        || extra.length > 0
        || duplicates.length > 0
        || placeholderMismatch.length > 0
        || emptyValues.length > 0
        || tokenLeaks.length > 0;

    if (hasHardIssue || (strictMode && unchangedRatio > unchangedFailRatio)) {
        issues.push({
            file,
            missing,
            extra,
            duplicates,
            placeholderMismatch,
            emptyValues,
            tokenLeaks,
            unchanged,
            unchangedRatio,
            unchangedFailRatio,
        });
    } else if (unchangedRatio > UNCHANGED_WARN_RATIO) {
        warnings.push({
            file,
            unchangedCount: unchanged.length,
            unchangedRatio,
            unchangedSample: unchanged.slice(0, 12),
        });
    }
}

const i18nContent = fs.readFileSync(i18nFile, 'utf8');
const registryContent = fs.readFileSync(localeRegistryFile, 'utf8');

const typeCodes = new Set(parseLanguageTypeCodes(i18nContent));
const listCodes = new Set(parseLanguageListCodes(i18nContent));
const rtlCodes = new Set(parseRtlCodes(i18nContent));
const loaderMap = parseLoaderMap(registryContent);
const loaderCodes = new Set(loaderMap.keys());
const fileCodes = new Set(localeFiles.map(normalizeLocaleCodeFromFile));
const reachableLocaleCodes = new Set(loaderCodes);
reachableLocaleCodes.add('en'); // English is eagerly loaded, not in lazy loader map.

/** @type {string[]} */
const manifestIssues = [];

const typeNotInList = setDiff(typeCodes, listCodes);
if (typeNotInList.length > 0) {
    manifestIssues.push(`Language type includes codes missing in languages[]: ${preview(typeNotInList)}`);
}

const listNotInType = setDiff(listCodes, typeCodes);
if (listNotInType.length > 0) {
    manifestIssues.push(`languages[] includes codes missing in Language type: ${preview(listNotInType)}`);
}

const typeNotInLoaders = setDiff(typeCodes, reachableLocaleCodes);
if (typeNotInLoaders.length > 0) {
    manifestIssues.push(`Language type includes codes missing in locale loaders: ${preview(typeNotInLoaders)}`);
}

const loadersNotInType = setDiff(loaderCodes, typeCodes);
if (loadersNotInType.length > 0) {
    manifestIssues.push(`Locale loaders include codes missing in Language type: ${preview(loadersNotInType)}`);
}

const filesNotInLoaders = setDiff(fileCodes, reachableLocaleCodes);
if (filesNotInLoaders.length > 0) {
    manifestIssues.push(`Locale files exist but are not reachable from loaders: ${preview(filesNotInLoaders)}`);
}

const loadersNotInFiles = setDiff(loaderCodes, fileCodes);
if (loadersNotInFiles.length > 0) {
    manifestIssues.push(`Loader map references non-existing locale files: ${preview(loadersNotInFiles)}`);
}

for (const [code, fileStem] of loaderMap.entries()) {
    const expectedFile = `${fileStem}.ts`;
    if (!fs.existsSync(path.join(localesDir, expectedFile))) {
        manifestIssues.push(`Loader '${code}' points to missing file '${expectedFile}'`);
    }
}

const rtlNotInType = setDiff(rtlCodes, typeCodes);
if (rtlNotInType.length > 0) {
    manifestIssues.push(`rtlLanguages contains unknown codes: ${preview(rtlNotInType)}`);
}

console.log(`[i18n:quality] Checked ${targetLocaleFiles.length} locale files (${targetLocaleFiles.length - 1} non-English).`);

if (warnings.length > 0) {
    console.log(`[i18n:quality] Warnings (${warnings.length}) for likely untranslated content:`);
    for (const warning of warnings) {
        console.log(` - ${warning.file}: unchanged=${warning.unchangedCount} (${(warning.unchangedRatio * 100).toFixed(1)}%)`);
        if (printUnchangedSamples && warning.unchangedSample.length > 0) {
            console.log(`   unchanged samples: ${preview(warning.unchangedSample, 12)}`);
        }
    }
}

if (issues.length > 0) {
    console.log(`[i18n:quality] Hard issues found in ${issues.length} locale files:`);
    for (const issue of issues) {
        const details = [];
        if (issue.missing.length > 0) details.push(`missing=${issue.missing.length}`);
        if (issue.extra.length > 0) details.push(`extra=${issue.extra.length}`);
        if (issue.duplicates.length > 0) details.push(`duplicates=${issue.duplicates.length}`);
        if (issue.placeholderMismatch.length > 0) details.push(`placeholderMismatch=${issue.placeholderMismatch.length}`);
        if (issue.emptyValues.length > 0) details.push(`empty=${issue.emptyValues.length}`);
        if (issue.tokenLeaks.length > 0) details.push(`tokenLeak=${issue.tokenLeaks.length}`);
        if (issue.unchangedRatio > issue.unchangedFailRatio) {
            details.push(`unchanged=${issue.unchanged.length} (${(issue.unchangedRatio * 100).toFixed(1)}%)`);
        }

        console.log(` - ${issue.file}: ${details.join(' | ')}`);

        if (issue.placeholderMismatch.length > 0) {
            const sample = issue.placeholderMismatch.slice(0, 3)
                .map((p) => `${p.key}{missing:[${p.missing.join(',')}],extra:[${p.extra.join(',')}]}`);
            console.log(`   placeholder samples: ${sample.join(' ; ')}`);
        }

        if (issue.tokenLeaks.length > 0) {
            console.log(`   token leak samples: ${preview(issue.tokenLeaks)}`);
        }
    }
}

if (manifestIssues.length > 0) {
    console.log(`[i18n:quality] Manifest consistency issues (${manifestIssues.length}):`);
    for (const msg of manifestIssues) {
        console.log(` - ${msg}`);
    }
}

if (reportFilePath) {
    const report = {
        strictMode,
        localeFilter: Array.from(localeFilter),
        checkedLocaleFiles: targetLocaleFiles,
        warningCount: warnings.length,
        issueCount: issues.length,
        warnings,
        issues,
        manifestIssues,
    };
    fs.mkdirSync(path.dirname(reportFilePath), { recursive: true });
    fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[i18n:quality] Report written: ${reportFilePath}`);
}

if (issues.length === 0 && manifestIssues.length === 0) {
    console.log('[i18n:quality] OK - locale quality and manifest consistency checks passed.');
    process.exit(0);
}

if (strictMode) {
    process.exit(1);
}

console.log('[i18n:quality] Non-strict mode: exiting with success. Use --strict to fail on issues.');
