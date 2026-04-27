#!/usr/bin/env node
/**
 * generate-android-assets.mjs
 *
 * Generates ALL Android launcher icons + splash screen drawables from the
 * canonical VEX logo so the installed APK shows the real brand mark instead
 * of the empty white square Capacitor ships by default.
 *
 * Source asset:
 *   client/public/icons/vex-gaming-logo-512x512.png  (the largest square
 *   logo committed to the repo; 512x512 is sufficient because the densest
 *   Android launcher density — xxxhdpi — only needs 192x192 for the legacy
 *   square icon and 432x432 for the adaptive-icon foreground at 108dp.)
 *
 * Outputs (all under android/app/src/main/res/):
 *   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png             (legacy square)
 *   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png       (legacy round)
 *   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png  (Android 8+ adaptive)
 *   mipmap-anydpi-v26/ic_launcher.xml                       (adaptive ref)
 *   mipmap-anydpi-v26/ic_launcher_round.xml                 (adaptive ref)
 *   values/ic_launcher_background.xml                       (background color)
 *   drawable/splash.png                                     (Capacitor splash)
 *   drawable-port-{,h,xh,xxh,xxxh}dpi/splash.png            (portrait splashes)
 *   drawable-land-{,h,xh,xxh,xxxh}dpi/splash.png            (landscape splashes)
 *
 * Why hand-rolled instead of @capacitor/assets?
 *   The project already bundles `sharp` (transitive dep), so we avoid
 *   adding another devDependency that pulls in its own sharp version.
 *   The output layout matches what `npx cap sync android` expects, so
 *   running this script after `cap sync` simply overwrites the placeholder
 *   files Capacitor wrote.
 *
 * Idempotent: re-running overwrites the same files with identical bytes.
 *
 * Used by `.github/workflows/android-build.yml`.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..", "..");
const sourceLogo = path.join(
    projectRoot,
    "client",
    "public",
    "icons",
    "vex-gaming-logo-512x512.png",
);
const resDir = path.join(projectRoot, "android", "app", "src", "main", "res");

// Brand background color — must stay in sync with capacitor.config.ts
// (`android.backgroundColor` and SplashScreen.backgroundColor).
const BRAND_BACKGROUND = "#0f1419";

// Standard Android launcher icon densities. The "legacy" sizes are the
// square mipmap-*dpi/ic_launcher.png files used on Android 7 and below;
// the "adaptive" sizes are the 108dp safe area used on Android 8+ for
// adaptive icons (where the OS clips the foreground into a circle/squircle).
const ICON_DENSITIES = [
    { name: "mdpi", legacy: 48, adaptive: 108 },
    { name: "hdpi", legacy: 72, adaptive: 162 },
    { name: "xhdpi", legacy: 96, adaptive: 216 },
    { name: "xxhdpi", legacy: 144, adaptive: 324 },
    { name: "xxxhdpi", legacy: 192, adaptive: 432 },
];

// Splash screen densities. Capacitor's SplashScreen plugin reads
// `@drawable/splash` and Android automatically picks the best density.
// We render a square canvas (max device dimension) so the
// `androidScaleType: 'CENTER_CROP'` setting in capacitor.config.ts works
// the same on every aspect ratio.
const SPLASH_DENSITIES = [
    { name: "drawable", size: 480 },
    { name: "drawable-mdpi", size: 320 },
    { name: "drawable-hdpi", size: 480 },
    { name: "drawable-xhdpi", size: 720 },
    { name: "drawable-xxhdpi", size: 960 },
    { name: "drawable-xxxhdpi", size: 1280 },
    { name: "drawable-port-mdpi", size: 320 },
    { name: "drawable-port-hdpi", size: 480 },
    { name: "drawable-port-xhdpi", size: 720 },
    { name: "drawable-port-xxhdpi", size: 960 },
    { name: "drawable-port-xxxhdpi", size: 1280 },
    { name: "drawable-land-mdpi", size: 320 },
    { name: "drawable-land-hdpi", size: 480 },
    { name: "drawable-land-xhdpi", size: 720 },
    { name: "drawable-land-xxhdpi", size: 960 },
    { name: "drawable-land-xxxhdpi", size: 1280 },
];

function ensureDir(p) {
    mkdirSync(p, { recursive: true });
}

async function main() {
    if (!existsSync(sourceLogo)) {
        console.error(`[android-assets] Source logo not found at ${sourceLogo}`);
        console.error(`[android-assets] Cannot generate Android launcher icons.`);
        process.exit(1);
    }

    if (!existsSync(resDir)) {
        console.error(`[android-assets] Android res/ dir not found at ${resDir}`);
        console.error(
            `[android-assets] Run \`npx cap add android && npx cap sync android\` first.`,
        );
        process.exit(1);
    }

    console.log(`[android-assets] Source logo: ${sourceLogo}`);
    console.log(`[android-assets] Target res/ dir: ${resDir}`);
    console.log(`[android-assets] Brand background: ${BRAND_BACKGROUND}`);

    // ------------------------------------------------------------------
    // 1) LEGACY SQUARE LAUNCHER ICONS — used on Android 7.1 and below.
    //    The icon fills the entire square (no adaptive masking), so we
    //    composite the logo onto the brand background to avoid the
    //    "logo on white" look on devices that only honor the legacy
    //    icon path.
    // ------------------------------------------------------------------
    for (const density of ICON_DENSITIES) {
        const dir = path.join(resDir, `mipmap-${density.name}`);
        ensureDir(dir);

        const padding = Math.round(density.legacy * 0.12);
        const inner = density.legacy - padding * 2;

        // Square legacy icon (with brand background + slight inset).
        const square = await sharp({
            create: {
                width: density.legacy,
                height: density.legacy,
                channels: 4,
                background: BRAND_BACKGROUND,
            },
        })
            .composite([
                {
                    input: await sharp(sourceLogo)
                        .resize(inner, inner, { fit: "contain" })
                        .toBuffer(),
                    top: padding,
                    left: padding,
                },
            ])
            .png()
            .toBuffer();

        writeFileSync(path.join(dir, "ic_launcher.png"), square);

        // Round icon — same composite, but masked into a circle so legacy
        // launchers that prefer ic_launcher_round get a proper circle (not
        // a square clipped to a circle by the launcher itself, which often
        // looks chunky). We use an SVG circle as the mask.
        const radius = density.legacy / 2;
        const circleMask = Buffer.from(
            `<svg width="${density.legacy}" height="${density.legacy}">
                <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
            </svg>`,
        );
        const round = await sharp(square)
            .composite([{ input: circleMask, blend: "dest-in" }])
            .png()
            .toBuffer();

        writeFileSync(path.join(dir, "ic_launcher_round.png"), round);

        // ----------------------------------------------------------------
        // 2) ADAPTIVE ICON FOREGROUND — Android 8+ (API 26+). The OS
        //    composites this 108dp layer over the background color we
        //    declare in values/ic_launcher_background.xml and clips the
        //    result to the launcher's mask. The logo lives inside the
        //    inner 72dp safe area (66% of total) so it never gets cropped.
        // ----------------------------------------------------------------
        const adaptivePadding = Math.round(density.adaptive * 0.18);
        const adaptiveInner = density.adaptive - adaptivePadding * 2;

        const foreground = await sharp({
            create: {
                width: density.adaptive,
                height: density.adaptive,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .composite([
                {
                    input: await sharp(sourceLogo)
                        .resize(adaptiveInner, adaptiveInner, { fit: "contain" })
                        .toBuffer(),
                    top: adaptivePadding,
                    left: adaptivePadding,
                },
            ])
            .png()
            .toBuffer();

        writeFileSync(path.join(dir, "ic_launcher_foreground.png"), foreground);

        console.log(
            `[android-assets]   mipmap-${density.name} → ic_launcher.png (${density.legacy}px), ic_launcher_round.png, ic_launcher_foreground.png (${density.adaptive}px)`,
        );
    }

    // ------------------------------------------------------------------
    // 3) ADAPTIVE ICON XML — references the foreground PNG and the
    //    background color resource. Android 8+ launchers read these XMLs
    //    from mipmap-anydpi-v26/ in preference to the legacy square PNGs.
    // ------------------------------------------------------------------
    const anydpiDir = path.join(resDir, "mipmap-anydpi-v26");
    ensureDir(anydpiDir);

    const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
    writeFileSync(path.join(anydpiDir, "ic_launcher.xml"), adaptiveXml);
    writeFileSync(path.join(anydpiDir, "ic_launcher_round.xml"), adaptiveXml);
    console.log(
        `[android-assets]   mipmap-anydpi-v26 → ic_launcher.xml + ic_launcher_round.xml`,
    );

    // ------------------------------------------------------------------
    // 4) ADAPTIVE ICON BACKGROUND COLOR — referenced by the XML above.
    // ------------------------------------------------------------------
    const valuesDir = path.join(resDir, "values");
    ensureDir(valuesDir);

    const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND_BACKGROUND}</color>
</resources>
`;
    writeFileSync(path.join(valuesDir, "ic_launcher_background.xml"), colorsXml);
    console.log(
        `[android-assets]   values/ic_launcher_background.xml → ${BRAND_BACKGROUND}`,
    );

    // ------------------------------------------------------------------
    // 5) SPLASH SCREEN — drawable/splash.png is what the SplashScreen
    //    plugin reads (per `androidSplashResourceName: 'splash'` in
    //    capacitor.config.ts). We render a square canvas with the logo
    //    centered on the brand background so the OS-level splash screen
    //    matches the in-app theme on every aspect ratio.
    // ------------------------------------------------------------------
    for (const splash of SPLASH_DENSITIES) {
        const dir = path.join(resDir, splash.name);
        ensureDir(dir);

        // Logo is sized to ~33% of the canvas — large enough to read on
        // a phone, small enough that CENTER_CROP cannot clip it on tall
        // landscape screens.
        const logoSize = Math.round(splash.size * 0.33);
        const offset = Math.round((splash.size - logoSize) / 2);

        const splashImg = await sharp({
            create: {
                width: splash.size,
                height: splash.size,
                channels: 4,
                background: BRAND_BACKGROUND,
            },
        })
            .composite([
                {
                    input: await sharp(sourceLogo)
                        .resize(logoSize, logoSize, { fit: "contain" })
                        .toBuffer(),
                    top: offset,
                    left: offset,
                },
            ])
            .png()
            .toBuffer();

        writeFileSync(path.join(dir, "splash.png"), splashImg);
    }
    console.log(
        `[android-assets]   ${SPLASH_DENSITIES.length} splash.png variants written to drawable*/`,
    );

    console.log(`[android-assets] Done — Android launcher + splash assets regenerated.`);
}

main().catch((err) => {
    console.error(`[android-assets] FAILED: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
