import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function BrandPage({ params }: Props) {
  const { companyId } = await params
  redirect(`/${companyId}/settings?tab=brand`)
}
