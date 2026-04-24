export function normalizeChatDraft(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasSendableDraft(value: string): boolean {
  return normalizeChatDraft(value).length > 0;
}
