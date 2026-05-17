import { GenerateForm } from '@/components/generate/GenerateForm'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function GeneratePage({ params }: Props) {
  const { companyId } = await params
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Generate</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Toggle the channels you want, describe your topic, and get platform-tailored drafts instantly.
        </p>
      </div>
      <GenerateForm companyId={companyId} />
    </div>
  )
}
