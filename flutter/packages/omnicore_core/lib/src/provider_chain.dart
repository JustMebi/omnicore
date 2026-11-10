import 'events.dart';
import 'provider.dart';
import 'provider_value.dart';

/// Resolves keys across overrides, flag providers, config providers and local
/// defaults, in that order. See `spec/api.md` sections 2.3 and 2.4.
final class ProviderChain {
  ProviderChain({
    List<OmniProvider> flagProviders = const [],
    List<OmniProvider> configProviders = const [],
    this.onEvent,
  })  : _flagProviders = List.unmodifiable(flagProviders),
        _configProviders = List.unmodifiable(configProviders);

  final List<OmniProvider> _flagProviders;
  final List<OmniProvider> _configProviders;
  final Map<String, ProviderValue> _overrides = {};
  final Map<String, Future<void>> _inFlight = {};

  /// Receives every event synchronously. Optional.
  final void Function(OmniEvent event)? onEvent;

  void setOverride(String key, ProviderValue value) => _overrides[key] = value;

  void clearOverride(String key) => _overrides.remove(key);

  /// The first defined value in resolution order, or `null` if none.
  ProviderValue? resolve(String key) {
    final override = _overrides[key];
    if (override != null) return override;

    for (final provider in [..._flagProviders, ..._configProviders]) {
      final value = provider.get(key);
      if (value != null) return value;
    }
    return null;
  }

  bool getBool(String key, {bool? defaultValue}) =>
      _typed(key, ValueType.bool, defaultValue, zero: false);

  int getInt(String key, {int? defaultValue}) =>
      _typed(key, ValueType.int, defaultValue, zero: 0);

  double getDouble(String key, {double? defaultValue}) =>
      _typed(key, ValueType.double, defaultValue, zero: 0.0);

  String getString(String key, {String? defaultValue}) =>
      _typed(key, ValueType.string, defaultValue, zero: '');

  Map<String, Object?> getJson(String key, {Map<String, Object?>? defaultValue}) =>
      _typed(key, ValueType.json, defaultValue, zero: <String, Object?>{});

  T _typed<T>(
    String key,
    ValueType type,
    T? defaultValue, {
    required T zero,
  }) {
    final value = resolve(key);
    if (value == null) {
      if (defaultValue != null) return defaultValue;
      _emit(OmniCode.missingKey, key: key, message: 'No value for "$key".');
      return zero;
    }
    if (value.type != type || !value.isWellTyped) {
      _emit(OmniCode.typeMismatch,
          key: key,
          message: 'Expected ${type.name} for "$key", got ${value.type.name}.');
      return defaultValue ?? zero;
    }
    return value.value as T;
  }

  /// Refreshes every provider. Concurrent calls for the same provider share
  /// one in-flight request (spec section 2.4).
  Future<void> refresh() => Future.wait([
        for (final p in [..._flagProviders, ..._configProviders]) _refreshOne(p),
      ]);

  Future<void> _refreshOne(OmniProvider provider) {
    return _inFlight.putIfAbsent(provider.name, () async {
      try {
        await provider.refresh();
        _emit(OmniCode.refreshSucceeded, provider: provider.name);
      } catch (e) {
        _emit(OmniCode.refreshFailed,
            provider: provider.name, message: e.toString());
      } finally {
        _inFlight.remove(provider.name);
      }
    });
  }

  void _emit(OmniCode code, {String? key, String? provider, String message = ''}) {
    onEvent?.call(OmniEvent(code, key: key, provider: provider, message: message));
  }
}
