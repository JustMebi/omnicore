/// Matches a path template such as `/product/:id` against a path and query.
/// See `spec/api.md` section 1.2.
///
/// Returns the merged params, or `null` when the pattern does not match.
/// Path params override query params of the same name.
Map<String, String>? matchRoute(
  String pattern,
  String path,
  Map<String, String> query,
) {
  final patternSegments = _segments(pattern);
  final pathSegments = _segments(path);
  if (patternSegments.length != pathSegments.length) return null;

  final params = {...query};
  for (var i = 0; i < patternSegments.length; i++) {
    final p = patternSegments[i];
    final actual = pathSegments[i];
    if (p.startsWith(':')) {
      params[p.substring(1)] = actual;
    } else if (p != actual) {
      return null;
    }
  }
  return params;
}

List<String> _segments(String path) =>
    path.split('/').where((s) => s.isNotEmpty).toList();
