/**
 * Runtime guard for lesson mode — enforces the "one domain command per round" rule.
 *
 * Created per-request in lesson mode. Tracks whether a domain command tool
 * has been used in the current LLM invocation round.
 *
 * - Query tools: allowed freely before any command, blocked after a command.
 * - Domain command tools: exactly one per round. Second call returns an error string.
 * - wait_for_user: always allowed, resets the guard for the next round.
 *
 * Methods return `string | null` — null means allowed, string is the error message.
 * Tools check the return value and return a structured `{ error, action: "blocked" }`
 * response instead of throwing, so the LLM can recover gracefully.
 */
export class LessonGuard {
  private _committed = false;

  /** Whether a domain command has been executed in this round. */
  get committed(): boolean {
    return this._committed;
  }

  /**
   * Call before executing a domain command tool.
   * Returns an error message if a command was already executed in this round,
   * or null if the command is allowed (and marks it as committed).
   */
  checkCommand(): string | null {
    if (this._committed) {
      return (
        "W tej rundzie został już wykonany jedno narzędzie domenowe. " +
        "Nie można wykonać kolejnego. Użyj wait_for_user, aby zakończyć rundę."
      );
    }
    this._committed = true;
    return null;
  }

  /**
   * Call before executing a query tool.
   * Returns an error message if a command was already executed in this round,
   * because DomainState is a snapshot from the start of the request
   * and would be stale after a command.
   */
  checkQuery(): string | null {
    if (this._committed) {
      return (
        "Po narzędziu domenowym nie można już wykonywać zapytań w tej rundzie. " +
        "Stan widoku został zmieniony. Użyj wait_for_user, aby zakończyć rundę."
      );
    }
    return null;
  }

  /** Reset state — called before interrupt() in wait_for_user. */
  reset(): void {
    this._committed = false;
  }
}