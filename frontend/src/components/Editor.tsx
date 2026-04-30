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
  HighlightStyle,
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
import { tags } from "@lezer/highlight";

type EditorProps = {
  value: string;
  maxLines: number;
  dark: boolean;
  onChange: (value: string) => void;
  onOverflowAttempt: () => void;
};

const darkEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#dce7f5",
  },
  ".cm-content": {
    caretColor: "#7aa2f7",
  },
  ".cm-cursor": {
    borderLeftColor: "#7aa2f7",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(122, 162, 247, 0.26)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(122, 162, 247, 0.13)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(122, 162, 247, 0.12)",
  },
  ".cm-gutters": {
    color: "#93a2b6",
  },
}, { dark: true });

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#7aa2f7", fontWeight: "600" },
  { tag: tags.operatorKeyword, color: "#7aa2f7", fontWeight: "600" },
  { tag: tags.name, color: "#dce7f5" },
  { tag: tags.variableName, color: "#dce7f5" },
  { tag: tags.function(tags.variableName), color: "#76d6ff" },
  { tag: tags.number, color: "#e9bf6f" },
  { tag: tags.string, color: "#9ece6a" },
  { tag: tags.comment, color: "#8391a5", fontStyle: "italic" },
  { tag: tags.punctuation, color: "#b7c2d0" },
  { tag: tags.bracket, color: "#b7c2d0" },
]);

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
        syntaxHighlighting(dark ? darkHighlightStyle : defaultHighlightStyle),
        ...(dark ? [darkEditorTheme] : []),
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
