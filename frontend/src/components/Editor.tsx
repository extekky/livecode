import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  indentWithTab,
  history,
  defaultKeymap,
  historyKeymap,
} from "@codemirror/commands";
import {
  indentUnit,
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import {
  keymap,
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
} from "@codemirror/view";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

type EditorProps = {
  value: string;
  maxLines: number;
  dark: boolean;
  onChange: (value: string) => void;
  onOverflowAttempt: () => void;
};

export default function Editor({
  value,
  maxLines,
  dark,
  onChange,
  onOverflowAttempt,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const syncingRef = useRef(false);
  const cbRef = useRef({ onChange, onOverflowAttempt });
  cbRef.current = { onChange, onOverflowAttempt };

  // ── Create editor once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        EditorState.tabSize.of(4),
        indentUnit.of("    "),
        python(),
        syntaxHighlighting(defaultHighlightStyle),
        ...(dark ? [oneDark] : []),
        keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorState.transactionFilter.of((tr) => {
          if (syncingRef.current || !tr.docChanged || tr.newDoc.lines <= maxLines) {
            return tr;
          }
          cbRef.current.onOverflowAttempt();
          return [];
        }),
        EditorView.updateListener.of((upd) => {
          if (!upd.docChanged || syncingRef.current) return;
          cbRef.current.onChange(upd.state.doc.toString());
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]); // re-create when theme changes

  // ── Sync external value changes ───────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;

    const { main } = view.state.selection;
    syncingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: {
        anchor: Math.min(main.anchor, value.length),
        head: Math.min(main.head, value.length),
      },
    });
    syncingRef.current = false;
  }, [value]);

  return <div ref={containerRef} className="editor-surface" />;
}
