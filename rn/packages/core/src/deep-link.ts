/** A successfully parsed deep link. See spec/api.md section 1.1. */
export interface DeepLink {
  readonly scheme: string;
  readonly host: string | null;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly fragment: string | null;
  readonly raw: string;
}

export interface DeepLinkConfig {
  readonly allowedSchemes: readonly string[];
  readonly allowedHosts: readonly string[];
}

/** Parses raw URIs against an allow-list. Never throws on malformed input. */
export class DeepLinkParser {
  private readonly schemes: ReadonlySet<string>;
  private readonly hosts: ReadonlySet<string>;

  constructor(config: DeepLinkConfig) {
    this.schemes = new Set(config.allowedSchemes.map((s) => s.toLowerCase()));
    this.hosts = new Set(config.allowedHosts.map((h) => h.toLowerCase()));
  }

  /** Returns null when the input is rejected (spec section 1.1, rule 1). */
  parse(raw: string): DeepLink | null {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }

    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    if (!this.schemes.has(scheme)) return null;

    const host = url.host === '' ? null : url.host.toLowerCase();
    const isWeb = scheme === 'http' || scheme === 'https';
    if (isWeb && (host === null || !this.hosts.has(host))) return null;

    return {
      scheme,
      host,
      path: normalisePath(url.pathname),
      query: lastWinsQuery(url.searchParams),
      fragment: url.hash === '' ? null : url.hash.slice(1),
      raw,
    };
  }
}

/** Percent-decodes each segment. A single trailing slash is dropped; root is "/". */
function normalisePath(pathname: string): string {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (trimmed === '' || trimmed === '/') return '/';
  const decoded = trimmed.split('/').slice(1).map(decodeURIComponent);
  return `/${decoded.join('/')}`;
}

function lastWinsQuery(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    result[key] = all[all.length - 1] ?? '';
  }
  return result;
}
