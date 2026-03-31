/**
 * VEX Platform — Android Icon Generator
 * Generates all required Android launcher icons from the 512x512 source PNG
 * 
 * Icon types generated:
 * 1. ic_launcher.png — Legacy launcher icon (full bleed, rounded corners added by OS)
 * 2. ic_launcher_round.png — Round launcher icon (circular mask)
 * 3. ic_launcher_foreground.png — Adaptive icon foreground (108dp with safe zone)
 * 
 * Density buckets:
 * - mdpi:    48x48 (launcher), 108x108 (foreground)
 * - hdpi:    72x72 (launcher), 162x162 (foreground)
 * - xhdpi:   96x96 (launcher), 216x216 (foreground)
 * - xxhdpi:  144x144 (launcher), 324x324 (foreground)
 * - xxxhdpi: 192x192 (launcher), 432x432 (foreground)
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE = join(__dirname, '..', 'client', 'public', 'icons', 'vex-gaming-logo-512x512.png');
const ANDROID_RES = join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const BRAND_BG = '#0f1419';

const DENSITIES = [
  { name: 'mdpi',    launcher: 48,  foreground: 108 },
  { name: 'hdpi',    launcher: 72,  foreground: 162 },
  { name: 'xhdpi',   launcher: 96,  foreground: 216 },
  { name: 'xxhdpi',  launcher: 144, foreground: 324 },
  { name: 'xxxhdpi', launcher: 192, foreground: 432 },
];

async function generateIcons() {
  console.log('🎨 VEX Icon Generator — Starting...\n');
  console.log(`   Source: ${SOURCE}`);
  console.log(`   Output: ${ANDROID_RES}\n`);

  for (const density of DENSITIES) {
    const dir = join(ANDROID_RES, `mipmap-${density.name}`);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // 1. ic_launcher.png — Full logo on brand background
    await sharp(SOURCE)
      .resize(density.launcher, density.launcher, { fit: 'contain', background: BRAND_BG })
      .flatten({ background: BRAND_BG })
      .png({ quality: 100 })
      .toFile(join(dir, 'ic_launcher.png'));

    // 2. ic_launcher_round.png — Circle-masked logo
    const roundSize = density.launcher;
    const roundMask = Buffer.from(
      `<svg width="${roundSize}" height="${roundSize}">
        <circle cx="${roundSize/2}" cy="${roundSize/2}" r="${roundSize/2}" fill="white"/>
      </svg>`
    );
    await sharp(SOURCE)
      .resize(roundSize, roundSize, { fit: 'contain', background: BRAND_BG })
      .flatten({ background: BRAND_BG })
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png({ quality: 100 })
      .toFile(join(dir, 'ic_launcher_round.png'));

    // 3. ic_launcher_foreground.png — Adaptive icon foreground
    // The logo occupies the inner 66% (safe zone), rest is transparent padding
    const fgSize = density.foreground;
    const logoSize = Math.round(fgSize * 0.60); // 60% of foreground = within safe zone
    const padding = Math.round((fgSize - logoSize) / 2);

    await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: padding,
        bottom: fgSize - logoSize - padding,
        left: padding,
        right: fgSize - logoSize - padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ quality: 100 })
      .toFile(join(dir, 'ic_launcher_foreground.png'));

    console.log(`   ✅ mipmap-${density.name}: ${density.launcher}px launcher, ${density.foreground}px foreground`);
  }

  // Also generate the Play Store icon (512x512, full bleed on brand bg)
  const playStoreDir = join(ANDROID_RES, '..', '..', '..', '..', '..', 'client', 'public', 'downloads');
  await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: BRAND_BG })
    .flatten({ background: BRAND_BG })
    .png({ quality: 100 })
    .toFile(join(playStoreDir, 'vex-play-store-icon.png'));
  console.log(`   ✅ Play Store icon: 512x512`);

  // Generate notification icon (white silhouette on transparent)
  const notifDir = join(ANDROID_RES, 'drawable');
  if (!existsSync(notifDir)) mkdirSync(notifDir, { recursive: true });
  
  // Create a small notification icon
  await sharp(SOURCE)
    .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 100 })
    .toFile(join(notifDir, 'ic_notification.png'));
  console.log(`   ✅ Notification icon: 96x96`);

  console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
