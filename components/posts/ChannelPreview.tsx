'use client'

import { cn } from '@/lib/utils'
import { splitImagePromptFromText } from '@/lib/generate/image-prompt'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import type { Channel } from '@/types/database'

interface ChannelPreviewProps {
  channel: Channel
  content: string
  mediaUrl?: string
  mediaAlt?: string
}

function cleanText(content: string) {
  return splitImagePromptFromText(content).content
}

function MediaBlock({ url, channel, alt }: { url: string; channel: Channel; alt?: string }) {
  const aspectClass: Record<Channel, string> = {
    linkedin: 'aspect-[1.91/1]',
    x: 'aspect-video',
    facebook: 'aspect-[1.91/1]',
    reddit: 'aspect-video',
  }
  return (
    <HoverDownloadImage
      src={url}
      alt={alt?.trim() || 'Post media'}
      className="w-full h-full object-cover"
      wrapperClassName={cn('w-full block overflow-hidden', aspectClass[channel])}
    />
  )
}

// ─── LinkedIn ────────────────────────────────────────────────────────────────

function LinkedInPreview({ content: raw, mediaUrl, mediaAlt }: { content: string; mediaUrl?: string; mediaAlt?: string }) {
  const text = cleanText(raw)
  const preview = text.slice(0, 280)
  const truncated = text.length > 280

  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1b1f23] text-left overflow-hidden">
      <div className="p-3 flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          C
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-white leading-none">Your Company</p>
            <span className="text-[10px] text-blue-400 border border-blue-400/50 rounded px-1.5 py-0.5 leading-none">
              + Follow
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">1,234 followers · Just now · 🌐</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-[12px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {preview}
          {truncated && <span className="text-blue-400 ml-0.5">…see more</span>}
        </p>
      </div>
      {mediaUrl && <MediaBlock url={mediaUrl} channel="linkedin" alt={mediaAlt} />}
      <div className="px-3 py-2 flex gap-4 border-t border-zinc-800/60 mt-1">
        {['👍 Like', '💬 Comment', '↗ Repost', '✉ Send'].map(a => (
          <span key={a} className="text-[10px] text-zinc-500">{a}</span>
        ))}
      </div>
    </div>
  )
}

// ─── X / Twitter ─────────────────────────────────────────────────────────────

export interface XThreadPreviewTweet {
  text: string
  mediaUrl?: string
  mediaAlt?: string
}

function XAvatar({ label }: { label: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
      {label.charAt(0).toUpperCase()}
    </div>
  )
}

