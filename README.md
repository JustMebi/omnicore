# OmniCore SDK

A polyglot reference monorepo proving one SDK contract — **Deep Linking, Remote Config and Feature Flags** — implemented in both Flutter (Melos) and React Native (Nx + pnpm).

The contract lives in `spec/`. Both SDKs run the same conformance fixtures in `spec/conformance/` directly, so a behaviour change must be made in the spec and passed by both.

## Layout

| Path | Purpose |
|---|---|
| `spec/` | Behavioural spec (`api.md`), JSON Schemas, conformance fixtures, spec version |
| `flutter/` | Melos workspace. `packages/omnicore_core` is the pure Dart core |
| `rn/` | pnpm + Nx workspace. `packages/core` is the TypeScript core |
| `.github/workflows/ci.yml` | Runs analyze/test for Flutter and typecheck/test for RN |

## Running

```sh
# Flutter
cd flutter && dart pub get && melos bootstrap && melos run test && melos run analyze

# React Native
cd rn && pnpm install && pnpm exec nx run-many -t typecheck test
```

## Status

- Spec 0.1.0 (`spec/VERSION`).
- Core implemented in Dart and TypeScript. Both pass the shared fixtures (25 and 26 tests).
- Not yet built: adapters (Firebase, LaunchDarkly, Unleash), native deep link bridges, example apps.
