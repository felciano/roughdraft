import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { logE2eEvent } from "./helpers";

// Remote document mode end to end: a CLI registers a session with the host and
// holds a CLI-role event stream open; the reviewer opens the printed
// `/?session=<id>` viewer link, reviews, and clicks Done Reviewing. The CLI
// stream must receive the overall comment as a save and then review.completed.
//
// The e2e API server (e2e/start-api.ts) starts without ROUGHDRAFT_TOKEN, so the
// remote-document endpoints need no token here.

const apiPort = Number(process.env.API_PORT ?? 4317);
const apiOrigin = `http://127.0.0.1:${apiPort}`;

interface SseEvent {
  event: string;
  data: string;
}

// A minimal CLI stand-in: reads the CLI-role SSE stream with fetch and records
// every event, so the test can poll for what the host forwarded.
function openCliStream(sessionId: string) {
  const controller = new AbortController();
  const events: SseEvent[] = [];
  const done = (async () => {
    const response = await fetch(
      `${apiOrigin}/api/remote-document/${encodeURIComponent(sessionId)}/events?role=cli`,
      { signal: controller.signal },
    );
    if (!response.ok || !response.body) {
      throw new Error(`CLI stream failed: HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data.push(line.slice(6));
        }
        if (data.length > 0) events.push({ event, data: data.join("\n") });
      }
    }
  })().catch((error: unknown) => {
    if ((error as { name?: string }).name !== "AbortError") throw error;
  });

  return {
    events,
    eventNames: () => events.map((entry) => entry.event),
    close: async () => {
      controller.abort();
      await done.catch(() => undefined);
    },
  };
}

test.describe("remote review", () => {
  let cliStream: ReturnType<typeof openCliStream> | null = null;

  test.afterEach(async () => {
    await cliStream?.close();
    cliStream = null;
  });

  test("opens a ?session= viewer link as the document and completes the review to the CLI @smoke", async ({
    page,
    request,
  }) => {
    const sessionId = randomUUID();
    const overallComment = "Please tighten the intro.";

    const register = await request.post(`${apiOrigin}/api/remote-document`, {
      data: {
        sessionId,
        originPath: "/work/notes/remote-draft.md",
        content: ["# Remote Draft", "", "Hello remote reviewer.", ""].join(
          "\n",
        ),
      },
    });
    expect(register.status()).toBe(201);

    const stream = openCliStream(sessionId);
    cliStream = stream;
    await expect.poll(() => stream.eventNames()).toContain("connected");

    await page.goto(`/?session=${encodeURIComponent(sessionId)}`);

    await expect(page.getByTestId("homepage")).toHaveCount(0);
    await expect(page.getByTestId("rich-text-editor")).toContainText(
      "Hello remote reviewer.",
    );
    await expect(page.getByTestId("document-file-menu-trigger")).toContainText(
      "remote-draft.md",
    );

    await expect(page.getByTestId("review-handoff-button")).toBeVisible();
    await page.getByTestId("review-handoff-comment-trigger").click();
    await page
      .getByTestId("review-handoff-overall-comment")
      .fill(overallComment);
    await page.getByTestId("review-handoff-button").click();

    await expect
      .poll(() => stream.eventNames(), { timeout: 10_000 })
      .toContain("review.completed");

    const events = stream.events;
    const completed = events.find(
      (entry) => entry.event === "review.completed",
    );
    expect(JSON.parse(completed?.data ?? "{}")).toMatchObject({
      type: "review.completed",
      documentPath: "/work/notes/remote-draft.md",
      overallComment,
    });

    // The overall comment reaches the CLI as a save carrying YAML endmatter.
    const commentSave = events
      .filter((entry) => entry.event === "save")
      .map((entry) => JSON.parse(entry.data) as { content?: string })
      .find((payload) => payload.content?.includes(overallComment));
    expect(commentSave?.content).toMatch(
      /---\ncomments:\n {2}c1:\n {4}body: Please tighten the intro\.\n {4}by: user\n {4}at: [^\n]+\n?$/,
    );

    logE2eEvent("remote-review.completed", {
      sessionId,
      events: stream.eventNames(),
    });
  });
});
