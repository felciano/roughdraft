import { describe, expect, it } from "vitest";
import {
  criticMarkdownToEditorState,
  editorStateToCriticMarkdown,
} from "../src/critic-markup";

// Agents often close Roughdraft YAML endmatter with a second `---` line, the way
// YAML frontmatter is written. The documented form runs to end of file with no
// closing delimiter. Both forms must be read as endmatter, not as body text.

const BODY = "Intro {==target==}{>>Why?<<}{#c1}.";

const ENDMATTER_LINES = [
  "---",
  "comments:",
  "  c1:",
  "    by: user",
  '    at: "2026-11-27T10:00:00.000Z"',
  "  c11:",
  '    body: "Because."',
  "    by: claude",
  '    at: "2026-11-27T11:00:00.000Z"',
  "    re: c1",
];

const documentedForm = [BODY, "", ...ENDMATTER_LINES, ""].join("\n");
const closedForm = [BODY, "", ...ENDMATTER_LINES, "---", ""].join("\n");

function roundTrip(markdown: string): string {
  const { doc, comments, frontmatter, endmatter } =
    criticMarkdownToEditorState(markdown);
  return editorStateToCriticMarkdown(doc, comments, { frontmatter, endmatter });
}

function expectEndmatterPreserved(saved: string): void {
  expect(saved).not.toContain("* * *");
  expect(saved).not.toMatch(/comments:[ \t]+c1:/);
  expect(saved).toContain('at: "2026-11-27T10:00:00.000Z"');
  expect(saved).toMatch(/c11:[\s\S]*re: c1/);
}

function expectReplyThread(markdown: string): void {
  const { comments, endmatter } = criticMarkdownToEditorState(markdown);
  expect(endmatter).not.toBeNull();
  expect(comments.get("c1")).toMatchObject({
    id: "c1",
    createdAt: "2026-11-27T10:00:00.000Z",
  });
  expect(comments.get("c11")).toMatchObject({
    id: "c11",
    content: "Because.",
    parentCommentId: "c1",
  });
}

describe("YAML endmatter closed with a trailing --- delimiter", () => {
  it("control: documented form (no closing ---) round-trips endmatter", () => {
    expectEndmatterPreserved(roundTrip(documentedForm));
  });

  it("control: documented form parses c11 as a reply to c1", () => {
    expectReplyThread(documentedForm);
  });

  it("round-trips endmatter that ends with a closing ---", () => {
    expectEndmatterPreserved(roundTrip(closedForm));
  });

  it("parses c11 as a reply to c1 when endmatter ends with a closing ---", () => {
    expectReplyThread(closedForm);
  });

  it("does not treat a genuine trailing horizontal rule as endmatter", () => {
    const markdown = "Para.\n\n---\n\nMore.\n\n---\n";
    const { endmatter } = criticMarkdownToEditorState(markdown);
    expect(endmatter).toBeNull();
    const saved = roundTrip(markdown);
    expect(saved).toContain("Para.");
    expect(saved).toContain("More.");
  });
});
