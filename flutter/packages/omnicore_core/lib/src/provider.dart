import 'provider_value.dart';

/// A source of values for keys. See `spec/api.md` section 2.2.
abstract interface class OmniProvider {
  /// Stable identifier, e.g. `launchdarkly` or `local-json`.
  String get name;

  /// Returns the value for [key], or `null` when this provider has no opinion.
  /// Must be synchronous and read from the last snapshot.
  ProviderValue? get(String key);

  /// Fetches the latest data. Throws on failure. A failure must keep the
  /// previous snapshot (spec section 2.4).
  Future<void> refresh();
}
