import { AI_DETECTOR_EVASION_CORE } from './detector-evasion-core'

export const FACEBOOK_SKILL = `
FACEBOOK WRITING SKILL — detector evasion + craft

${AI_DETECTOR_EVASION_CORE}

FACEBOOK-SPECIFIC: SHORT POSTS NEED PERPLEXITY, LONG POSTS NEED BURSTINESS
- Short mode (40–80 words): there's not much room for sentence-length variety, so lean hardest on word choice — the hook and the CTA are almost the whole post, so both need to avoid the banned vocabulary and formulaic shapes completely. A short post that uses even one generic transition word or safe adjective reads as templated because there's nowhere for it to hide.
- Long mode (800+ words): this is where the burstiness rules matter most in this app. A real personal story told at length has a genuinely uneven pace — some moments get three sentences of buildup, others get one flat line. Do not let a long-mode post settle into a steady rhythm for more than two paragraphs before breaking it.

FACEBOOK-SPECIFIC PATTERNS TO BREAK:
- Emoji placement should not be evenly spaced (one per paragraph, always at the end of a sentence). Real usage clusters — sometimes none for three sentences, then two together.
- CTAs should not all end in an exclamation mark. A flat, low-key CTA ("curious what you'd do here") lands better and more human than an amped-up one on most posts.
- Do not let the visual-idea suggestion at the end read as a boilerplate tag-on ("Image suggestion: ..."). Fold it in like a real aside, or vary how directly it's stated.

VOICE CALIBRATION:
- The target reader already knows this brand — write like you're talking to someone you actually know, with the small asymmetries real familiarity produces (an inside reference, an assumption you don't explain, a detail that only matters because of shared context).
`.trim()
