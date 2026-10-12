/** Delay transport-only opening frames until real output or the first
 * heartbeat. An early failure can then retain its HTTP status. Once a frame
 * has been delivered, failure must use the protocol's SSE terminal event. */
export class SSEPreflight {
  private state: "pending" | "committed" | "failed" = "pending";
  private readonly opening: Uint8Array[] = [];
  private resolve!: () => void;
  private reject!: (cause: unknown) => void;
  readonly ready: Promise<void> = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
  constructor(committed = false) { if (committed) { this.state = "committed"; this.resolve(); } }
  enqueue(controller: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array, startup = false): void {
    if (this.state === "failed") return;
    if (startup && this.state === "pending") { this.opening.push(data); return; }
    if (this.state === "pending") {
      for (const frame of this.opening.splice(0)) controller.enqueue(frame);
      controller.enqueue(data);
      this.state = "committed";
      this.resolve();
    } else controller.enqueue(data);
  }
  fail(cause: unknown): boolean {
    if (this.state !== "pending") return false;
    this.state = "failed";
    this.opening.length = 0;
    this.reject(cause);
    return true;
  }
  get failed(): boolean { return this.state === "failed"; }
}
