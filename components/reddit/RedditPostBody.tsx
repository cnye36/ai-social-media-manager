'use client'

import { cn } from '@/lib/utils'
import { parseRedditSelftext, type InlineSegment } from '@/lib/reddit/format-selftext'

function InlineContent({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 hover:underline"
            onClick={e => e.stopPropagation()}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

export function RedditPostBody({
  selftext,
  className,
  clampLines,
}: {
  selftext: string
  className?: string
  /** Max lines before clamping (e.g. 6 in opportunity cards) */
  clampLines?: number
}) {
  const { blocks } = parseRedditSelftext(selftext)
  if (!blocks.length) return null

  return (
    <div
      className={cn(
        'text-sm text-zinc-300 leading-relaxed',
        clampLines && `line-clamp-[${clampLines}]`,
        className,
      )}
      style={clampLines ? { WebkitLineClamp: clampLines } : undefined}
    >
      <div className={cn('space-y-2.5', clampLines && 'line-clamp-[inherit]')}>
        {blocks.map((block, i) =>
          block.type === 'list-item' ? (
            <p key={i} className="flex gap-2 pl-0.5">
              <span className="text-zinc-500 shrink-0 select-none">•</span>
              <span className="min-w-0">
                <InlineContent segments={block.segments} />
              </span>
            </p>
          ) : (
            <p key={i} className="whitespace-pre-wrap break-words">
              <InlineContent segments={block.segments} />
            </p>
          ),
        )}
      </div>
    </div>
  )
}