function XPreview({ content: raw, mediaUrl, mediaAlt }: { content: string; mediaUrl?: string; mediaAlt?: string }) {
  const text = cleanText(raw)

  return (
    <div className="rounded-lg border border-zinc-700 bg-black text-left p-3">
      <div className="flex gap-2.5">
        <XAvatar label="Company" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-bold text-white">Company</span>
            <span className="text-[11px] text-zinc-500">@company · Just now</span>
          </div>
          <p className="text-[12px] text-zinc-100 leading-relaxed whitespace-pre-wrap mt-1">{text}</p>
          {mediaUrl && (
            <div className="mt-2 rounded-xl overflow-hidden border border-zinc-800">
              <MediaBlock url={mediaUrl} channel="x" alt={mediaAlt} />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 pt-1">
            <div className="flex gap-5">
              {['💬 0', '↺ 0', '♥ 0', '↗'].map(a => (
                <span key={a} className="text-[10px] text-zinc-500">{a}</span>
              ))}
            </div>
            <span className={cn(
              'text-[10px] tabular-nums',
              text.length > 280 ? 'text-red-400 font-medium' : 'text-zinc-600'
            )}>
              {text.length}/280
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function XThreadPreview({
  tweets,
  displayName = 'Company',
  handle = 'company',
}: {
  tweets: XThreadPreviewTweet[]
  displayName?: string
  handle?: string
}) {
  if (tweets.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-black p-6 text-center text-xs text-zinc-600">
        No tweets to preview
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-black text-left overflow-hidden">
      <div className="p-3">
        <div className="relative">
          {tweets.length > 1 && (
            <div
              className="absolute left-[19px] top-10 bottom-10 w-0.5 bg-zinc-700/80 rounded-full"
              aria-hidden
            />
          )}
          <div className="space-y-4">
            {tweets.map((tweet, i) => (
              <div key={i} className="flex gap-2.5 relative">
                <div className="w-10 shrink-0">
                  {i === 0 ? <XAvatar label={displayName} /> : <div className="h-1" />}
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  {i === 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[13px] font-bold text-white">{displayName}</span>
                      <span className="text-[11px] text-zinc-500">@{handle} · Just now</span>
                    </div>
                  )}
                  <p className="text-[12px] text-zinc-100 leading-relaxed whitespace-pre-wrap">{tweet.text}</p>
                  {tweet.mediaUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-zinc-800">
                      <MediaBlock url={tweet.mediaUrl} channel="x" alt={tweet.mediaAlt} />
                    </div>
                  )}
                  {tweet.text.length > 280 && (
                    <p className="text-[10px] text-red-400 mt-1 tabular-nums">
                      {tweet.text.length}/280 — over limit
                    </p>
                  )}
                  {i === 0 && tweets.length > 1 && (
                    <p className="text-[11px] text-sky-400 mt-2 font-medium">Show this thread</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/60 ml-[50px]">
          <div className="flex gap-5">
            {['💬', '↺', '♥', '↗', '🔖'].map(icon => (
              <span key={icon} className="text-[10px] text-zinc-500">{icon}</span>
            ))}
          </div>
          <span className="text-[10px] text-zinc-600">
            {tweets.length} tweet{tweets.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Facebook ────────────────────────────────────────────────────────────────

function FacebookPreview({ content: raw, mediaUrl, mediaAlt }: { content: string; mediaUrl?: string; mediaAlt?: string }) {
  const text = cleanText(raw)
  const preview = text.slice(0, 300)
  const truncated = text.length > 300

  return (
    <div className="rounded-lg border border-zinc-700 bg-[#18191a] text-left overflow-hidden">
      <div className="p-3 flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          C
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white leading-none">Your Company</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Just now · 🌐</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-[12px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {preview}
          {truncated && <span className="text-blue-400 ml-0.5">See more</span>}
        </p>
      </div>
      {mediaUrl && <MediaBlock url={mediaUrl} channel="facebook" alt={mediaAlt} />}
      <div className="px-3 py-2 border-t border-zinc-800/60 flex gap-3 mt-1">
        {['👍 Like', '💬 Comment', '↗ Share'].map(a => (
          <span key={a} className="text-[10px] text-zinc-500 font-medium">{a}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Reddit ──────────────────────────────────────────────────────────────────

function RedditPreview({ content: raw, mediaUrl, mediaAlt }: { content: string; mediaUrl?: string; mediaAlt?: string }) {
  const text = cleanText(raw)
  const lines = text.split('\n')
  const title = lines[0] || 'Post title'
  const body = lines.slice(1).join('\n').trim()

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 text-left overflow-hidden">
      <div className="flex">
        <div className="flex flex-col items-center gap-0.5 px-2 pt-3 bg-zinc-900/40 flex-shrink-0">
          <span className="text-orange-400 text-[13px] leading-none">▲</span>
          <span className="text-[10px] text-zinc-300 font-bold">1</span>
          <span className="text-zinc-600 text-[13px] leading-none">▼</span>
        </div>
        <div className="flex-1 p-2.5 min-w-0">
          <div className="flex items-center gap-1 text-[9px] text-zinc-500 mb-1.5">
            <span className="text-orange-400 font-semibold">r/subreddit</span>
            <span>·</span>
            <span>Posted by u/you · Just now</span>
          </div>
          <p className="text-[12px] font-semibold text-white leading-snug mb-1.5">{title}</p>
          {mediaUrl && (
            <div className="rounded overflow-hidden mb-1.5 border border-zinc-800">
              <MediaBlock url={mediaUrl} channel="reddit" alt={mediaAlt} />
            </div>
          )}
          {body && (
            <p className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-4">{body}</p>
          )}
          <div className="flex gap-3 mt-2 text-[10px] text-zinc-500">
            <span>💬 Comments</span>
            <span>↗ Share</span>
            <span>💾 Save</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export function ChannelPreview({ channel, content, mediaUrl, mediaAlt }: ChannelPreviewProps) {
  if (channel === 'linkedin') return <LinkedInPreview content={content} mediaUrl={mediaUrl} mediaAlt={mediaAlt} />
  if (channel === 'x')        return <XPreview content={content} mediaUrl={mediaUrl} mediaAlt={mediaAlt} />
  if (channel === 'facebook') return <FacebookPreview content={content} mediaUrl={mediaUrl} mediaAlt={mediaAlt} />
  return <RedditPreview content={content} mediaUrl={mediaUrl} mediaAlt={mediaAlt} />
}
