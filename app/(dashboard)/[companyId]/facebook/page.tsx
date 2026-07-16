import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function FacebookPage({ params }: Props) {
  const { companyId } = await params
  redirect(`/${companyId}/social?channel=facebook`)
}
