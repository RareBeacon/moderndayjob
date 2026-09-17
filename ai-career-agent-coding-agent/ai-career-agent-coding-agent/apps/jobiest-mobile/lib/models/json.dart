/// Defensive JSON readers shared by every model.
///
/// The backend is the single source of truth; the app must never invent a
/// field that the API did not send, so unknown/absent values become null or an
/// explicit empty value instead of a made-up default.
library;

String? asString(Object? value) {
  if (value is String) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  if (value is num) return value.toString();
  return null;
}

String asStringOr(Object? value, String fallback) => asString(value) ?? fallback;

int asInt(Object? value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

double? asDouble(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

bool asBool(Object? value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is String) return value.toLowerCase() == 'true';
  return fallback;
}

DateTime? asDate(Object? value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

Map<String, dynamic> asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return <String, dynamic>{};
}

List<String> asStringList(Object? value) {
  if (value is List) {
    return value.whereType<String>().map((item) => item.trim()).where((item) => item.isNotEmpty).toList();
  }
  if (value is String && value.trim().isNotEmpty) return <String>[value.trim()];
  return <String>[];
}

List<Map<String, dynamic>> asMapList(Object? value) {
  if (value is List) return value.whereType<Map<String, dynamic>>().toList();
  return <Map<String, dynamic>>[];
}
