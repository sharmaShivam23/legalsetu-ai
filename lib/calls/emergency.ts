// ==========================================================
// LegalSetu — emergency detection for phone calls
// ----------------------------------------------------------
// A caller describing immediate danger needs "call 112" before any
// legal analysis. This is deliberately a small, specific keyword set:
// it runs on every utterance with no model call, so it can never be
// slow or unavailable at the moment it matters, and it errs towards
// phrases that are unambiguous ("being beaten now", "want to die").
// A false alarm costs one extra sentence; a miss costs far more.
// ==========================================================

const ENGLISH =
  /\b(kill(ing)? (me|myself)|suicid\w*|end(ing)? my (own )?life|want to die|going to die|(is|are|am) being (beaten|attacked|hit|stabbed)|beating me (up )?(right )?now|threatening to kill|raped|rape me|kidnapp?ed|abduct\w*|bleeding (heavily|badly)|unconscious|locked me (in|up)|has a (gun|knife)|burn(ing)? me|set me on fire)\b/i;

const HINDI =
  /(आत्महत्या|खुदकुशी|जान से (मार|मारने)|मार डाल|मर जाना चाहत|मरना चाहत|मार रहा है|मार रहे हैं|मार रही है|मारपीट कर रहे|बलात्कार|अपहरण|किडनैप|खून बह|बेहोश|कमरे में बंद|जला (दूँगा|दूंगा|देगा|देंगे)|आग लगा)/;

export function isEmergency(text: string): boolean {
  const t = text.normalize("NFC");
  return ENGLISH.test(t) || HINDI.test(t);
}
