import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The persisted session. Only the auth provider's own tokens are stored, in
/// the Android Keystore-backed encrypted store; nothing is written to plain
/// preferences and nothing is ever logged.
class StoredSession {
  StoredSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.userId,
    required this.email,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;
  final String userId;
  final String email;

  bool get isExpiringSoon =>
      DateTime.now().toUtc().isAfter(expiresAt.subtract(const Duration(seconds: 60)));

  Map<String, dynamic> toJson() => <String, dynamic>{
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'expires_at': expiresAt.toUtc().toIso8601String(),
        'user_id': userId,
        'email': email,
      };

  static StoredSession? fromJson(Map<String, dynamic> json) {
    final access = json['access_token'];
    final refresh = json['refresh_token'];
    final expires = json['expires_at'];
    final userId = json['user_id'];
    final email = json['email'];
    if (access is! String || refresh is! String || expires is! String) return null;
    final parsed = DateTime.tryParse(expires);
    if (parsed == null) return null;
    return StoredSession(
      accessToken: access,
      refreshToken: refresh,
      expiresAt: parsed.toUtc(),
      userId: userId is String ? userId : '',
      email: email is String ? email : '',
    );
  }
}

class SecureSessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  static const String _key = 'jobiest.session.v1';

  final FlutterSecureStorage _storage;

  Future<StoredSession?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return StoredSession.fromJson(decoded);
    } catch (_) {
      // A corrupt or unreadable entry means "no session"; the user signs in
      // again. Never surface storage internals to the UI.
      await clear();
      return null;
    }
  }

  Future<void> write(StoredSession session) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(session.toJson()));
    } catch (_) {
      // Persisting is best-effort: a failure only means the user must sign in
      // again after the app restarts.
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {
      // ignore
    }
  }
}
