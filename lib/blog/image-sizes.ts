/** Blog hero: 16:9 landscape for featured images (matches exported frontmatter). */
export const BLOG_COVER_IMAGE_WIDTH = 1792
export const BLOG_COVER_IMAGE_HEIGHT = 1024
export const BLOG_COVER_IMAGE_SIZE = `${BLOG_COVER_IMAGE_WIDTH}x${BLOG_COVER_IMAGE_HEIGHT}` as const

/** Inline section visuals stay square for flexible in-article placement. */
export const BLOG_INLINE_IMAGE_SIZE = '1024x1024' as const
