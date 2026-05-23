import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  articleId: string,
  userId: string
): Promise<{ status: 'not_found' | 'forbidden' | 'ok'; article?: { company_id: string } }> {
  const { data: article } = await supabase
    .from('articles')
    .select('company_id')
    .eq('id', articleId)
    .single()
  if (!article) return { status: 'not_found' }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', article.company_id)
    .eq('owner_id', userId)
    .single()
  return company ? { status: 'ok', article } : { status: 'forbidden' }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status } = await verifyOwnership(supabase, id, user.id)
  if (status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.from('articles').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status: ownershipStatus, article: ownershipArticle } = await verifyOwnership(supabase, id, user.id)
  if (ownershipStatus === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ownershipStatus === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    title, body: articleBody, excerpt, tags, categories, slug,
    site_id, meta_title, meta_description, author, status, scheduled_for,
    featured_image_url, featured_image_prompt,
  } = body

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (articleBody !== undefined) updates.body = articleBody
  if (excerpt !== undefined) updates.excerpt = excerpt
  if (tags !== undefined) updates.tags = tags
  if (categories !== undefined) updates.categories = categories
  if (slug !== undefined) updates.slug = slug || null
  if (site_id !== undefined) updates.site_id = site_id || null
  if (meta_title !== undefined) updates.meta_title = meta_title || null
  if (meta_description !== undefined) updates.meta_description = meta_description || null
  if (author !== undefined) updates.author = author || null
  if (status !== undefined) updates.status = status
  if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for || null
  if (featured_image_url !== undefined) updates.featured_image_url = featured_image_url || null
  if (featured_image_prompt !== undefined) updates.featured_image_prompt = featured_image_prompt || null
  if (status === 'published') updates.published_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update link index when article has a slug and is scheduled/published
  if (data && data.slug && (data.status === 'scheduled' || data.status === 'published')) {
    const siteBaseUrl = data.site_id
      ? (await supabase.from('blog_sites').select('base_url').eq('id', data.site_id).single()).data?.base_url
      : null

    const fullUrl = siteBaseUrl
      ? siteBaseUrl.replace(/\/$/, '') + '/' + data.slug
      : data.slug

    await supabase
      .from('article_link_index')
      .upsert({
        company_id: ownershipArticle!.company_id,
        article_id: id,
        slug: data.slug,
        full_url: fullUrl,
        title: data.title || 'Untitled',
        excerpt: data.excerpt ?? null,
        tags: data.tags ?? [],
        categories: data.categories ?? [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,slug' })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { status } = await verifyOwnership(supabase, id, user.id)
  if (status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
