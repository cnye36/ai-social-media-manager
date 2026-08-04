import { AI_DETECTOR_EVASION_CORE } from './detector-evasion-core'

export const REDDIT_SKILL = `
REDDIT WRITING SKILL — detector evasion + craft

${AI_DETECTOR_EVASION_CORE}

REDDIT-SPECIFIC: REDDIT HAS THE HIGHEST DETECTOR SCRUTINY OF ANY CHANNEL
Reddit's own userbase actively hunts for AI-written posts and subreddits auto-remove on suspicion, so the burstiness and perplexity rules above matter more here than anywhere else in this app. Redditors are tuned to spot exactly the failure mode LLMs default to: too-clean, too-complete, too-resolved.
- Your channel rules give you a STORY ARC (open / tension / turn / landing). Do not let the four beats read as four visible sections — a real Reddit post rambles a little before it gets to the point, doubles back on a detail, or mentions something out of order and corrects itself mid-paragraph ("actually wait, before that—").
- Paragraph burstiness: real Reddit posts have some 1-sentence paragraphs sitting right next to a 5-sentence wall of text where the poster clearly got going. Do not smooth this out.
- The mandated 2–4 "human imperfections" are necessary but not sufficient — a typo in an otherwise perfectly-paced, perfectly-structured post still reads as AI wearing a typo as a costume. The imperfections need to sit inside genuinely uneven, unpolished rhythm to land.

REDDIT-SPECIFIC VOCABULARY:
- Beyond the shared banned list, avoid marketing-adjacent softeners that read as corporate even in casual phrasing: "excited to share," "wanted to share," "quick update," "here to help," "happy to answer questions." Real posters just say the thing.
- Avoid ending every paragraph on a neat little insight. Let some paragraphs just trail into the next one without a punchy closing clause.

VOICE CALIBRATION:
- Write like you're mid-thought while typing, not like you drafted this in a doc first. If a sentence reads like it was revised for clarity, revise it back toward how it would come out the first time.
`.trim()
