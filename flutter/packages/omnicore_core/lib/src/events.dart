/// Stable event and error codes. See `spec/api.md` section 4.
enum OmniCode {
  invalidUri('invalid_uri'),
  typeMismatch('type_mismatch'),
  missingKey('missing_key'),
  providerUnavailable('provider_unavailable'),
  configInvalid('config_invalid'),
  refreshSucceeded('refresh_succeeded'),
  refreshFailed('refresh_failed');

  const OmniCode(this.wire);

  /// The code as written in the spec and fixtures.
  final String wire;
}

/// An error or lifecycle event emitted by the SDK.
final class OmniEvent {
  const OmniEvent(this.code, {this.key, this.provider, this.message = ''});

  final OmniCode code;
  final String? key;
  final String? provider;

  /// Human readable. Not for parsing.
  final String message;

  @override
  String toString() => 'OmniEvent(${code.wire}, key: $key, provider: $provider)';
}
