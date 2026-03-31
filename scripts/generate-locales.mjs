/**
 * VEX Locale Generator — Generates locale files for all missing languages
 * Uses Google Translate free API with batching and rate limiting
 * 
 * Usage: node scripts/generate-locales.mjs
 */
import fs from 'fs';
import path from 'path';

// All existing locale codes (40 languages)
const EXISTING = new Set([
  'en','ar','fr','es','de','tr','zh','hi','pt','ru',
  'ja','ko','it','nl','pl','id','ms','th','vi','fa',
  'ur','he','bn','sv','no','da','fi','el','cs','ro',
  'hu','uk','bg','hr','sk','sl','sr','lt','lv','et'
]);

// All target languages (109 total from the translation system)
const ALL_LANGUAGES = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bs', name: 'Bosnian', nativeName: 'Bosanski' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano' },
  { code: 'zh-TW', name: 'Chinese Traditional', nativeName: '繁體中文' },
  { code: 'co', name: 'Corsican', nativeName: 'Corsu' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
  { code: 'fy', name: 'Frisian', nativeName: 'Frysk' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi' },
  { code: 'hmn', name: 'Hmong', nativeName: 'Hmoob' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' },
  { code: 'rw', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'la', name: 'Latin', nativeName: 'Latina' },
  { code: 'lb', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch' },
  { code: 'mk', name: 'Macedonian', nativeName: 'Македонски' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  { code: 'mi', name: 'Maori', nativeName: 'Te Reo Māori' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'my', name: 'Myanmar', nativeName: 'မြန်မာ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'ny', name: 'Chichewa', nativeName: 'Chichewa' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'sm', name: 'Samoan', nativeName: 'Gagana Sāmoa' },
  { code: 'gd', name: 'Scots Gaelic', nativeName: 'Gàidhlig' },
  { code: 'st', name: 'Sesotho', nativeName: 'Sesotho' },
  { code: 'sn', name: 'Shona', nativeName: 'chiShona' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaaliga' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'tt', name: 'Tatar', nativeName: 'Татар' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'uz', name: 'Uzbek', nativeName: "O'zbek" },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  { code: 'xh', name: 'Xhosa', nativeName: 'isiXhosa' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
];

// Keys that should NOT be translated (keep English value)
const SKIP_TRANSLATE = new Set([
  'app.name', // "VEX" brand name
]);

// Keys that have interpolation — preserve {{var}} and {var} patterns
const INTERPOLATION_REGEX = /\{\{?\w+\}?\}/g;

const SEPARATOR = '\n§§§\n';

async function translateBatch(texts, targetLang) {
  // Join texts with separator for batch translation
  const combined = texts.join(SEPARATOR);
  // zh-TW needs special encoding
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
  
  // Split back by separator
  const parts = fullTranslated.split(/\n?§§§\n?/);
  return parts;
}

function escapeForTS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

async function generateLocale(langCode, langName, nativeName, entries) {
  // For file names with hyphens, convert to safe format
  const safeCode = langCode.replace('-', '_');
  const filePath = path.join('client', 'src', 'locales', `${safeCode}.ts`);
  
  // Skip if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`  ⏭ ${langCode} already exists, skipping`);
    return true;
  }
  
  console.log(`  🔄 Translating ${langCode} (${langName})...`);
  
  const keys = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);
  const translated = new Map();
  
  // Translate in batches of 40 to stay within URL length limits
  const BATCH_SIZE = 40;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batchKeys = keys.slice(i, i + BATCH_SIZE);
    const batchValues = values.slice(i, i + BATCH_SIZE);
    
    try {
      const results = await translateBatch(batchValues, langCode);
      
      for (let j = 0; j < batchKeys.length; j++) {
        const key = batchKeys[j];
        let translatedValue = (results[j] || batchValues[j]).trim();
        
        // Don't translate brand names
        if (SKIP_TRANSLATE.has(key)) {
          translatedValue = batchValues[j];
        }
        
        // Restore interpolation variables that might have been altered
        const originalVars = batchValues[j].match(INTERPOLATION_REGEX) || [];
        const translatedVars = translatedValue.match(INTERPOLATION_REGEX) || [];
        
        // If variables were messed up, try to fix them
        if (originalVars.length > 0 && originalVars.length !== translatedVars.length) {
          // Simple case: same number of vars, just replace
          let fixedValue = translatedValue;
          for (const ov of originalVars) {
            if (!fixedValue.includes(ov)) {
              // Try to find a mangled version and replace it
              const varName = ov.replace(/[{}]/g, '');
              const mangledRegex = new RegExp(`\\{\\s*\\{?\\s*${varName}\\s*\\}?\\s*\\}`, 'g');
              fixedValue = fixedValue.replace(mangledRegex, ov);
            }
          }
          translatedValue = fixedValue;
        }
        
        translated.set(key, translatedValue);
      }
    } catch (err) {
      console.log(`    ⚠ Batch ${i}-${i+BATCH_SIZE} failed: ${err.message}, using English`);
      for (let j = 0; j < batchKeys.length; j++) {
        translated.set(batchKeys[j], batchValues[j]);
      }
    }
    
    // Rate limit: wait between batches
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
  console.log(`  ✅ ${langCode} (${langName}) — ${translated.size} keys`);
  return true;
}

async function main() {
  // Read English locale and extract entries
  const enContent = fs.readFileSync('client/src/locales/en.ts', 'utf8');
  const entries = [];
  const regex = /^\s+'([^']+)':\s+'((?:[^'\\]|\\.)*)'/gm;
  let m;
  while ((m = regex.exec(enContent)) !== null) {
    // Unescape the value
    const value = m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    entries.push([m[1], value]);
  }
  
  // Also catch double-quoted values
  const regex2 = /^\s+'([^']+)':\s+"((?:[^"\\]|\\.)*)"/gm;
  while ((m = regex2.exec(enContent)) !== null) {
    const value = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    if (!entries.find(e => e[0] === m[1])) {
      entries.push([m[1], value]);
    }
  }
  
  console.log(`Found ${entries.length} translation keys in English locale`);
  
  // Filter to only missing languages
  const missing = ALL_LANGUAGES.filter(l => !EXISTING.has(l.code));
  console.log(`\nGenerating ${missing.length} missing locale files...\n`);
  
  let success = 0;
  let fail = 0;
  
  for (const lang of missing) {
    try {
      await generateLocale(lang.code, lang.name, lang.nativeName, entries);
      success++;
    } catch (err) {
      console.log(`  ❌ ${lang.code} failed: ${err.message}`);
      fail++;
    }
    // Delay between languages to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n==============================`);
  console.log(`Done! ${success} generated, ${fail} failed`);
  console.log(`Total locale files: ${EXISTING.size + success}`);
}

main().catch(console.error);
