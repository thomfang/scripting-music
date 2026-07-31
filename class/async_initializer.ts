export type AsyncInitializerState = "idle" | "initializing" | "ready" | "failed"

/**
 * Concurrency-safe, retryable initializer.
 *
 * - concurrent callers share one in-flight Promise
 * - successful work runs only once
 * - failed work can be retried by the next caller
 */
export class AsyncInitializer {
  private state: AsyncInitializerState = "idle"
  private inFlight: Promise<void> | null = null

  getState(): AsyncInitializerState {
    return this.state
  }

  run(task: () => Promise<void>): Promise<void> {
    if (this.state === "ready") return Promise.resolve()
    if (this.inFlight) return this.inFlight

    this.state = "initializing"
    let promise!: Promise<void>
    promise = Promise.resolve()
      .then(task)
      .then(() => {
        this.state = "ready"
      })
      .catch((error) => {
        this.state = "failed"
        throw error
      })
      .finally(() => {
        if (this.inFlight === promise) this.inFlight = null
      })

    this.inFlight = promise
    return promise
  }

  reset(): void {
    if (this.inFlight) {
      throw new Error("Cannot reset while initialization is in progress")
    }
    this.state = "idle"
  }
}
