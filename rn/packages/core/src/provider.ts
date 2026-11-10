import type { ProviderValue } from './provider-value.js';

/** A source of values for keys. See spec/api.md section 2.2. */
export interface OmniProvider {
  /** Stable identifier, e.g. `launchdarkly` or `local-json`. */
  readonly name: string;

  /**
   * Returns the value for `key`, or undefined when this provider has no
   * opinion. Must be synchronous and read from the last snapshot.
   */
  get(key: string): ProviderValue | undefined;

  /**
   * Fetches the latest data. Rejects on failure. A failure must keep the
   * previous snapshot (spec section 2.4).
   */
  refresh(): Promise<void>;
}
