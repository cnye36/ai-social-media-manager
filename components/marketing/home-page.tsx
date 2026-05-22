import Link from 'next/link'
import {
  ArrowRight,
  Calendar,
  KeyRound,
  Layers,
  MessageSquare,
  PenLine,
  Sparkles,
  Zap,
} from 'lucide-react'

const features = [
  {
    icon: Sparkles,
    title: 'Channel-native AI',
    description:
      'Dedicated agents for LinkedIn, X, Reddit, and Facebook — each tuned to platform format, tone, and limits.',
  },
  {
    icon: Layers,
    title: 'Brand + knowledge RAG',
    description:
      'Ingest your site and docs. Every post pulls from your voice, pillars, and real product context.',
  },
  {
    icon: Calendar,
    title: 'Planner & calendar',
    description:
      'Plan weeks of content like a social director, then schedule, edit, and publish from one workspace.',
  },
  {
    icon: PenLine,
    title: 'Blog → social',
    description:
      'Draft long-form articles and spin channel-specific promos without starting from a blank page.',
  },
  {
    icon: MessageSquare,
    title: 'Reddit monitor',
    description:
      'Track subreddits for relevant threads and draft replies that match your brand — not spam.',
  },
  {
    icon: Zap,
    title: 'Media on demand',
    description:
      'Generate images from post context, manage a media library, and connect Canva when you need design control.',
  },
] as const

const pricingIncludes = [
  'Unlimited companies & brand profiles',
  'All channels: LinkedIn, X, Reddit, Facebook',
  'Content planner, calendar & drafts',
  'Knowledge base ingest & RAG retrieval',
  'Bring your own OpenAI & platform keys',
] as const

export function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060608] text-zinc-100 selection:bg-cyan-500/30 selection:text-white">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.18),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(16,185,129,0.08),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="group flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 text-sm font-black text-black">
              S
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              SocialAI
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm text-zinc-400 hover:text-white transition-colors sm:inline"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-50 transition-colors"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-6 pb-24 pt-20 md:pt-28 md:pb-32">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300 animate-[fade-up_0.6s_ease-out_both]">
              <KeyRound className="h-3.5 w-3.5" />
              Bring your own API keys
            </div>
            <h1 className="font-display max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl animate-[fade-up_0.6s_ease-out_0.1s_both]">
              Ship social content{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                at machine speed
              </span>
              — on your terms.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400 leading-relaxed animate-[fade-up_0.6s_ease-out_0.2s_both]">
              SocialAI plans, writes, and schedules multi-channel posts grounded in your brand
              and knowledge base. You keep control of spend with your own OpenAI and platform keys.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4 animate-[fade-up_0.6s_ease-out_0.3s_both]">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 px-7 py-3.5 text-base font-bold text-black shadow-[0_0_40px_-8px_rgba(34,211,238,0.6)] hover:shadow-[0_0_48px_-6px_rgba(34,211,238,0.75)] transition-shadow"
              >
                Start for $9.99/mo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-6 py-3.5 text-base font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
              >
                See what&apos;s inside
              </a>
            </div>
            <div className="mt-16 grid gap-3 sm:grid-cols-3 animate-[fade-up_0.6s_ease-out_0.45s_both]">
              {[
                { label: 'Channels', value: '4+' },
                { label: 'Your keys', value: 'BYOK' },
                { label: 'From idea to scheduled', value: 'One app' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4"
                >
                  <p className="font-display text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-zinc-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-white/[0.06] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              Features
            </p>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-bold tracking-tight text-white md:text-5xl">
              Everything a lean social team needs — nothing you don&apos;t.
            </h2>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <article
                  key={feature.title}
                  className="group rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 transition-colors hover:border-cyan-500/30 hover:bg-zinc-900/70"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/25 transition-colors">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-white/[0.06] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
              Pricing
            </p>
            <h2 className="font-display mt-3 max-w-xl text-4xl font-bold tracking-tight text-white md:text-5xl">
              One plan. Full product. Your keys.
            </h2>
            <div className="mt-14 max-w-lg">
              <div className="relative overflow-hidden rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-8 shadow-[0_0_80px_-24px_rgba(34,211,238,0.35)]">
                <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-cyan-500/20 blur-3xl" />
                <p className="text-sm font-medium text-zinc-400">Pro — bring your own keys</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="font-display text-6xl font-extrabold tracking-tight text-white">
                    $9.99
                  </span>
                  <span className="mb-2 text-zinc-500">/ month</span>
                </div>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                  Flat subscription for the workspace. Connect your own OpenAI API key for
                  generation and your platform credentials for publishing — you pay providers
                  directly, no markup.
                </p>
                <ul className="mt-8 space-y-3">
                  {pricingIncludes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-bold text-black hover:bg-cyan-50 transition-colors"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-950 to-[#060608] px-8 py-16 text-center md:px-16 md:py-20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.15),transparent_55%)]" />
              <h2 className="font-display relative text-3xl font-bold tracking-tight text-white md:text-5xl">
                Ready to own your social pipeline?
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-zinc-400">
                Sign in, add your keys, and publish your first week of content today.
              </p>
              <Link
                href="/login"
                className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 px-8 py-4 text-base font-bold text-black hover:opacity-95 transition-opacity"
              >
                Create your workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-emerald-500 text-xs font-black text-black">
              S
            </span>
            <span className="font-display text-sm font-bold text-white">SocialAI</span>
          </div>
          <p className="text-sm text-zinc-600">
            © {new Date().getFullYear()} SocialAI. AI social media on your keys.
          </p>
          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="#features" className="hover:text-zinc-300 transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-zinc-300 transition-colors">
              Pricing
            </a>
            <Link href="/login" className="hover:text-zinc-300 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
