import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:omnicore_core/omnicore_core.dart';
import 'package:test/test.dart';

/// Shared fixtures live at the repository root, not in this package.
Map<String, Object?> _fixture(String name) {
  final file = File('../../../spec/conformance/$name');
  return jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
}

/// Test provider with a mutable snapshot, optional failure and fetch counter.
final class FakeProvider implements OmniProvider {
  FakeProvider(this.name, [Map<String, ProviderValue>? values])
      : snapshot = {...?values};

  @override
  final String name;
  Map<String, ProviderValue> snapshot;
  Object? refreshOutcome; // Map<String, ProviderValue> | 'throw' | null
  int fetches = 0;
  Completer<void>? gate;

  @override
  ProviderValue? get(String key) => snapshot[key];

  @override
  Future<void> refresh() async {
    fetches++;
    if (gate != null) await gate!.future;
    if (refreshOutcome == 'throw') throw StateError('upstream down');
    if (refreshOutcome is Map<String, ProviderValue>) {
      snapshot = refreshOutcome as Map<String, ProviderValue>;
    }
  }
}

Map<String, ProviderValue> _values(Map<String, Object?> raw) => {
      for (final e in raw.entries)
        e.key: ProviderValue.fromJson(e.value! as Map<String, Object?>),
    };

ProviderValue _inferOverride(Object? raw) => switch (raw) {
      bool() => ProviderValue(ValueType.bool, raw),
      int() => ProviderValue(ValueType.int, raw),
      double() => ProviderValue(ValueType.double, raw),
      String() => ProviderValue(ValueType.string, raw),
      _ => throw ArgumentError('Unsupported override $raw'),
    };

void main() {
  group('deep link parsing (spec 1.1)', () {
    final fixture = _fixture('deep-link.json');
    final config = fixture['config']! as Map<String, Object?>;
    final parser = DeepLinkParser(
      allowedSchemes: (config['allowedSchemes']! as List).cast<String>(),
      allowedHosts: (config['allowedHosts']! as List).cast<String>(),
    );

    for (final c in (fixture['parse']! as List).cast<Map<String, Object?>>()) {
      test(c['name']! as String, () {
        final link = parser.parse(c['input']! as String);
        expect(link, isNotNull);
        final e = c['expected']! as Map<String, Object?>;
        expect(link!.scheme, e['scheme']);
        expect(link.host, e['host']);
        expect(link.path, e['path']);
        expect(link.query, e['query']);
        expect(link.fragment, e['fragment']);
        expect(link.raw, e['raw']);
      });
    }

    for (final c in (fixture['reject']! as List).cast<Map<String, Object?>>()) {
      test('rejects: ${c['name']}', () {
        expect(parser.parse(c['input']! as String), isNull);
      });
    }
  });

  group('route matching (spec 1.2)', () {
    final fixture = _fixture('deep-link.json');
    for (final c in (fixture['match']! as List).cast<Map<String, Object?>>()) {
      test(c['name']! as String, () {
        final query = (c['query']! as Map<String, Object?>).cast<String, String>();
        final result = matchRoute(
          c['pattern']! as String,
          c['path']! as String,
          query,
        );
        final e = c['expected']! as Map<String, Object?>;
        expect(result != null, e['matched']);
        expect(result ?? <String, String>{}, e['params']);
      });
    }
  });

  group('resolution (spec 2.3)', () {
    final fixture = _fixture('resolution.json');
    for (final c in (fixture['cases']! as List).cast<Map<String, Object?>>()) {
      test(c['name']! as String, () {
        final overrides = (c['overrides']! as Map<String, Object?>);
        final events = <OmniEvent>[];
        final chain = ProviderChain(
          flagProviders: [
            for (final p in (c['flagProviders']! as List).cast<Map<String, Object?>>())
              FakeProvider(p['name']! as String,
                  _values(p['values']! as Map<String, Object?>)),
          ],
          configProviders: [
            for (final p in (c['configProviders']! as List).cast<Map<String, Object?>>())
              FakeProvider(p['name']! as String,
                  _values(p['values']! as Map<String, Object?>)),
          ],
          onEvent: events.add,
        );
        overrides.forEach((k, v) => chain.setOverride(k, _inferOverride(v)));

        for (final call in (c['calls']! as List).cast<Map<String, Object?>>()) {
          events.clear();
          final key = call['key']! as String;
          final defaultValue = call['default'];
          final expected = call['expected']! as Map<String, Object?>;
          final Object? actual = switch (call['accessor']) {
            'bool' => chain.getBool(key, defaultValue: defaultValue as bool?),
            'int' => chain.getInt(key, defaultValue: defaultValue as int?),
            'string' => chain.getString(key, defaultValue: defaultValue as String?),
            'json' => chain.getJson(key,
                defaultValue: (defaultValue as Map<String, Object?>?)),
            _ => throw ArgumentError('accessor'),
          };
          expect(actual, expected['value'], reason: key);
          final expectedEvent = expected['event'] as String?;
          if (expectedEvent == null) {
            expect(events, isEmpty, reason: key);
          } else {
            expect(events.map((e) => e.code.wire), [expectedEvent], reason: key);
          }
        }
      });
    }
  });

  group('refresh (spec 2.4)', () {
    final fixture = _fixture('resolution.json');
    final cases = (fixture['refresh']! as List).cast<Map<String, Object?>>();

    for (final c in cases.where((c) => c.containsKey('calls'))) {
      test(c['name']! as String, () async {
        final events = <OmniEvent>[];
        final provider = FakeProvider('local-json', _values(c['snapshot']! as Map<String, Object?>));
        final outcome = c['refreshOutcome'];
        provider.refreshOutcome =
            outcome is Map<String, Object?> ? _values(outcome) : outcome;
        final chain = ProviderChain(flagProviders: [provider], onEvent: events.add);

        await chain.refresh();

        for (final call in (c['calls']! as List).cast<Map<String, Object?>>()) {
          final expected = call['expected']! as Map<String, Object?>;
          final actual = chain.getBool(call['key']! as String,
              defaultValue: call['default'] as bool?);
          expect(actual, expected['value']);
          expect(events.map((e) => e.code.wire), contains(expected['event']));
        }
      });
    }

    test('concurrent refresh calls share one in-flight request', () async {
      final provider = FakeProvider('firebase-remote-config')..gate = Completer<void>();
      final chain = ProviderChain(configProviders: [provider]);

      final futures = [for (var i = 0; i < 3; i++) chain.refresh()];
      provider.gate!.complete();
      await Future.wait(futures);

      expect(provider.fetches, 1);
    });
  });
}
