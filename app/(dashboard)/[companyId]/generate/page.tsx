import { createClient } from '@/lib/supabase/server'
import { GeneratePageClient } from '@/components/generate/GeneratePageClient'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function GeneratePage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('color_palette')
    .eq('company_id', companyId)
    .maybeSingle()

  const palette = brand?.color_palette as Record<string, string> | null
  const brandColors = palette?.primary
    ? { primary: palette.primary, accent: palette.accent ?? undefined }
    : undefined

  return <GeneratePageClient companyId={companyId} brandColors={brandColors} />
}
