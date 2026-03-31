import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const baseUrl = (process.env.CSP_BASE_URL || process.env.BASE_URL || "http://localhost:3011").replace(/\/$/, "");

function fail(message, details) {
    if (details !== undefined) {
        console.error(`[security:csp] ${message}`, details);
    } else {
        console.error(`[security:csp] ${message}`);
    }
    process.exit(1);
}

function parseDirectives(cspHeader) {
    const directives = new Map();
    for (const rawDirective of cspHeader.split(";")) {
        const trimmed = rawDirective.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(/\s+/);
        const name = parts[0]?.toLowerCase();
        const values = parts.slice(1);
        if (!name) continue;
        directives.set(name, values);
    }
    return directives;
}

function findIndexHtmlPath() {
    const candidates = [
        path.resolve("dist", "public", "index.html"),
        path.resolve("client", "index.html"),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function computeInlineScriptHashes(html) {
    const hashes = new Set();
    const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let match = null;

    while ((match = inlineScriptRegex.exec(html)) !== null) {
        const scriptContent = match[1];
        if (!scriptContent || scriptContent.trim().length === 0) {
            continue;
        }
        const hash = crypto.createHash("sha256").update(scriptContent).digest("base64");
        hashes.add(`'sha256-${hash}'`);
    }

    return Array.from(hashes);
}

async function main() {
    const response = await fetch(`${baseUrl}/`, { redirect: "follow" });
    if (!response.ok) {
        fail(`Failed to fetch ${baseUrl}/`, `status=${response.status}`);
    }

    const cspHeader = response.headers.get("content-security-policy");
    if (!cspHeader) {
        fail("Missing Content-Security-Policy header on runtime response");
    }

    const directives = parseDirectives(cspHeader);
    const scriptSrc = directives.get("script-src") || [];
    const scriptSrcAttr = directives.get("script-src-attr") || [];
    const objectSrc = directives.get("object-src") || [];

    if (scriptSrc.includes("'unsafe-inline'")) {
        fail("script-src contains 'unsafe-inline' which must be removed");
    }

    if (!scriptSrc.includes("'self'")) {
        fail("script-src is missing 'self'");
    }

    if (!scriptSrcAttr.includes("'none'")) {
        fail("script-src-attr must include 'none'");
    }

    if (!objectSrc.includes("'none'")) {
        fail("object-src must include 'none'");
    }

    const htmlPath = findIndexHtmlPath();
    if (!htmlPath) {
        fail("Could not find index.html in dist/public or client");
    }

    const html = fs.readFileSync(htmlPath, "utf-8");
    const requiredHashes = computeInlineScriptHashes(html);

    for (const hash of requiredHashes) {
        if (!scriptSrc.includes(hash)) {
            fail(`Missing inline script hash in CSP: ${hash}`);
        }
    }

    console.log(`[security:csp] PASS runtime header validation (${baseUrl}/)`);
    console.log(`[security:csp] PASS script-src strictness (no unsafe-inline)`);
    console.log(`[security:csp] PASS inline hash coverage (${requiredHashes.length} hashes)`);
}

main().catch((error) => {
    fail("Unexpected CSP validation error", error instanceof Error ? error.message : String(error));
});
