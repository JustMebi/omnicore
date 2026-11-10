/// A successfully parsed deep link. See `spec/api.md` section 1.1.
final class DeepLink {
  const DeepLink({
    required this.scheme,
    required this.path,
    required this.query,
    required this.raw,
    this.host,
    this.fragment,
  });

  final String scheme;
  final String? host;
  final String path;
  final Map<String, String> query;
  final String? fragment;
  final String raw;
}

/// Parses raw URIs against an allow-list. Never throws on malformed input.
final class DeepLinkParser {
  DeepLinkParser({
    required Iterable<String> allowedSchemes,
    required Iterable<String> allowedHosts,
  })  : _allowedSchemes = allowedSchemes.map((s) => s.toLowerCase()).toSet(),
        _allowedHosts = allowedHosts.map((h) => h.toLowerCase()).toSet();

  final Set<String> _allowedSchemes;
  final Set<String> _allowedHosts;

  /// Returns `null` when the input is rejected (spec section 1.1, rule 1).
  DeepLink? parse(String raw) {
    final uri = Uri.tryParse(raw);
    // Uri.isAbsolute is false when a fragment is present, so check the scheme.
    if (uri == null || uri.scheme.isEmpty) return null;

    final scheme = uri.scheme.toLowerCase();
    if (!_allowedSchemes.contains(scheme)) return null;

    final host = uri.hasAuthority ? uri.host.toLowerCase() : null;
    final isWeb = scheme == 'http' || scheme == 'https';
    if (isWeb && !_allowedHosts.contains(host)) return null;

    return DeepLink(
      scheme: scheme,
      host: host?.isEmpty ?? true ? null : host,
      path: _normalisePath(uri.pathSegments),
      query: _lastWinsQuery(uri),
      fragment: uri.hasFragment ? uri.fragment : null,
      raw: raw,
    );
  }

  /// Segments are already percent-decoded by [Uri]. A single trailing empty
  /// segment (from a trailing slash) is dropped, and the root is `/`.
  static String _normalisePath(List<String> segments) {
    final parts = [...segments];
    if (parts.isNotEmpty && parts.last.isEmpty) parts.removeLast();
    return parts.isEmpty ? '/' : '/${parts.join('/')}';
  }

  static Map<String, String> _lastWinsQuery(Uri uri) {
    final result = <String, String>{};
    uri.queryParametersAll.forEach((key, values) {
      result[key] = values.last;
    });
    return result;
  }
}
