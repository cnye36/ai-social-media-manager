import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMedia } from '@/agents/media-agent'
import type { ImageSize } from '@/lib/media/gpt-image'

export const maxDuration = 90

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    postContent,
    companyId,
    channel,
    refinementNote,
    brandColors,
    postId,
    articleId,
    imagePrompt,
    purpose,
    size,
    articleTitle,
    includeLogo,
  } = body as {
    postContent?: string
    companyId: string
    channel?: string
    refinementNote?: string
    brandColors?: { primary?: string; accent?: string }
    postId?: string
    articleId?: string
    imagePrompt?: string
    purpose?: 'cover' | 'inline' | 'social'
    size?: ImageSize
    articleTitle?: string
    includeLogo?: boolean
  }

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const hasDirectPrompt = Boolean(imagePrompt?.trim())
  if (!hasDirectPrompt && !postContent?.trim()) {
    return NextResponse.json({ error: 'postContent or imagePrompt is required' }, { status: 400 })
  }

  if (!hasDirectPrompt && !channel) {
    return NextResponse.json({ error: 'channel is required when imagePrompt is not provided' }, { status: 400 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, logo_url')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  try {
    const result = await generateMedia({
      postContent: postContent?.trim() ?? imagePrompt!.trim(),
      companyId,
      channel: channel ?? (articleId ? 'blog' : 'linkedin'),
      refinementNote,
      brandColors,
      postId: postId ?? undefined,
      articleId: articleId ?? undefined,
      imagePrompt: imagePrompt?.trim(),
      purpose,
      size,
      articleTitle: articleTitle?.trim(),
      logoUrl: includeLogo ? company.logo_url : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[media-agent]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
