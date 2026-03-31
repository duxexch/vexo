const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

interface SanitizeTextOptions {
    maxLength?: number;
    collapseWhitespace?: boolean;
    fallback?: string;
}

function toStringValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value);
}

function stripAngleBrackets(value: string): string {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch === "<" || ch === ">") continue;
        out += ch;
    }
    return out;
}

function removeControlCharacters(value: string): string {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        const ch = value[i];
        const isAllowedWhitespace = ch === "\n" || ch === "\r" || ch === "\t";
        if (code < 32 && !isAllowedWhitespace) {
            continue;
        }
        out += ch;
    }
    return out;
}

function collapseWhitespace(value: string): string {
    let out = "";
    let inWhitespace = false;

    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        const isWhitespace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";

        if (isWhitespace) {
            if (!inWhitespace) {
                out += " ";
            }
            inWhitespace = true;
            continue;
        }

        inWhitespace = false;
        out += ch;
    }

    return out;
}

export function sanitizePlainText(input: unknown, options: SanitizeTextOptions = {}): string {
    const maxLength = options.maxLength ?? 255;
    const fallback = options.fallback ?? "";
    const shouldCollapseWhitespace = options.collapseWhitespace !== false;

    let value = toStringValue(input);
    if (!value) return fallback;

    value = removeControlCharacters(value);
    value = stripAngleBrackets(value);
    value = shouldCollapseWhitespace ? collapseWhitespace(value) : value;
    value = value.trim();

    if (maxLength > 0 && value.length > maxLength) {
        value = value.slice(0, maxLength);
    }

    return value || fallback;
}

export function sanitizeNullablePlainText(input: unknown, maxLength = 255): string | null {
    const value = sanitizePlainText(input, { maxLength });
    return value.length > 0 ? value : null;
}

export function escapeSqlLikePattern(input: string): string {
    let out = "";
    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];
        if (ch === "\\" || ch === "%" || ch === "_") {
            out += "\\";
        }
        out += ch;
    }
    return out;
}

export function parseStringQueryParam(value: unknown, maxLength = 120): string {
    if (typeof value !== "string") return "";
    return sanitizePlainText(value, { maxLength });
}

function isAsciiLetterOrDigitCode(code: number): boolean {
    return (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122)
    );
}

function isAllowedEmailLocalChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    if (isAsciiLetterOrDigitCode(code)) return true;

    return (
        ch === "." ||
        ch === "!" ||
        ch === "#" ||
        ch === "$" ||
        ch === "%" ||
        ch === "&" ||
        ch === "'" ||
        ch === "*" ||
        ch === "+" ||
        ch === "/" ||
        ch === "=" ||
        ch === "?" ||
        ch === "^" ||
        ch === "_" ||
        ch === "`" ||
        ch === "{" ||
        ch === "|" ||
        ch === "}" ||
        ch === "~" ||
        ch === "-"
    );
}

function isValidDomainLabel(label: string): boolean {
    if (!label || label.length > 63) return false;

    const first = label.charCodeAt(0);
    const last = label.charCodeAt(label.length - 1);
    if (!isAsciiLetterOrDigitCode(first) || !isAsciiLetterOrDigitCode(last)) return false;

    for (let i = 0; i < label.length; i += 1) {
        const code = label.charCodeAt(i);
        const ch = label[i];
        if (isAsciiLetterOrDigitCode(code) || ch === "-") continue;
        return false;
    }

    return true;
}

export function isSafeEmailAddress(input: unknown): boolean {
    const value = typeof input === "string" ? input.trim() : "";
    if (!value || value.length > 254) return false;

    const atIndex = value.indexOf("@");
    if (atIndex <= 0 || atIndex !== value.lastIndexOf("@") || atIndex >= value.length - 3) {
        return false;
    }

    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);

    if (!local || local.length > 64 || !domain.includes(".")) return false;
    if (local.startsWith(".") || local.endsWith(".")) return false;

    for (let i = 0; i < local.length; i += 1) {
        if (!isAllowedEmailLocalChar(local[i])) return false;
    }

    const labels = domain.split(".");
    if (labels.length < 2) return false;

    for (const label of labels) {
        if (!isValidDomainLabel(label)) return false;
    }

    const tld = labels[labels.length - 1];
    if (tld.length < 2) return false;

    return true;
}

export function isSafePhoneNumber(input: unknown): boolean {
    const value = typeof input === "string" ? input.trim() : "";
    if (!value) return false;

    let digits = 0;
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        const code = value.charCodeAt(i);

        if (code >= 48 && code <= 57) {
            digits += 1;
            continue;
        }

        if (ch === "+" && i === 0) continue;
        if (ch === " " || ch === "-" || ch === "(" || ch === ")") continue;

        return false;
    }

    return digits >= 7 && digits <= 15;
}

export function isBlockedObjectKey(input: unknown): boolean {
    const key = sanitizePlainText(input, { maxLength: 64 }).toLowerCase();
    return BLOCKED_OBJECT_KEYS.has(key);
}

export function normalizeSafeObjectKey(input: unknown, fallback = "unknown"): string {
    const raw = sanitizePlainText(input, { maxLength: 64 }).toLowerCase();
    if (!raw) return fallback;
    if (BLOCKED_OBJECT_KEYS.has(raw)) return `${fallback}_key`;

    let out = "";
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        const code = raw.charCodeAt(i);
        const isAllowed = isAsciiLetterOrDigitCode(code) || ch === "_" || ch === "-" || ch === ".";
        out += isAllowed ? ch : "_";
    }

    return out || fallback;
}
