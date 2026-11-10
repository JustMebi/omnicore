/// The value types a provider can return. See `spec/api.md` section 2.1.
enum ValueType {
  bool,
  int,
  double,
  string,
  json;

  static ValueType parse(String name) =>
      ValueType.values.firstWhere((t) => t.name == name,
          orElse: () => throw FormatException('Unknown value type: $name'));
}

/// A typed value returned by a provider for one key.
final class ProviderValue {
  const ProviderValue(this.type, this.value);

  final ValueType type;
  final Object? value;

  /// Whether [value] matches [type]. Null never matches (spec section 2.3).
  bool get isWellTyped => switch (type) {
        ValueType.bool => value is bool,
        ValueType.int => value is int,
        ValueType.double => value is double,
        ValueType.string => value is String,
        ValueType.json => value is Map || value is List,
      };

  factory ProviderValue.fromJson(Map<String, Object?> json) => ProviderValue(
        ValueType.parse(json['type']! as String),
        json['value'],
      );

  @override
  String toString() => 'ProviderValue($type, $value)';
}
