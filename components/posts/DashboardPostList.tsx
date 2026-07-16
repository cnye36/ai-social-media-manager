'use client'

// Role: read-only recent posts on the dashboard home. Full management is /posts (PostsTable).

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { PostEditorModal } from './PostEditorModal'
import type { Post, Channel } from '@/types/database'

interface DashboardPostListProps {
  posts: Post[]
  companyId: string
}

export function DashboardPostList({ posts: initialPosts, companyId }: DashboardPostListProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  function openPost(post: Post) {
    setEditorPost(post)
    setEditorOpen(true)
  }

  function handleUpdate(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    setEditorPost(updated)
  }

  function handleDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setEditorOpen(false)
  }

  if (posts.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-zinc-500 text-sm">
        No posts yet.{' '}
        <Link href={`/${companyId}/social`} className="text-violet-400 hover:underline">
          Generate your first one
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-zinc-800">
        {posts.map(post => (
          <button
            key={post.id}
            onClick={() => openPost(post)}
            className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-zinc-800/50 transition-colors"
          >
            <Badge
              variant={post.channel as Channel}
              className="mt-0.5 flex-shrink-0"
            >
              {post.channel}
            </Badge>
            <p className="text-sm text-zinc-300 flex-1 line-clamp-2">{post.content}</p>
            <Badge
              variant={post.status as 'draft' | 'scheduled' | 'published' | 'archived'}
              className="flex-shrink-0"
            >
              {post.status}
            </Badge>
          </button>
        ))}
      </div>

      <PostEditorModal
        post={editorPost}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        companyId={companyId}
      />
    </>
  )
}
