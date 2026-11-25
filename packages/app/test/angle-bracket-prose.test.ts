import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  criticMarkdownToEditorState,
  editorStateToCriticMarkdown,
} from "../src/critic-markup";
import { createEditorExtensions } from "../src/editor-extensions";

// Reported bug: saving a document drops `<word>` text in plain prose
// because the rich-text round trip treats it as an HTML tag.
function roundTrip(markdown: string): string {
  const { doc, comments } = criticMarkdownToEditorState(markdown);
  return editorStateToCriticMarkdown(doc, comments);
}

function roundTripAfterTrivialEdit(markdown: string): string {
  const { doc, comments } = criticMarkdownToEditorState(markdown);
  const editor = new Editor({
    extensions: createEditorExtensions(""),
    content: doc,
  });
  try {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent("!");
    return editorStateToCriticMarkdown(editor.getJSON(), comments);
  } finally {
    editor.destroy();
  }
}

const proseCases = [
  "Last synced <time> ago.\n",
  "Replace <placeholder-name> with your own value.\n",
  "Press <kbd>Ctrl</kbd> to save.\n",
  "| Field | Shown as |\n| --- | --- |\n| `synced_at` | synced <time> ago |\n",
];

describe("angle-bracketed text in prose survives a rich-text save", () => {
  it.each(proseCases)("round trips unchanged: %j", (input) => {
    expect(roundTrip(input)).toBe(input);
  });

  it.each(proseCases)("keeps the bracketed word after an edit: %j", (input) => {
    const word = /<([^>]+)>/.exec(input)?.[0] ?? "";
    expect(roundTripAfterTrivialEdit(input)).toContain(word);
  });

  it("still converts inline HTML the editor understands", () => {
    expect(roundTrip("A <b>bold</b> word.\n")).toBe("A **bold** word.\n");
  });

  it("round trips <time> inside inline code", () => {
    const input = "Last synced `<time>` ago.\n";
    expect(roundTrip(input)).toBe(input);
  });

  it("round trips <time> inside a CriticMarkup comment", () => {
    const input =
      'Last {==synced==}{>>shows <time> ago<<}{id="c1" by="user" at="2026-04-25T21:54:47.475Z"} recently.\n';
    expect(roundTrip(input)).toBe(input);
  });
});
