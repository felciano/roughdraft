import { describe, expect, it } from "vitest";
import {
  appendRoughdraftReply,
  extractRoughdraftReviewIndex,
  validateRoughdraftMarkdown,
} from "./index";

// Agents often close Roughdraft YAML endmatter with a second `---` line, the way
// YAML frontmatter is written. The documented form runs to end of file with no
// closing delimiter. Both forms must be read as endmatter.

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
const BODY = "Intro {==target==}{>>Why?<<}{#c1}.";

const documentedForm = [BODY, "", ...ENDMATTER_LINES, ""].join("\n");
const closedForm = [BODY, "", ...ENDMATTER_LINES, "---", ""].join("\n");

function expectEndmatterRead(markdown: string): void {
  const validation = validateRoughdraftMarkdown(markdown);
  expect(validation.diagnostics.map((d) => d.code)).toEqual([]);
  expect(validation.ok).toBe(true);

  const index = extractRoughdraftReviewIndex(markdown);
  expect(index.diagnostics).toEqual([]);
  expect(index.summary).toMatchObject({ comments: 1, replies: 1 });
  expect(index.items.find((item) => item.id === "c1")).toMatchObject({
    kind: "comment",
    author: "user",
    createdAt: "2026-11-27T10:00:00.000Z",
    anchorText: "target",
    text: "Why?",
  });
  expect(index.items.find((item) => item.id === "c11")).toMatchObject({
    kind: "reply",
    parentId: "c1",
    author: "claude",
    text: "Because.",
  });
}

describe("YAML endmatter closed with a trailing --- delimiter", () => {
  it("control: documented form (no closing ---) is read as endmatter", () => {
    expectEndmatterRead(documentedForm);
  });

  it("reads endmatter that ends with a closing ---", () => {
    expectEndmatterRead(closedForm);
  });

  it("rewrites a closed block as one canonical endmatter block when replying", () => {
    const updated = appendRoughdraftReply(closedForm, {
      parentId: "c1",
      message: "Thanks.",
      author: "claude",
    });
    expect(updated.match(/^---$/gm)).toHaveLength(1);
    expect(updated.trimEnd().endsWith("---")).toBe(false);
    const index = extractRoughdraftReviewIndex(updated);
    expect(index.diagnostics).toEqual([]);
    expect(index.summary).toMatchObject({ comments: 1, replies: 2 });
  });
});
