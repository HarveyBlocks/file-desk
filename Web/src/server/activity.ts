/** Metadata shared with the desktop host through a process-wide request context. */
interface ActiveTask {
  path: string;
  phase: string;
  completed: number;
  total: number | null;
  unit: string;
  controller: AbortController;
  streaming?: boolean;
  pendingSources?: number;
  onSettled?: () => void;
}

function current(): ActiveTask | undefined {
  const runtime = globalThis as typeof globalThis & {
    [key: symbol]: { current(): ActiveTask | undefined } | undefined;
  };
  return runtime[Symbol.for("FileDesk.activity")]?.current();
}

/** Merge host cancellation with the browser signal while keeping standalone Web use valid. */
export function taskSignal(signal?: AbortSignal): AbortSignal | undefined {
  const hostSignal = current()?.controller.signal;
  if (hostSignal && signal) return AbortSignal.any([hostSignal, signal]);
  return hostSignal ?? signal;
}

/** Report semantic progress; HTTP byte accounting remains owned by the host. */
export function updateTask(update: Partial<Pick<ActiveTask, "path" | "phase" | "completed" | "total" | "unit">>): void {
  const task = current();
  if (task) Object.assign(task, update);
}

/** Keep transfer tasks alive until their file/ZIP sources have actually closed. */
export function trackTaskSource(source: { once(event: "close", listener: () => void): unknown }): void {
  const task = current();
  if (!task) return;
  task.streaming = true;
  task.pendingSources = (task.pendingSources ?? 0) + 1;
  source.once("close", () => {
    task.pendingSources = (task.pendingSources ?? 1) - 1;
    task.onSettled?.();
  });
}
