import { MediaLibraryClient } from '@/components/media/MediaLibraryClient'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function MediaPage({ params }: Props) {
  const { companyId } = await params
  return <MediaLibraryClient companyId={companyId} />
}
