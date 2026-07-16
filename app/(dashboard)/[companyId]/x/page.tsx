import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function XPage({ params }: Props) {
  const { companyId } = await params
  redirect(`/${companyId}/social?channel=x`)
}
