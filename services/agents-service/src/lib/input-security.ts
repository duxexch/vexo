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
    if (code < 32 && !isAllowedWhitespace) continue;
    out += ch;
  }
  return out;
}

function collapseWhitespaceFn(value: string): string {
  let out = "";
  let inWhitespace = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const isWhitespace =
      ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
    if (isWhitespace) {
      if (!inWhitespace) out += " ";
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
  value = shouldCollapseWhitespace ? collapseWhitespaceFn(value) : value;
  value = value.trim();

  if (maxLength > 0 && value.length > maxLength) {
    value = value.slice(0, maxLength);
  }

  return value || fallback;
}
