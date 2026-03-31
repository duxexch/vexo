const BANNED_WORDS_EN = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'damn', 'cunt', 'dick', 'cock', 
  'pussy', 'whore', 'slut', 'nigger', 'faggot', 'retard', 'kike', 'spic', 'chink',
  'motherfucker', 'bullshit', 'jackass', 'dumbass', 'piss', 'crap'
];

const BANNED_WORDS_AR = [
  'كس', 'زب', 'طيز', 'شرموطة', 'عرص', 'منيك', 'قحبة', 'متناك', 'خول', 'زنديق',
  'حمار', 'كلب', 'خنزير', 'ابن الشرموطة', 'ابن القحبة', 'يلعن'
];

const ALL_BANNED_WORDS = [...BANNED_WORDS_EN, ...BANNED_WORDS_AR];

const bannedPatterns: RegExp[] = ALL_BANNED_WORDS.map(word => 
  new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface FilterResult {
  isClean: boolean;
  filteredMessage: string;
  detectedWords: string[];
}

export function filterMessage(message: string): FilterResult {
  const detectedWords: string[] = [];
  let filteredMessage = message;

  for (let i = 0; i < ALL_BANNED_WORDS.length; i++) {
    const word = ALL_BANNED_WORDS[i];
    // FIX: Create fresh regex each time to avoid stateful /g lastIndex bug
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    
    if (pattern.test(filteredMessage)) {
      detectedWords.push(word);
      // Create a new regex for replacement (test() advances lastIndex on /g regex)
      const replacePattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
      filteredMessage = filteredMessage.replace(replacePattern, '***');
    }
  }

  return {
    isClean: detectedWords.length === 0,
    filteredMessage,
    detectedWords
  };
}

export function containsBannedWords(message: string): boolean {
  return ALL_BANNED_WORDS.some(word => {
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    return pattern.test(message);
  });
}

export function addCustomBannedWord(word: string): void {
  if (!ALL_BANNED_WORDS.includes(word.toLowerCase())) {
    ALL_BANNED_WORDS.push(word.toLowerCase());
    bannedPatterns.push(new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi'));
  }
}

export function removeBannedWord(word: string): void {
  const index = ALL_BANNED_WORDS.indexOf(word.toLowerCase());
  if (index > -1) {
    ALL_BANNED_WORDS.splice(index, 1);
    bannedPatterns.splice(index, 1);
  }
}

export function getBannedWordsList(): string[] {
  return [...ALL_BANNED_WORDS];
}
