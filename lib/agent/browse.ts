import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter((p): p is string => Boolean(p));

export function findChromeBinary(): string {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium/Chrome binary found. Checked /Applications/Google Chrome.app and CHROME_PATH.",
  );
}

export type InteractiveElement = {
  tag: string;
  role: string | null;
  text: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
};

export type BrowseResult = {
  ok: boolean;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  consoleErrors: string[];
  textExcerpt: string;
  interactiveElements: InteractiveElement[];
  evalResult?: unknown;
  screenshotPath?: string;
  snapshotName?: string;
  durationMs: number;
};

export type BrowseOptions = {
  url: string;
  mode: "snapshot" | "screenshot" | "eval";
  outPath?: string;
  evalExpression?: string;
  clickSelector?: string;
  waitMs?: number;
  width?: number;
  height?: number;
};

type CdpRemoteArg = {
  value?: unknown;
  description?: string;
};

type CdpEventParams = {
  type?: string;
  args?: CdpRemoteArg[];
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
    };
  };
};

type CdpEvaluateResult<T = unknown> = {
  result?: {
    value?: T;
    description?: string;
  };
};

class CdpSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (val: unknown) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private eventHandlers = new Map<string, Array<(params: CdpEventParams) => void>>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    const rejectAllPending = (reason: string) => {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(reason));
      }
      this.pending.clear();
    };
    this.ws.addEventListener("close", () => {
      rejectAllPending("CDP WebSocket closed before command completed.");
    });
    this.ws.addEventListener("error", (err) => {
      rejectAllPending(`CDP WebSocket error: ${String(err)}`);
    });
    this.ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number;
          method?: string;
          params?: CdpEventParams;
          result?: unknown;
          error?: { message?: string };
        };
        if (typeof msg.id === "number") {
          const entry = this.pending.get(msg.id);
          if (entry) {
            this.pending.delete(msg.id);
            clearTimeout(entry.timer);
            if (msg.error) {
              entry.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              entry.resolve(msg.result);
            }
          }
        } else if (typeof msg.method === "string") {
          const handlers = this.eventHandlers.get(msg.method);
          if (handlers) {
            for (const h of handlers) h(msg.params ?? {});
          }
        }
      } catch {
        // ignore malformed message
      }
    });
  }

  static async connect(wsUrl: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Timed out connecting to CDP WebSocket: ${wsUrl}`));
      }, 8000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CdpSession(ws));
      });
      ws.addEventListener("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${String(err)}`));
      });
    });
  }

  on(method: string, handler: (params: CdpEventParams) => void) {
    const list = this.eventHandlers.get(method) ?? [];
    list.push(handler);
    this.eventHandlers.set(method, list);
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15000,
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (val) => resolve(val as T),
        reject,
        timer,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

export async function runBrowserTask(options: BrowseOptions): Promise<BrowseResult> {
  const startedAt = Date.now();
  const chromeBin = findChromeBinary();
  const width = options.width ?? 1280;
  const height = options.height ?? 800;
  const waitMs = options.waitMs ?? 600;
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "ignis-chrome-"));

  const child = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let session: CdpSession | null = null;
  try {
    const browserWsUrl = await new Promise<string>((resolve, reject) => {
      let stderrBuf = "";
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for Chrome DevTools endpoint. stderr: ${stderrBuf}`));
      }, 10000);

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match?.[1]) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });

      child.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Chrome exited prematurely with code ${code}. stderr: ${stderrBuf}`));
      });
    });

    // Discover the page target WebSocket debugger URL via the HTTP /json/list endpoint
    const urlObj = new URL(browserWsUrl);
    const listUrl = `http://${urlObj.host}/json/list`;
    const targetsRes = await fetch(listUrl);
    const targets = (await targetsRes.json()) as Array<{
      type: string;
      webSocketDebuggerUrl?: string;
    }>;
    const pageTarget = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error("Could not find a debuggable page target in headless Chrome.");
    }

    session = await CdpSession.connect(pageTarget.webSocketDebuggerUrl);
    const consoleErrors: string[] = [];

    session.on("Runtime.consoleAPICalled", (params) => {
      if (params?.type === "error") {
        const text = (params.args ?? [])
          .map((a) => String(a.value ?? a.description ?? ""))
          .join(" ");
        if (text) consoleErrors.push(text);
      }
    });
    session.on("Runtime.exceptionThrown", (params) => {
      const desc = params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text;
      if (desc) consoleErrors.push(String(desc));
    });

    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const loadPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 8000);
      session?.on("Page.loadEventFired", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    await session.send("Page.navigate", { url: options.url });
    await loadPromise;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (options.clickSelector) {
      await session.send("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(options.clickSelector)});
          if (!el) throw new Error("Selector not found: " + ${JSON.stringify(options.clickSelector)});
          el.click();
          return true;
        })()`,
        returnByValue: true,
      });
      await new Promise((r) => setTimeout(r, 400));
    }

    let evalResult: unknown = undefined;
    if (options.evalExpression) {
      const evaluated = await session.send<CdpEvaluateResult>("Runtime.evaluate", {
        expression: options.evalExpression,
        returnByValue: true,
        awaitPromise: true,
      });
      evalResult = evaluated?.result?.value ?? evaluated?.result?.description;
    }

    const domSnapshotEval = await session.send<CdpEvaluateResult<{
      title: string;
      url: string;
      textExcerpt: string;
      interactiveElements: InteractiveElement[];
    }>>("Runtime.evaluate", {
      expression: `(() => {
        const title = document.title || "";
        const url = location.href;
        const textExcerpt = (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1500);
        const candidates = Array.from(document.querySelectorAll("button, a, input, textarea, select, [role='button']"));
        const interactiveElements = [];
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
          const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 80);
          const id = el.id ? "#" + el.id : "";
          const cls = typeof el.className === "string" && el.className.trim()
            ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".")
            : "";
          interactiveElements.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            text,
            selector: el.tagName.toLowerCase() + id + cls,
            rect: {
              x: Math.round(r.x),
              y: Math.round(r.y),
              width: Math.round(r.width),
              height: Math.round(r.height),
            },
          });
          if (interactiveElements.length >= 40) break;
        }
        return { title, url, textExcerpt, interactiveElements };
      })()`,
      returnByValue: true,
    });

    const pageInfo = domSnapshotEval?.result?.value ?? {
      title: "",
      url: options.url,
      textExcerpt: "",
      interactiveElements: [],
    };

    let screenshotPath: string | undefined;
    let snapshotName: string | undefined;
    if (options.mode === "screenshot") {
      const shot = await session.send<{ data?: string }>("Page.captureScreenshot", {
        format: "png",
      });
      if (shot?.data) {
        const snapshotsDir = path.join(process.cwd(), "data", "snapshots");
        mkdirSync(snapshotsDir, { recursive: true });
        const defaultName = `snap-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        const resolvedOut = options.outPath
          ? path.resolve(process.cwd(), options.outPath)
          : path.join(snapshotsDir, defaultName);
        mkdirSync(path.dirname(resolvedOut), { recursive: true });
        writeFileSync(resolvedOut, Buffer.from(shot.data, "base64"));
        screenshotPath = resolvedOut;
        if (resolvedOut.startsWith(snapshotsDir)) {
          snapshotName = path.basename(resolvedOut);
        }
      }
    }

    return {
      ok: true,
      url: pageInfo.url,
      title: pageInfo.title,
      viewport: { width, height },
      consoleErrors,
      textExcerpt: pageInfo.textExcerpt,
      interactiveElements: pageInfo.interactiveElements,
      evalResult,
      screenshotPath,
      snapshotName,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    session?.close();
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
