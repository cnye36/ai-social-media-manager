'use client'

import { useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { Markdown } from 'tiptap-markdown'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, CodeSquare,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Minus, Link2, Link2Off, Undo2, Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const lowlight = createLowlight(common)

export interface RichTextEditorHandle {
  getMarkdown: () => string
  setMarkdown: (md: string) => void
  getEditor: () => Editor | null
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors flex-shrink-0',
        active
          ? 'bg-violet-600/30 text-violet-300'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-700',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-4 bg-zinc-700 mx-1 flex-shrink-0" />
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  function setLink() {
    const prev = editor!.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor!.chain().focus().unsetLink().run()
    } else {
      editor!.chain().focus().setLink({ href: url, target: '_blank' }).run()
    }
  }

  function setCodeBlock() {
    const lang = window.prompt('Language (e.g. javascript, typescript, bash, python)', 'javascript')
    if (lang === null) return
    editor!.chain().focus().setCodeBlock({ language: lang || 'plaintext' }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex-wrap">
      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold (⌘B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic (⌘I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline (⌘U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* Code */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Inline code"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={setCodeBlock}
        active={editor.isActive('codeBlock')}
        title="Code block"
      >
        <CodeSquare className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered list"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* Blocks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* Links */}
      <ToolbarButton
        onClick={setLink}
        active={editor.isActive('link')}
        title="Add link"
      >
        <Link2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
        title="Remove link"
      >
        <Link2Off className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* History */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (⌘Z)"
      >
        <Undo2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="w-4 h-4" />
      </ToolbarButton>
    </div>
  )
}

interface RichTextEditorProps {
  initialMarkdown?: string
  placeholder?: string
  onChange?: (markdown: string) => void
  className?: string
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ initialMarkdown = '', placeholder = 'Start writing…', onChange, className }, ref) {
    const editor = useEditor({
      immediatelyRender: true,
      extensions: [
        StarterKit.configure({
          codeBlock: false, // replaced by CodeBlockLowlight
          link: false,
          underline: false,
        }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({ placeholder }),
        CodeBlockLowlight.configure({ lowlight }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: '-',
          transformCopiedText: true,
          transformPastedText: true,
        }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'prose prose-invert max-w-none focus:outline-none min-h-[60vh] px-6 py-4',
        },
      },
      onUpdate: ({ editor }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange?.((editor.storage as any).markdown.getMarkdown())
      },
    })

    // Load initial markdown once editor is ready
    useEffect(() => {
      if (editor && initialMarkdown) {
        editor.commands.setContent(initialMarkdown)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor])

    const getMarkdown = useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (editor?.storage as any)?.markdown?.getMarkdown() ?? ''
    }, [editor])

    const setMarkdown = useCallback((md: string) => {
      editor?.commands.setContent(md)
    }, [editor])

    useImperativeHandle(ref, () => ({
      getMarkdown,
      setMarkdown,
      getEditor: () => editor,
    }), [editor, getMarkdown, setMarkdown])

    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    )
  }
)
