import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendImageToCanva, isCanvaConnected } from '@/lib/media/canva'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connected = await isCanvaConnected(user.id)
  if (!connected) {
    return NextResponse.json({ error: 'Canva not connected. Please connect via Settings.' }, { status: 400 })
  }

  const body = await req.json()
  const { imageUrl, storagePath, title } = body

  if (!imageUrl || !title) {
    return NextResponse.json({ error: 'imageUrl and title are required' }, { status: 400 })
  }

  try {
    // Fetch the image buffer from Supabase Storage public URL
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Could not fetch image: ${imgRes.status}`)
    const arrayBuffer = await imgRes.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)

    const design = await sendImageToCanva({ userId: user.id, imageBuffer, title })
    return NextResponse.json(design)
  } catch (err) {
    console.error('[canva-design]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
