/** Stable event and error codes. See spec/api.md section 4. */
export const OmniCode = {
  InvalidUri: 'invalid_uri',
  TypeMismatch: 'type_mismatch',
  MissingKey: 'missing_key',
  ProviderUnavailable: 'provider_unavailable',
  ConfigInvalid: 'config_invalid',
  RefreshSucceeded: 'refresh_succeeded',
  RefreshFailed: 'refresh_failed',
} as const;
export type OmniCode = (typeof OmniCode)[keyof typeof OmniCode];

/** An error or lifecycle event emitted by the SDK. */
export interface OmniEvent {
  readonly code: OmniCode;
  readonly key?: string;
  readonly provider?: string;
  /** Human readable. Not for parsing. */
  readonly message: string;
}
