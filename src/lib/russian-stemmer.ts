/**
 * Russian Porter Stemmer — lightweight regex-based implementation
 * Handles most common Russian word endings for better BM25 matching
 * ~40 lines of regex rules, no dependencies
 */

// Step 1: Remove perfective gerunds and reflexive particles
const STEP1_A = [
  /(?:ая|яв|авши|ивши|ывши|вши|в|ся|сь)$/i,
];
const STEP1_B = [
  /(?:авшись|овшись|ившись|ывшись|ившись|аясь|явшись|увшись|авшись)$/i,
];

// Step 2: Remove adjectival endings
const STEP2 = [
  /(?:ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/i,
];

// Step 3: Remove verbal endings
const STEP3 = [
  /(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ить|ыть|ает|ает|ают|ает|а|е|и|я|у|ю|л|й)$/i,
];

// Step 4: Remove noun endings
const STEP4 = [
  /(?:а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|ях|ию|ью|ю|ия|ья|ь)$/i,
];

// Step 5: Remove superlative and undouble н
const STEP5 = [
  /(?:ейш|ейше)$/i,
];

function applyStep(word: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const result = word.replace(pattern, '');
    if (result !== word && result.length > 2) return result;
  }
  return word;
}

export function russianStem(word: string): string {
  if (word.length < 3) return word.toLowerCase();
  
  let w = word.toLowerCase();
  
  // Remove reflexive particle (ся/сь)
  w = w.replace(/(?:ся|сь)$/, '');
  
  // Step 1: Perfective gerund
  const beforeStep1 = w;
  w = applyStep(w, STEP1_B);
  if (w === beforeStep1) {
    w = applyStep(w, STEP1_A);
  }
  
  // Step 2: Adjectival
  w = applyStep(w, STEP2);
  
  // Step 3: Verbal
  w = applyStep(w, STEP3);
  
  // Step 4: Noun
  w = applyStep(w, STEP4);
  
  // Step 5: Superlative / undouble
  w = applyStep(w, STEP5);
  w = w.replace(/нн$/, 'н');
  
  return w;
}

/**
 * Tokenize + stem Russian text for BM25 indexing/searching
 */
export function tokenizeAndStem(text: string): string[] {
  // Extract words (Russian + Latin + digits), minimum 2 chars
  const words = text.toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) || [];
  return words.map(w => russianStem(w));
}

/**
 * Simple tokenize without stemming (for comparison/fallback)
 */
export function tokenizeSimple(text: string): string[] {
  return (text.toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) || []);
}
