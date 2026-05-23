function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const base = path.split('/').pop() ?? 'image'
    if (/\.[a-z0-9]{2,5}$/i.test(base)) return base
    return `${base}.png`
  } catch {
    return 'image.png'
  }
}

/** Download an image URL (fetches as blob when possible for cross-origin Supabase URLs). */
export async function downloadMediaFile(url: string, filename?: string): Promise<void> {
  const name = filename ?? filenameFromUrl(url)

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}
