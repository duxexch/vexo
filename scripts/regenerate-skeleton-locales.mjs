/**
 * VEX Locale Regenerator — Regenerates skeleton locale files (< 1KB)
 * Uses Google Translate free API with batching and rate limiting
 * 
 * Usage: node scripts/regenerate-skeleton-locales.mjs
 */
import fs from 'fs';
import path from 'path';

// Languages that need regeneration (original 37 skeleton locales, excluding en and ar which are complete)
const SKELETON_LANGUAGES = [
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
];

// Keys that should NOT be translated (keep English value)
const SKIP_TRANSLATE = new Set(['app.name']);

// Interpolation pattern
const INTERPOLATION_REGEX = /\{\{?\w+\}?\}/g;
const SEPARATOR = '\n§§§\n';

async function translateBatch(texts, targetLang) {
  const combined = texts.join(SEPARATOR);
  const tlCode = encodeURIComponent(targetLang);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${tlCode}&dt=t&q=${encodeURIComponent(combined)}`;
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${targetLang}`);
  }

  const data = await response.json();
  let fullTranslated = '';
  if (Array.isArray(data) && Array.isArray(data[0])) {
    for (const segment of data[0]) {
      if (Array.isArray(segment) && segment[0]) {
        fullTranslated += segment[0];
      }
    }
  }
  
  return fullTranslated.split(/\n?§§§\n?/);
}

function escapeForTS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

async function generateLocale(langCode, langName, nativeName, entries) {
  const safeCode = langCode.replace('-', '_');
  const filePath = path.join('client', 'src', 'locales', `${safeCode}.ts`);
  
  console.log(`  🔄 Translating ${langCode} (${langName})...`);
  
  const keys = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);
  const translated = new Map();
  
  const BATCH_SIZE = 40;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const batchValues = values.slice(i, i + BATCH_SIZE);
    
    try {
      const results = await translateBatch(batchValues, langCode);
      
      for (let j = 0; j < batchKeys.length; j++) {
        const key = batchKeys[j];
        let translatedValue = (results[j] || batchValues[j]).trim();
        
        if (SKIP_TRANSLATE.has(key)) {
          translatedValue = batchValues[j];
        }
        
        // Restore interpolation variables
        const originalVars = batchValues[j].match(INTERPOLATION_REGEX) || [];
        const translatedVars = translatedValue.match(INTERPOLATION_REGEX) || [];
        
        if (originalVars.length > 0 && originalVars.length !== translatedVars.length) {
          let fixedValue = translatedValue;
          for (const ov of originalVars) {
            if (!fixedValue.includes(ov)) {
              const varName = ov.replace(/[{}]/g, '');
              const mangledRegex = new RegExp(`\\{\\s*\\{?\\s*${varName}\\s*\\}?\\s*\\}`, 'g');
              fixedValue = fixedValue.replace(mangledRegex, ov);
            }
          }
          translatedValue = fixedValue;
        }
        
        translated.set(key, translatedValue);
      }
      
      const pct = Math.round(((i + BATCH_SIZE) / values.length) * 100);
      process.stdout.write(`\r    Progress: ${Math.min(pct, 100)}%`);
    } catch (err) {
      console.log(`\n    ⚠ Batch ${i}-${i+BATCH_SIZE} failed: ${err.message}, using English`);
      for (let j = 0; j < batchKeys.length; j++) {
        translated.set(batchKeys[j], batchValues[j]);
      }
    }
    
    if (i + BATCH_SIZE < values.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  // Generate TypeScript file
  const safeVarName = langCode.replace(/-/g, '_');
  let output = `// ${langName} (${nativeName}) translations — VEX Platform\n`;
  output += `// Auto-generated translation file\n`;
  output += `const ${safeVarName}: Record<string, string> = {\n`;
  
  for (const [key, value] of entries) {
    const tv = translated.get(key) || value;
    output += `  '${key}': '${escapeForTS(tv)}',\n`;
  }
  
  output += `};\n\n`;
  output += `export default ${safeVarName};\n`;
  
  fs.writeFileSync(filePath, output, 'utf8');
  console.log(`\n  ✅ ${langCode} (${langName}) — ${translated.size} keys`);
  return true;
}

async function main() {
  // Read English locale
  const enContent = fs.readFileSync('client/src/locales/en.ts', 'utf8');
  const entries = [];
  const regex = /^\s+'([^']+)':\s+'((?:[^'\\]|\\.)*)'/gm;
  let m;
  while ((m = regex.exec(enContent)) !== null) {
    const value = m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    entries.push([m[1], value]);
  }
  
  const regex2 = /^\s+'([^']+)':\s+"((?:[^"\\]|\\.)*)"/gm;
  while ((m = regex2.exec(enContent)) !== null) {
    const value = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    if (!entries.find(e => e[0] === m[1])) {
      entries.push([m[1], value]);
    }
  }
  
  console.log(`Found ${entries.length} translation keys in English locale`);
  
  // Only regenerate skeleton files (< 2KB)
  const toRegenerate = SKELETON_LANGUAGES.filter(lang => {
    const filePath = path.join('client', 'src', 'locales', `${lang.code}.ts`);
    if (!fs.existsSync(filePath)) return true;
    const stats = fs.statSync(filePath);
    return stats.size < 2000; // Less than 2KB = skeleton
  });
  
  console.log(`\nFound ${toRegenerate.length} skeleton locale files to regenerate:\n`);
  toRegenerate.forEach(l => console.log(`  - ${l.code} (${l.name})`));
  console.log('');
  
  let success = 0;
  let fail = 0;
  
  for (const lang of toRegenerate) {
    try {
      await generateLocale(lang.code, lang.name, lang.nativeName, entries);
      success++;
    } catch (err) {
      console.log(`  ❌ ${lang.code} failed: ${err.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log(`\n==============================`);
  console.log(`Done! ${success} regenerated, ${fail} failed`);
}

main().catch(console.error);
