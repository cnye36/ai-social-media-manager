export function formatPromptDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function recentSourceCutoff(date: Date, monthsAgo = 18): string {
  const cutoff = new Date(date)
  cutoff.setMonth(cutoff.getMonth() - monthsAgo)
  return formatPromptDate(cutoff)
}
