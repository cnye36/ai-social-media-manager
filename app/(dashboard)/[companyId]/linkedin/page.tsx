import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function LinkedInPage({ params }: Props) {
  const { companyId } = await params
  redirect(`/${companyId}/social?channel=linkedin`)
}
