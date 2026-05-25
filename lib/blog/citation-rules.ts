/** Shared rules for inline citations in generated/edited blog markdown. */
export const BLOG_CITATION_RULES = `CITATION & LINK RULES (mandatory):
- Every external reference, stat, study, or claim must use a markdown inline link [descriptive anchor](url) placed immediately after the words it supports — mid-sentence or directly after the specific number/quote, never deferred to the end of the paragraph.
- Internal links from the provided index must also be inline with natural anchor text woven into the sentence.
- Forbidden: stacking one or more links only at the end of a paragraph; bare URLs; "click here" / "source" / "read more" as anchor text; footnote-style citations; parenthetical "(Source: …)" blocks; a "Sources" or "References" section (except deep_dive may add 2–3 optional "Further reading" links for extras not cited in the body).
- Anchor text must name the source or report (e.g. [Gartner 2024 sales AI survey](url)), not the domain alone.
- Good: "Replying within five minutes makes teams **21× more likely** to [qualify the lead](url) than waiting an hour."
- Bad: "Replying within five minutes makes teams 21× more likely to qualify the lead. [Gartner](url)"`
