import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "../src/App";

// Remote document mode: `roughdraft open <file>` against ROUGHDRAFT_HOST prints
// a viewer link of the form `/?session=<id>&token=<hex>`. That URL carries no
// `path`, but detectBackend() returns a RemoteBackend for it and App loads the
// session's document. The viewer must show that document, not the homepage.

const SESSION_ID = "s1";
const TOKEN = "t1";
const REMOTE_DOCUMENT = {
  id: SESSION_ID,
  originPath: "/work/notes/draft.md",
  content: "# Draft\n\nHello remote.\n",
  version: "v1",
};

class StubEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: StubEventSource[] = [];

  readonly url: string;
  readyState = StubEventSource.OPEN;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    StubEventSource.instances.push(this);
  }

  addEventListener() {}
  removeEventListener() {}
  close() {
    this.readyState = StubEventSource.CLOSED;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function routeFetch(input: RequestInfo | URL): Response {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    window.location.origin,
  );

  switch (url.pathname) {
    case "/api/status":
      return jsonResponse({
        backend: "local-files",
        stateless: true,
        capabilities: {
          remoteDocuments: true,
          remoteDocumentTokenRequired: true,
        },
      });
    case `/api/remote-document/${SESSION_ID}`:
      return jsonResponse(REMOTE_DOCUMENT);
    case `/api/remote-document/${SESSION_ID}/review-status`:
      return jsonResponse({ watching: true, watcherCount: 1 });
    case "/api/update-status":
      return jsonResponse({ updateAvailable: false });
    default:
      return jsonResponse({ error: `unmocked ${url.pathname}` }, 404);
  }
}

function setupDomMocks() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 640,
    height: 480,
    right: 640,
    bottom: 480,
    toJSON() {
      return this;
    },
  } as DOMRect);

  if (!("ResizeObserver" in globalThis)) {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  }

  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });

  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 80,
    height: 20,
    right: 80,
    bottom: 20,
    toJSON() {
      return this;
    },
  } as DOMRect;

  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [rect],
  });
  Object.defineProperty(Text.prototype, "getClientRects", {
    configurable: true,
    value: () => [rect],
  });
  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    value() {
      return [this.getBoundingClientRect()];
    },
  });

  window.scrollBy = vi.fn();
}

function queryByTestId<T extends Element = HTMLElement>(
  container: ParentNode,
  testId: string,
) {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

describe("remote session viewer link", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    setupDomMocks();
    StubEventSource.instances = [];
    vi.stubGlobal("EventSource", StubEventSource);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => routeFetch(input));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      null,
      "",
      `/?session=${SESSION_ID}&token=${TOKEN}`,
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  async function renderApp() {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>,
      );
      await Promise.resolve();
    });
  }

  async function waitForInitialLoad() {
    // App renders an empty placeholder while loading, then either the
    // homepage or the document workspace.
    await vi.waitFor(() => {
      expect(
        queryByTestId(container, "homepage") ??
          queryByTestId(container, "document-file-menu-trigger"),
      ).not.toBeNull();
    });
  }

  it("renders the remote document workspace, not the homepage, for a ?session= link", async () => {
    await renderApp();
    await waitForInitialLoad();

    // The remote session was actually loaded through the remote backend.
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/remote-document/${SESSION_ID}`,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
    );

    expect(
      queryByTestId(container, "homepage"),
      "a ?session= viewer link rendered the marketing homepage",
    ).toBeNull();
    expect(queryByTestId(container, "homepage-subtitle-comment")).toBeNull();

    expect(container.textContent).toContain("Hello remote.");
    expect(
      queryByTestId(container, "document-file-menu-trigger")?.textContent,
    ).toContain("draft.md");

    // review-status reports a watcher, so Done Reviewing becomes available.
    await vi.waitFor(() => {
      expect(queryByTestId(container, "review-handoff-button")).not.toBeNull();
    });
  });
});
