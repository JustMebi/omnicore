import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DeepLinkParser,
  OmniCode,
  ProviderChain,
  matchRoute,
  providerValueFromJson,
  type OmniEvent,
  type OmniProvider,
  type ProviderValue,
} from './index.js';

/** Shared fixtures live at the repository root, not in this package. */
function fixture<T>(name: string): T {
  const url = new URL(`../../../../spec/conformance/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

type Json = Record<string, unknown>;
const nullToUndefined = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v ?? undefined);

class FakeProvider implements OmniProvider {
  snapshot = new Map<string, ProviderValue>();
  refreshOutcome: 'throw' | Map<string, ProviderValue> | undefined;
  fetches = 0;
  gate: Promise<void> | undefined;

  constructor(readonly name: string, values: Record<string, Json> = {}) {
    for (const [k, v] of Object.entries(values)) {
      this.snapshot.set(k, providerValueFromJson(v as { type: string; value: unknown }));
    }
  }

  get(key: string): ProviderValue | undefined {
    return this.snapshot.get(key);
  }

  async refresh(): Promise<void> {
    this.fetches++;
    if (this.gate) await this.gate;
    if (this.refreshOutcome === 'throw') throw new Error('upstream down');
    if (this.refreshOutcome instanceof Map) this.snapshot = this.refreshOutcome;
  }
}

const deepLinkFixture = fixture<{
  config: { allowedSchemes: string[]; allowedHosts: string[] };
  parse: { name: string; input: string; expected: Record<string, unknown> }[];
  reject: { name: string; input: string }[];
  match: {
    name: string;
    pattern: string;
    path: string;
    query: Record<string, string>;
    expected: { matched: boolean; params: Record<string, string> };
  }[];
}>('deep-link.json');

describe('deep link parsing (spec 1.1)', () => {
  const parser = new DeepLinkParser(deepLinkFixture.config);

  for (const c of deepLinkFixture.parse) {
    it(c.name, () => {
      expect(parser.parse(c.input)).toEqual(c.expected);
    });
  }

  for (const c of deepLinkFixture.reject) {
    it(`rejects: ${c.name}`, () => {
      expect(parser.parse(c.input)).toBeNull();
    });
  }
});

describe('route matching (spec 1.2)', () => {
  for (const c of deepLinkFixture.match) {
    it(c.name, () => {
      const result = matchRoute(c.pattern, c.path, c.query);
      expect(result !== null).toBe(c.expected.matched);
      expect(result ?? {}).toEqual(c.expected.params);
    });
  }
});

type Call = {
  key: string;
  accessor: 'bool' | 'int' | 'string' | 'json';
  default: unknown;
  expected: { value: unknown; event: string | null };
};

function invoke(chain: ProviderChain, call: Call): unknown {
  const d = nullToUndefined(call.default);
  switch (call.accessor) {
    case 'bool':
      return chain.getBoolean(call.key, d as boolean | undefined);
    case 'int':
      return chain.getInt(call.key, d as number | undefined);
    case 'string':
      return chain.getString(call.key, d as string | undefined);
    case 'json':
      return chain.getJson(call.key, d as Json | undefined);
  }
}

const resolutionFixture = fixture<{
  cases: {
    name: string;
    overrides: Record<string, unknown>;
    flagProviders: { name: string; values: Record<string, Json> }[];
    configProviders: { name: string; values: Record<string, Json> }[];
    calls: Call[];
  }[];
  refresh: {
    name: string;
    snapshot?: Record<string, Json>;
    refreshOutcome?: 'throw' | Record<string, Json>;
    calls?: (Call & { default: boolean | null })[];
    concurrentRefreshCalls?: number;
    expected?: { upstreamFetches: number };
  }[];
}>('resolution.json');

describe('resolution (spec 2.3)', () => {
  for (const c of resolutionFixture.cases) {
    it(c.name, () => {
      const events: OmniEvent[] = [];
      const chain = new ProviderChain({
        flagProviders: c.flagProviders.map((p) => new FakeProvider(p.name, p.values)),
        configProviders: c.configProviders.map((p) => new FakeProvider(p.name, p.values)),
        onEvent: (e) => events.push(e),
      });
      for (const [k, v] of Object.entries(c.overrides)) {
        chain.setOverride(k, inferOverride(v));
      }

      for (const call of c.calls) {
        events.length = 0;
        expect(invoke(chain, call), call.key).toEqual(call.expected.value);
        const codes = events.map((e) => e.code);
        expect(codes, call.key).toEqual(call.expected.event ? [call.expected.event] : []);
      }
    });
  }
});

describe('refresh (spec 2.4)', () => {
  for (const c of resolutionFixture.refresh.filter((r) => r.calls)) {
    it(c.name, async () => {
      const events: OmniEvent[] = [];
      const provider = new FakeProvider('local-json', c.snapshot);
      const outcome = c.refreshOutcome;
      provider.refreshOutcome =
        outcome === 'throw' || outcome === undefined
          ? outcome
          : new Map(Object.entries(outcome).map(([k, v]) => [k, providerValueFromJson(v as never)]));
      const chain = new ProviderChain({ flagProviders: [provider], onEvent: (e) => events.push(e) });

      await chain.refresh();

      for (const call of c.calls!) {
        const actual = chain.getBoolean(call.key, nullToUndefined(call.default));
        expect(actual).toEqual(call.expected.value);
        expect(events.map((e) => e.code)).toContain(call.expected.event);
      }
    });
  }

  it('concurrent refresh calls share one in-flight request', async () => {
    const provider = new FakeProvider('firebase-remote-config');
    let release!: () => void;
    provider.gate = new Promise<void>((resolve) => (release = resolve));
    const chain = new ProviderChain({ configProviders: [provider] });

    const calls = [chain.refresh(), chain.refresh(), chain.refresh()];
    release();
    await Promise.all(calls);

    expect(provider.fetches).toBe(1);
  });
});

/** Infers the value type of an override from its JSON runtime type. */
function inferOverride(raw: unknown): ProviderValue {
  if (typeof raw === 'boolean') return { type: 'bool', value: raw };
  if (typeof raw === 'number') return { type: Number.isInteger(raw) ? 'int' : 'double', value: raw };
  if (typeof raw === 'string') return { type: 'string', value: raw };
  throw new TypeError(`Unsupported override ${String(raw)}`);
}

// Keeps the codes list in sync with the spec's error table.
describe('event codes', () => {
  it('match the spec wire names', () => {
    expect(Object.values(OmniCode)).toEqual([
      'invalid_uri',
      'type_mismatch',
      'missing_key',
      'provider_unavailable',
      'config_invalid',
      'refresh_succeeded',
      'refresh_failed',
    ]);
  });
});
