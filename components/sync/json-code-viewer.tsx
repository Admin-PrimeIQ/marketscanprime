"use client"

import { useCallback, useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react"
import CodeMirror, { EditorState, EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { json } from "@codemirror/lang-json"
import { openSearchPanel } from "@codemirror/search"
import { foldAll, unfoldAll } from "@codemirror/language"

import { Button } from "@/components/ui/button"

/**
 * Read-only JSON viewer for a run's S3 artifacts.
 *
 * `EditorState.readOnly` is doing more than disabling typing: `@codemirror/search`
 * checks it when building its panel and omits the replace field and both replace
 * buttons entirely, and `replaceNext`/`replaceAll` refuse to run even if a
 * keybinding reaches them. So "search yes, replace no" is enforced by the editor's
 * own state rather than by us hiding controls.
 *
 * `editable={false}` on top of it removes the caret, so nothing about the surface
 * suggests these bytes can be edited — they are a backup someone may restore from.
 */
export function JsonCodeViewer({ value, height = "55vh" }: { value: string; height?: string }) {
  const t = useTranslations("sync")
  const { resolvedTheme } = useTheme()
  const ref = useRef<ReactCodeMirrorRef>(null)

  const extensions = useMemo(
    () => [
      json(),
      EditorState.readOnly.of(true),
      // Wrapping keeps a long value inside the dialog instead of pushing a
      // horizontal scrollbar under 5,000 lines of pretty-printed JSON.
      EditorView.lineWrapping,
    ],
    []
  )

  const run = useCallback((cmd: (view: EditorView) => boolean) => {
    const view = ref.current?.view
    if (!view) return
    // The commands need focus to act on the right view, and the search panel
    // needs it to receive typing straight away.
    view.focus()
    cmd(view)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => run(openSearchPanel)}>
          <Search />
          {t("viewerSearch")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(foldAll)}>
          <ChevronsDownUp />
          {t("viewerFoldAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => run(unfoldAll)}>
          <ChevronsUpDown />
          {t("viewerUnfoldAll")}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{t("viewerReadOnly")}</span>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <CodeMirror
          ref={ref}
          value={value}
          height={height}
          editable={false}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            searchKeymap: true,
            // No editing surface, so nothing to undo, autocomplete or lint.
            history: false,
            autocompletion: false,
            bracketMatching: true,
          }}
        />
      </div>
    </div>
  )
}
