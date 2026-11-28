import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  criticMarkdownToEditorState,
  editorStateToCriticMarkdown,
} from "../src/critic-markup";
import { createEditorExtensions } from "../src/editor-extensions";

// Reported bug: Roughdraft strips h4 headings (`#### Title`). Markdown allows
// heading levels 1 through 6, so every level must survive a rich-text save.
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

const headingCases = ["#### Four", "##### Five", "###### Six"];

function docWith(heading: string): string {
  return `${heading}\n\nBody text.\n`;
}

// The serializer's blank-line style after headings is not under test here;
// only that the heading line keeps its level marker.
function headingLine(markdown: string): string {
  return markdown.split("\n")[0] ?? "";
}

describe("h4-h6 headings survive a rich-text save", () => {
  it.each(headingCases)("round trips the heading: %j", (heading) => {
    expect(headingLine(roundTrip(docWith(heading)))).toBe(heading);
  });

  it.each(headingCases)("keeps the heading after an edit: %j", (heading) => {
    const output = roundTripAfterTrivialEdit(docWith(heading));
    expect(headingLine(output)).toBe(heading);
    expect(output).toContain("Body text.!");
  });

  it("control: h3 round trips the heading", () => {
    expect(headingLine(roundTrip(docWith("### Three")))).toBe("### Three");
  });

  it("control: h3 keeps the heading after an edit", () => {
    const output = roundTripAfterTrivialEdit(docWith("### Three"));
    expect(headingLine(output)).toBe("### Three");
    expect(output).toContain("Body text.!");
  });
});
