-- Blog cover images and link generated media to articles
alter table articles
  add column if not exists featured_image_url text,
  add column if not exists featured_image_prompt text;

alter table media_library
  add column if not exists article_id uuid references articles(id) on delete set null;

create index if not exists media_library_article_id on media_library (article_id);
