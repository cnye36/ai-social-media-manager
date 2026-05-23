-- Tech stack preference for AI content (e.g. "TypeScript, React, Next.js")
alter table brand_profiles
  add column if not exists preferred_stack text;
