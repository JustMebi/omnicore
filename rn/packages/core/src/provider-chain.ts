import { OmniCode, type OmniEvent } from './events.js';
import type { OmniProvider } from './provider.js';
import { isWellTyped, type ProviderValue, type ValueType } from './provider-value.js';

export interface ProviderChainOptions {
  readonly flagProviders?: readonly OmniProvider[];
  readonly configProviders?: readonly OmniProvider[];
  /** Receives every event synchronously. Optional. */
  readonly onEvent?: (event: OmniEvent) => void;
}

/**
 * Resolves keys across overrides, flag providers, config providers and local
 * defaults, in that order. See spec/api.md sections 2.3 and 2.4.
 */
export class ProviderChain {
  private readonly flagProviders: readonly OmniProvider[];
  private readonly configProviders: readonly OmniProvider[];
  private readonly onEvent?: (event: OmniEvent) => void;
  private readonly overrides = new Map<string, ProviderValue>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(options: ProviderChainOptions = {}) {
    this.flagProviders = options.flagProviders ?? [];
    this.configProviders = options.configProviders ?? [];
    this.onEvent = options.onEvent;
  }

  setOverride(key: string, value: ProviderValue): void {
    this.overrides.set(key, value);
  }

  clearOverride(key: string): void {
    this.overrides.delete(key);
  }

  /** The first defined value in resolution order, or undefined if none. */
  resolve(key: string): ProviderValue | undefined {
    const override = this.overrides.get(key);
    if (override !== undefined) return override;

    for (const provider of [...this.flagProviders, ...this.configProviders]) {
      const value = provider.get(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    return this.typed(key, 'bool', defaultValue, false);
  }

  getInt(key: string, defaultValue?: number): number {
    return this.typed(key, 'int', defaultValue, 0);
  }

  getDouble(key: string, defaultValue?: number): number {
    return this.typed(key, 'double', defaultValue, 0);
  }

  getString(key: string, defaultValue?: string): string {
    return this.typed(key, 'string', defaultValue, '');
  }

  getJson<T extends object = Record<string, unknown>>(key: string, defaultValue?: T): T {
    return this.typed(key, 'json', defaultValue, {} as T);
  }

  /**
   * Refreshes every provider. Concurrent calls for the same provider share one
   * in-flight request (spec section 2.4).
   */
  refresh(): Promise<void> {
    const all = [...this.flagProviders, ...this.configProviders].map((p) => this.refreshOne(p));
    return Promise.all(all).then(() => undefined);
  }

  private typed<T>(key: string, type: ValueType, defaultValue: T | undefined, zero: T): T {
    const value = this.resolve(key);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      this.emit({ code: OmniCode.MissingKey, key, message: `No value for "${key}".` });
      return zero;
    }
    if (value.type !== type || !isWellTyped(value)) {
      this.emit({
        code: OmniCode.TypeMismatch,
        key,
        message: `Expected ${type} for "${key}", got ${value.type}.`,
      });
      return defaultValue ?? zero;
    }
    return value.value as T;
  }

  private refreshOne(provider: OmniProvider): Promise<void> {
    const existing = this.inFlight.get(provider.name);
    if (existing) return existing;

    const request = provider
      .refresh()
      .then(
        () => this.emit({ code: OmniCode.RefreshSucceeded, provider: provider.name, message: '' }),
        (err: unknown) =>
          this.emit({
            code: OmniCode.RefreshFailed,
            provider: provider.name,
            message: err instanceof Error ? err.message : String(err),
          }),
      )
      .finally(() => this.inFlight.delete(provider.name));

    this.inFlight.set(provider.name, request);
    return request;
  }

  private emit(event: OmniEvent): void {
    this.onEvent?.(event);
  }
}
