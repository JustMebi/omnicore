/** The value types a provider can return. See spec/api.md section 2.1. */
export const VALUE_TYPES = ['bool', 'int', 'double', 'string', 'json'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

/** A typed value returned by a provider for one key. */
export interface ProviderValue {
  readonly type: ValueType;
  readonly value: unknown;
}

/** Whether `value` matches `type`. null never matches (spec section 2.3). */
export function isWellTyped(v: ProviderValue): boolean {
  switch (v.type) {
    case 'bool':
      return typeof v.value === 'boolean';
    case 'int':
      return Number.isInteger(v.value);
    case 'double':
      return typeof v.value === 'number';
    case 'string':
      return typeof v.value === 'string';
    case 'json':
      return typeof v.value === 'object' && v.value !== null;
  }
}

/** Parses the fixture/wire shape `{ type, value }`. */
export function providerValueFromJson(json: { type: string; value: unknown }): ProviderValue {
  if (!(VALUE_TYPES as readonly string[]).includes(json.type)) {
    throw new TypeError(`Unknown value type: ${json.type}`);
  }
  return { type: json.type as ValueType, value: json.value };
}
