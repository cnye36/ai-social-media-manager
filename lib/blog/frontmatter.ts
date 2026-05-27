import {
  BLOG_COVER_IMAGE_HEIGHT,
  BLOG_COVER_IMAGE_WIDTH,
} from '@/lib/blog/image-sizes'

/** Landscape blog hero dimensions (16:9 — must match generated cover size). */
export const FEATURED_IMAGE_WIDTH = BLOG_COVER_IMAGE_WIDTH
export const FEATURED_IMAGE_HEIGHT = BLOG_COVER_IMAGE_HEIGHT

export const DEFAULT_FRONTMATTER_TEMPLATE = `---
title: "{{metaTitle}}"
description: "{{metaDescription}}"
date: {{date}}
author: "{{author}}"
categories: 
{{categoriesYaml}}
{{tagsSection}}featuredImage: 
  src: "{{featuredImageSrc}}"
  alt: "{{featuredImageAlt}}"
  width: {{featuredImageWidth}}
  height: {{featuredImageHeight}}
---`

export function featuredImagePath(slug: string): string {
  return `/blog-images/${slug}.png`
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function yamlList(items: string[]): string {
  return items.map(item => `  - ${item}`).join('\n')
}

export function renderFrontmatter(
  template: string,
  values: Record<string, string | string[]>,
): string {
  let result = template
  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{{${key}}}`
    const rendered = Array.isArray(value)
      ? value.map(v => `"${escapeYamlDoubleQuoted(v)}"`).join(', ')
      : String(value)
    result = result.replaceAll(placeholder, rendered)
  }
  return result
}

export interface ArticleFrontmatterInput {
  metaTitle: string
  metaDescription: string
  date: string
  author: string
  categories: string[]
  tags: string[]
  slug: string
  featuredImageAlt: string
  /** When set (e.g. generated cover URL), used instead of /blog-images/{slug}.png */
  featuredImageSrc?: string
  template?: string
}

export function buildArticleFrontmatter(input: ArticleFrontmatterInput): string {
  const categories = input.categories.length > 0 ? input.categories : ['Uncategorized']
  const categoriesYaml = yamlList(categories)
  const tagsSection = input.tags.length > 0 ? `tags: \n${yamlList(input.tags)}\n` : ''
  const featuredImageSrc = input.featuredImageSrc?.trim() || featuredImagePath(input.slug)
  const featuredImageAlt = escapeYamlDoubleQuoted(
    input.featuredImageAlt || `Featured image for ${input.metaTitle}`,
  )

  const template = input.template?.trim() || DEFAULT_FRONTMATTER_TEMPLATE

  const values = {
    metaTitle: escapeYamlDoubleQuoted(input.metaTitle),
    metaDescription: escapeYamlDoubleQuoted(input.metaDescription),
    date: input.date,
    author: escapeYamlDoubleQuoted(input.author),
    slug: input.slug,
    categoriesYaml,
    tagsSection,
    featuredImageSrc,
    featuredImageAlt,
    featuredImageWidth: String(FEATURED_IMAGE_WIDTH),
    featuredImageHeight: String(FEATURED_IMAGE_HEIGHT),
    // Legacy inline-array placeholders for older custom templates
    categories: categories.map(c => `"${escapeYamlDoubleQuoted(c)}"`).join(', '),
    tags: input.tags.map(t => `"${escapeYamlDoubleQuoted(t)}"`).join(', '),
  }

  let result = renderFrontmatter(template, values)

  // Older site templates may omit featuredImage — append it before the closing ---
  if (!/featuredImage/i.test(result)) {
    const featuredBlock = `featuredImage: 
  src: "${featuredImageSrc}"
  alt: "${featuredImageAlt}"
  width: ${FEATURED_IMAGE_WIDTH}
  height: ${FEATURED_IMAGE_HEIGHT}`
    result = result.replace(/\n---\s*$/, `\n${featuredBlock}\n---`)
  }

  return result
}
