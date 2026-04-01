import fs from 'fs';
import path from 'path';

const localesDir = path.resolve('client', 'src', 'locales');
const localeFilePattern = /^[a-z]{2,3}(?:_[A-Z]{2})?\.ts$/;
const SKIP_TRANSLATE = new Set(['app.name']);
const SKIP_EQUAL_KEYS = new Set(['app.name']);
const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 150;
const LOCALE_DELAY_MS = 400;
const UNCHANGED_WARN_RATIO = 0.12;
const SEPARATOR = '\n__VEX_I18N_SYNC_SEPARATOR__\n';
const PLACEHOLDER_REGEX = /\{\{?\s*[A-Za-z0-9_]+\s*\}?\}/g;
const INTERNAL_TOKEN_REGEX = /_VEX_I18N_SYNC_SEPARATOR__|_VEX_PH_[0-9]+__|__VEX_PH_[0-9]+__/i;
const UNCHANGED_FAIL_RATIO = 0.28;
const UNCHANGED_FAIL_RATIO_OVERRIDES = new Map([
    ['sn', 0.35],
]);

const localeArg = process.argv.find((arg) => arg.startsWith('--locales='));
const localeFilter = new Set(
    String(localeArg?.split('=')[1] || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace('-', '_'))
        .filter(Boolean),
);
const translateWarnUnchanged = process.argv.includes('--translate-unchanged-warn');
const keyPrefixesArg = process.argv.find((arg) => arg.startsWith('--key-prefixes='));
const keyPrefixFilter = String(keyPrefixesArg?.split('=')[1] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function shouldProcessKey(key) {
    if (keyPrefixFilter.length === 0) return true;
    return keyPrefixFilter.some((prefix) => key.startsWith(prefix));
}

function getUnchangedFailRatio(localeCode) {
    return UNCHANGED_FAIL_RATIO_OVERRIDES.get(localeCode) ?? UNCHANGED_FAIL_RATIO;
}

function toLocaleCode(fileName) {
    return fileName.replace(/\.ts$/, '').replace('_', '-');
}

function canonicalPlaceholder(token) {
    const raw = String(token || '');
    const name = raw.replace(/[{}\s]/g, '');
    const isDouble = raw.startsWith('{{');
    return isDouble ? `{{${name}}}` : `{${name}}`;
}

function extractPlaceholders(value) {
    return (String(value || '').match(PLACEHOLDER_REGEX) || []).map(canonicalPlaceholder);
}

function containsInternalTokens(value) {
    return INTERNAL_TOKEN_REGEX.test(String(value || ''));
}

function hasTranslatableText(value) {
    const stripped = String(value || '')
        .replace(/\{\{?\w+\}?\}/g, '')
        .trim();

    return /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF]/.test(stripped);
}

function harmonizePlaceholders(baseValue, localeValue) {
    const expected = extractPlaceholders(baseValue);
    if (expected.length === 0) {
        return String(localeValue || '');
    }

    const target = String(localeValue || '');
    const matches = [...target.matchAll(PLACEHOLDER_REGEX)];

    if (matches.length === 0) {
        return `${target} ${expected.join(' ')}`.trim();
    }

    let rebuilt = '';
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i += 1) {
        const match = matches[i];
        const matchText = match[0] || '';
        const index = typeof match.index === 'number' ? match.index : lastIndex;
        const replacement = i < expected.length ? expected[i] : '';

        rebuilt += target.slice(lastIndex, index);
        rebuilt += replacement;
        lastIndex = index + matchText.length;
    }

    rebuilt += target.slice(lastIndex);

    if (matches.length < expected.length) {
        rebuilt = `${rebuilt} ${expected.slice(matches.length).join(' ')}`.trim();
    }

    return rebuilt;
}

