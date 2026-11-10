# OmniCore Behavioural Specification

This document is normative. Every SDK (Flutter, React Native) must behave exactly as
described here. Where an SDK and this document disagree, the SDK is wrong.
Conformance fixtures in `conformance/` encode the testable parts of this spec.

Keywords MUST, MUST NOT, SHOULD and MAY are used as defined in RFC 2119.

---

## 1. Deep Links

### 1.1 Parsing

Input: a raw URI string received from the OS (cold start, warm start, or in-app).

A parser MUST:

1. Reject the input (return `null` / `undefined` in the language's idiom, no exception) if:
   - it is not a parseable absolute URI, or
   - its scheme is not in the configured `allowedSchemes` list (case-insensitive), or
   - its scheme is `http` or `https` and its host is not in the configured `allowedHosts` list.
2. Otherwise return a `DeepLink` with:
   - `scheme`: lowercased.
   - `host`: lowercased, or `null` when absent.
   - `path`: the path component, percent-decoded per segment, with a single trailing `/` removed. Empty path is `"/"`.
   - `query`: a map of key to value. Keys are percent-decoded. When a key repeats, the **last** occurrence wins. A key with no `=` maps to `""`.
   - `fragment`: the fragment without `#`, or `null`.
   - `raw`: the input string, unmodified.
3. Never throw on malformed input.

### 1.2 Routing

A route pattern is a path template such as `/product/:id`. Segment placeholders begin with `:`.
Matching is exact on segment count. Literal segments compare case-sensitively.
On match, the placeholder values are merged into `params` (path params take precedence over query params with the same name).

### 1.3 Delivery

- Cold start: the initial link is buffered until the app registers a handler, then delivered once.
- Warm start: links are delivered on a stream, in arrival order, without dropping.
- A link that fails parsing is dropped and reported through the error channel (see §4). It is not delivered to the stream.

---

## 2. Flags and Remote Config

### 2.1 Value types

Only these value types exist: `bool`, `int`, `double`, `string`, `json` (an arbitrary JSON object or array).
Typed accessors MUST NOT coerce between types. Requesting `bool` for a `string` value is a type mismatch error (§4).

### 2.2 Providers

A **provider** is a source of values for keys. Every provider implements:

- `name` (stable identifier, e.g. `firebase-remote-config`, `launchdarkly`, `unleash`, `local-json`)
- `get(key)` returning either a value, or *absent*. Absent means "this provider has no opinion".
- `refresh()` returning when the provider has fetched its latest data, or throwing a provider error.

Two provider roles exist:

- `FlagProvider`: boolean and variant flags. Typically evaluated per user context.
- `ConfigProvider`: typed remote configuration values.

### 2.3 Resolution order

For a key `k`, the value is the first defined result in this chain:

1. **Override**: a value set programmatically via `setOverride(k, v)`. Used by tests and debug menus.
2. **FlagProvider** chain, in registration order.
3. **ConfigProvider** chain, in registration order.
4. **Local default**: the default passed to the accessor at the call site.

"Defined" means the provider returned a value, not *absent*. A provider that returns `null` for a key it knows about is returning a defined null, which is a type mismatch error for non-nullable accessors.

If no value is defined and no default was supplied, the accessor MUST return the type's zero value and emit a `missing_key` event (§4). Zero values: `false`, `0`, `0.0`, `""`, and an empty object for `json`.

### 2.4 Caching

- The SDK keeps the last successfully fetched snapshot per provider, persisted to local storage when the platform allows.
- On startup the SDK serves the persisted snapshot immediately, then calls `refresh()` in the background.
- A failed `refresh()` MUST NOT clear the existing snapshot. It emits a `refresh_failed` event (§4).
- `refresh()` calls are rate-limited to at most one in flight per provider. A second call while one is in flight returns the same promise.

### 2.5 Adapters

Adapters map a vendor SDK onto the `get`/`refresh` contract. They MUST NOT add their own precedence logic. Specific mappings:

- **Firebase Remote Config**: `get` reads the activated value. Value source `static` or `default` counts as absent. `refresh` calls fetch-and-activate.
- **LaunchDarkly**: `get` evaluates against the current context. A flag whose evaluation reason is `ERROR` counts as absent. `refresh` waits for the initial stream payload.
- **Unleash**: `get` reads the cached toggle set. A toggle missing from the set counts as absent. `refresh` polls the proxy/client endpoint.
- **local-json**: reads from a bundled JSON object. Always fully defined for keys it contains. Used for tests, offline demos and defaults.

---

## 3. Context

A **context** is a map of string keys to primitive values (`userId`, `country`, `appVersion`, `platform`).
The SDK holds one context. `setContext(ctx)` replaces it and triggers `refresh()` on all flag providers.
Providers that do not use context ignore it.

---

## 4. Errors and Events

Errors are values, not exceptions, when crossing the public API. Each error has a stable `code`:

| code | When |
|---|---|
| `invalid_uri` | Deep link failed §1.1 |
| `type_mismatch` | Typed accessor found a value of a different type |
| `missing_key` | No value and no default |
| `provider_unavailable` | `refresh()` failed |
| `config_invalid` | Provider config (keys, URLs) failed validation at construction |

Events are emitted on an `onEvent` stream/listener. Event names mirror error codes plus `refresh_succeeded`.
Each event carries `code`, `key` (when relevant), `provider` (when relevant) and `message` (human readable, not for parsing).

---

## 5. Versioning

- The spec version is in `spec/VERSION`. It follows semver.
- A breaking change to any rule above is a major bump and requires an ADR in `docs/adr/`.
- SDKs declare the spec version they implement in their package metadata.
