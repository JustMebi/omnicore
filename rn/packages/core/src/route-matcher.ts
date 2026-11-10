/**
 * Matches a path template such as `/product/:id` against a path and query.
 * See spec/api.md section 1.2.
 *
 * Returns the merged params, or null when the pattern does not match.
 * Path params override query params of the same name.
 */
export function matchRoute(
  pattern: string,
  path: string,
  query: Readonly<Record<string, string>>,
): Record<string, string> | null {
  const patternSegments = segments(pattern);
  const pathSegments = segments(path);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = { ...query };
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i]!;
    const actual = pathSegments[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = actual;
    } else if (p !== actual) {
      return null;
    }
  }
  return params;
}

function segments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}