function escapeForTsSingleQuoted(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

function unescapeValue(raw, quote) {
    let out = String(raw || '');
    if (quote === "'") {
        out = out.replace(/\\'/g, "'");
    } else if (quote === '"') {
        out = out.replace(/\\"/g, '"');
    } else if (quote === '`') {
        out = out.replace(/\\`/g, '`');
    }

    out = out
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');

    return out;
}

function parseLocaleFile(content) {
    const entryRegex = /^\s*['"`]([^'"`]+)['"`]\s*:\s*(['"`])((?:\\.|(?!\2).)*)\2\s*,?\s*$/gm;
    const entries = new Map();

    let match;
    while ((match = entryRegex.exec(content)) !== null) {
        const key = match[1];
        const quote = match[2];
        const rawValue = match[3];
        entries.set(key, unescapeValue(rawValue, quote));
    }

    const varMatch = content.match(/const\s+([A-Za-z0-9_]+)\s*:\s*Record<string,\s*string>\s*=\s*\{/);
    const varName = varMatch ? varMatch[1] : null;
    const constIndex = varMatch ? content.indexOf(varMatch[0]) : -1;
    const header = constIndex > -1 ? content.slice(0, constIndex).trimEnd() : '';

    return { entries, varName, header };
}

function parseEnglishEntries() {
    const enPath = path.join(localesDir, 'en.ts');
    if (!fs.existsSync(enPath)) {
        throw new Error('Base locale file en.ts not found.');
    }

    const enContent = fs.readFileSync(enPath, 'utf8');
    const { entries } = parseLocaleFile(enContent);
    const orderedEntries = [...entries.entries()];

    if (orderedEntries.length === 0) {
        throw new Error('No keys found in en.ts.');
    }

    return orderedEntries;
}

async function sleep(ms) {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function protectPlaceholders(value) {
    const placeholders = [];
    const safe = String(value || '').replace(PLACEHOLDER_REGEX, (token) => {
        const idx = placeholders.length;
        placeholders.push(canonicalPlaceholder(token));
        return `__VEX_PH_${idx}__`;
    });

    return { safe, placeholders };
}

function restorePlaceholders(value, placeholders) {
    let out = String(value || '');
    placeholders.forEach((placeholder, idx) => {
        const tokenRegex = new RegExp(`__\\s*VEX\\s*_?\\s*PH\\s*_?\\s*${idx}\\s*__`, 'gi');
        out = out.replace(tokenRegex, placeholder);
    });
    return out;
}

async function translateBatch(texts, targetLang) {
    if (texts.length === 0) return [];

    const combined = texts.join(SEPARATOR);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(combined)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Translation API failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    let full = '';
    if (Array.isArray(data) && Array.isArray(data[0])) {
        for (const segment of data[0]) {
            if (Array.isArray(segment) && typeof segment[0] === 'string') {
                full += segment[0];
            }
        }
    }

    const parts = full.split(/\n?__VEX_I18N_SYNC_SEPARATOR__\n?/);
    if (parts.length === texts.length) {
        return parts;
    }

    const fallbackResults = [];
    for (const text of texts) {
        const fallbackCombinedUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const fallbackResponse = await fetch(fallbackCombinedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(30000),
        });

        if (!fallbackResponse.ok) {
            throw new Error(`Translation API fallback failed with HTTP ${fallbackResponse.status}`);
        }

        const fallbackData = await fallbackResponse.json();
        let translatedText = '';
        if (Array.isArray(fallbackData) && Array.isArray(fallbackData[0])) {
            for (const segment of fallbackData[0]) {
                if (Array.isArray(segment) && typeof segment[0] === 'string') {
                    translatedText += segment[0];
                }
            }
        }

        fallbackResults.push(translatedText);
        await sleep(60);
    }

    return fallbackResults;
}

async function translatePairs(pairs, localeCode) {
    if (pairs.length === 0) {
        return new Map();
    }

    const translated = new Map();
    const batches = [];
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        batches.push(pairs.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
        const prepared = batch.map(([key, value]) => {
            if (SKIP_TRANSLATE.has(key)) {
                return { key, base: value, protectedText: value, placeholders: [] };
            }
            const { safe, placeholders } = protectPlaceholders(value);
            return { key, base: value, protectedText: safe, placeholders };
        });

        const toTranslate = prepared.map((item) => item.protectedText);

        try {
            const results = await translateBatch(toTranslate, localeCode);
            for (let i = 0; i < prepared.length; i += 1) {
                const item = prepared[i];
                let value = (results[i] || item.base || '').trim();
                if (SKIP_TRANSLATE.has(item.key)) {
                    value = item.base;
                }
                value = restorePlaceholders(value, item.placeholders);
                if (containsInternalTokens(value)) {
                    value = item.base;
                }
                value = harmonizePlaceholders(item.base, value);
                translated.set(item.key, value || item.base);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.log(`    ! Translation fallback for batch in ${localeCode}: ${reason}`);
            for (const [key, base] of batch) {
                translated.set(key, base);
            }
        }

        await sleep(BATCH_DELAY_MS);
    }

    return translated;
}

function buildLocaleFileContent(varName, header, entries) {
    let out = '';
    if (header) {
        out += `${header}\n`;
    }
    out += `const ${varName}: Record<string, string> = {\n`;
    for (const [key, value] of entries) {
        out += `  '${key}': '${escapeForTsSingleQuoted(value)}',\n`;
    }
    out += `};\n\n`;
    out += `export default ${varName};\n`;
    return out;
}

async function syncLocaleFile(fileName, enEntries) {
    const filePath = path.join(localesDir, fileName);
    const localeCode = toLocaleCode(fileName);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = parseLocaleFile(fileContent);

    if (!parsed.varName) {
        throw new Error(`Unable to determine locale variable name in ${fileName}`);
    }

    const existing = parsed.entries;
    const missingPairs = [];
    const contaminatedPairs = [];
    const nextEntries = [];
    const currentByKey = new Map();
    const enByKey = new Map(enEntries);
    let placeholderFixedCount = 0;
    let contaminatedFixedCount = 0;

    const refreshNextEntries = () => {
        for (let i = 0; i < nextEntries.length; i += 1) {
            const [key] = nextEntries[i];
            if (currentByKey.has(key)) {
                nextEntries[i] = [key, currentByKey.get(key) || ''];
            }
        }
    };

    for (const [key, enValue] of enEntries) {
        if (!shouldProcessKey(key)) {
            const preserved = existing.has(key) ? (existing.get(key) || '') : enValue;
            nextEntries.push([key, preserved]);
            currentByKey.set(key, preserved);
            continue;
        }

        if (!existing.has(key)) {
            missingPairs.push([key, enValue]);
            continue;
        }
        let currentValue = existing.get(key) || '';
        if (containsInternalTokens(currentValue)) {
            contaminatedPairs.push([key, enValue]);
            contaminatedFixedCount += 1;
            currentValue = enValue;
        }
        const fixedValue = harmonizePlaceholders(enValue, currentValue);
        if (fixedValue !== currentValue) {
            placeholderFixedCount += 1;
        }
        nextEntries.push([key, fixedValue]);
        currentByKey.set(key, fixedValue);
    }

    const translatedMissing = await translatePairs(missingPairs, localeCode);
    for (const [key, enValue] of enEntries) {
        if (existing.has(key)) continue;
        const translated = translatedMissing.get(key) || enValue;
        nextEntries.push([key, translated]);
        currentByKey.set(key, translated);
    }

    const translatedContaminated = await translatePairs(contaminatedPairs, localeCode);
    for (const [key, enValue] of contaminatedPairs) {
        currentByKey.set(key, translatedContaminated.get(key) || enValue);
    }
    refreshNextEntries();

    const translatableBaseCount = enEntries.filter(([key, value]) => {
        return shouldProcessKey(key) && !SKIP_EQUAL_KEYS.has(key) && hasTranslatableText(value);
    }).length;

    const unchangedKeys = [];
    for (const [key, enValue] of enEntries) {
        if (!shouldProcessKey(key)) continue;
        if (SKIP_EQUAL_KEYS.has(key)) continue;
        if (!hasTranslatableText(enValue)) continue;
        const localeValue = currentByKey.get(key) || '';
        if (localeValue === enValue) {
            unchangedKeys.push(key);
        }
    }

    const unchangedRatio = translatableBaseCount > 0
        ? unchangedKeys.length / translatableBaseCount
        : 0;

    const unchangedFailRatio = getUnchangedFailRatio(localeCode);
    let unchangedTranslatedCount = 0;
    const shouldTranslateUnchanged = unchangedRatio > unchangedFailRatio
        || (translateWarnUnchanged && unchangedRatio > UNCHANGED_WARN_RATIO);

    if (shouldTranslateUnchanged) {
        const pairsToTranslate = unchangedKeys.map((key) => [key, enByKey.get(key) || '']);
        const translatedUnchanged = await translatePairs(pairsToTranslate, localeCode);

        for (const [key, enValue] of pairsToTranslate) {
            const translated = translatedUnchanged.get(key) || enValue;
            if (translated !== enValue) {
                unchangedTranslatedCount += 1;
            }
            currentByKey.set(key, translated);
        }
        refreshNextEntries();
    }

    const enKeySet = new Set(enEntries.map(([key]) => key));
    let extraCount = 0;
    for (const key of existing.keys()) {
        if (!enKeySet.has(key)) {
            extraCount += 1;
        }
    }

    const updatedContent = buildLocaleFileContent(parsed.varName, parsed.header, nextEntries);
    fs.writeFileSync(filePath, updatedContent, 'utf8');

    return {
        fileName,
        missingAdded: missingPairs.length,
        placeholdersFixed: placeholderFixedCount,
        contaminatedFixed: contaminatedFixedCount,
        extraRemoved: extraCount,
        unchangedTranslated: unchangedTranslatedCount,
    };
}

async function main() {
    if (!fs.existsSync(localesDir)) {
        throw new Error(`Locales directory not found: ${localesDir}`);
    }

    const files = fs.readdirSync(localesDir)
        .filter((file) => localeFilePattern.test(file))
        .sort();

    if (!files.includes('en.ts')) {
        throw new Error('en.ts not found in locales directory.');
    }

    const enEntries = parseEnglishEntries();
    const targetFiles = files.filter((file) => {
        if (file === 'en.ts') return false;
        if (localeFilter.size === 0) return true;
        const code = file.replace(/\.ts$/, '').toLowerCase();
        return localeFilter.has(code) || localeFilter.has(code.replace('_', '-'));
    });

    console.log(`[i18n:sync] Base keys: ${enEntries.length}`);
    console.log(`[i18n:sync] Target locales: ${targetFiles.length}`);
    if (keyPrefixFilter.length > 0) {
        console.log(`[i18n:sync] Key prefixes filter: ${keyPrefixFilter.join(', ')}`);
    }

    const results = [];
    for (const fileName of targetFiles) {
        process.stdout.write(`\n[i18n:sync] Processing ${fileName} ...\n`);
        const result = await syncLocaleFile(fileName, enEntries);
        results.push(result);
        process.stdout.write(
            `[i18n:sync] ${fileName}: +missing=${result.missingAdded}, placeholderFix=${result.placeholdersFixed}, contaminationFix=${result.contaminatedFixed}, -extra=${result.extraRemoved}, unchangedTranslated=${result.unchangedTranslated}\n`,
        );
        await sleep(LOCALE_DELAY_MS);
    }

    const totals = results.reduce(
        (acc, item) => {
            acc.missing += item.missingAdded;
            acc.placeholders += item.placeholdersFixed;
            acc.contamination += item.contaminatedFixed;
            acc.extra += item.extraRemoved;
            acc.unchanged += item.unchangedTranslated;
            return acc;
        },
        { missing: 0, placeholders: 0, contamination: 0, extra: 0, unchanged: 0 },
    );

    console.log('\n[i18n:sync] Completed.');
    console.log(`[i18n:sync] Total missing keys added: ${totals.missing}`);
    console.log(`[i18n:sync] Total placeholder fixes: ${totals.placeholders}`);
    console.log(`[i18n:sync] Total contamination fixes: ${totals.contamination}`);
    console.log(`[i18n:sync] Total extra keys removed: ${totals.extra}`);
    console.log(`[i18n:sync] Total unchanged entries translated: ${totals.unchanged}`);
}

main().catch((error) => {
    console.error(`[i18n:sync] Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
