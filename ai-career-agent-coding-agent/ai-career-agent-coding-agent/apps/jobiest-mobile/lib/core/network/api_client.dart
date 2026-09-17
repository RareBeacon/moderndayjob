import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_exception.dart';

/// Provides the current access token (refreshing it when needed) and reports
/// when the backend rejected it so the session can be recovered exactly once.
typedef TokenProvider = Future<String?> Function();
typedef SessionRecovery = Future<bool> Function();

/// Thin JSON client over the existing Jobiest HTTP API.
///
/// * Sends `Authorization: Bearer <supabase access token>` — the native-client
///   contract implemented in the backend's `lib/auth.ts`.
/// * Retries a request exactly once after a 401 by asking the session layer to
///   refresh; if the refresh fails the caller gets a real
///   [ApiFailureKind.unauthenticated], never a silent fake success.
/// * Never logs tokens, passwords or response bodies.
class ApiClient {
  ApiClient({
    required AppConfig config,
    required TokenProvider tokenProvider,
    required SessionRecovery recoverSession,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 30),
  })  : _config = config,
        _tokenProvider = tokenProvider,
        _recoverSession = recoverSession,
        _http = httpClient ?? http.Client();

  final AppConfig _config;
  final TokenProvider _tokenProvider;
  final SessionRecovery _recoverSession;
  final http.Client _http;
  final Duration timeout;

  void close() => _http.close();

  Map<String, String> _headers(String? token, {bool json = true}) {
    final headers = <String, String>{
      'Accept': 'application/json',
      if (json) 'Content-Type': 'application/json',
      'X-Client': 'jobiest-android',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> getJson(String path,
          {Map<String, String>? query, bool authenticated = true}) =>
      _send('GET', path, query: query, authenticated: authenticated);

  Future<Map<String, dynamic>> postJson(String path,
          {Object? body, bool authenticated = true}) =>
      _send('POST', path, body: body, authenticated: authenticated);

  Future<Map<String, dynamic>> putJson(String path,
          {Object? body, bool authenticated = true}) =>
      _send('PUT', path, body: body, authenticated: authenticated);

  Future<Map<String, dynamic>> deleteJson(String path,
          {Object? body, bool authenticated = true}) =>
      _send('DELETE', path, body: body, authenticated: authenticated);

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool authenticated = true,
    bool allowRecovery = true,
  }) async {
    final token = authenticated ? await _tokenProvider() : null;
    if (authenticated && (token == null || token.isEmpty)) {
      throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in to continue.');
    }

    final uri = _config.apiUri(path, query);
    final request = http.Request(method, uri)
      ..headers.addAll(_headers(token, json: body != null || method != 'GET'));

    if (body != null) {
      request.body = jsonEncode(body);
    }

    http.Response response;
    try {
      final streamed = await _http.send(request).timeout(timeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException(ApiFailureKind.timeout,
          'The request took too long. Check your connection and try again.');
    } on SocketException {
      throw ApiException(ApiFailureKind.offline,
          'No connection to Jobiest. Check your internet connection.');
    } on http.ClientException {
      throw ApiException(ApiFailureKind.offline,
          'No connection to Jobiest. Check your internet connection.');
    }

    final decoded = _decode(response.body);

    if (response.statusCode == 401 && authenticated && allowRecovery) {
      final recovered = await _recoverSession();
      if (recovered) {
        return _send(method, path,
            query: query,
            body: body,
            authenticated: authenticated,
            allowRecovery: false);
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    throw apiExceptionFromResponse(response.statusCode, decoded);
  }

  Map<String, dynamic> _decode(String raw) {
    if (raw.isEmpty) return <String, dynamic>{};
    try {
      final value = jsonDecode(raw);
      if (value is Map<String, dynamic>) return value;
      if (value is List) return <String, dynamic>{'items': value};
      return <String, dynamic>{'value': value};
    } on FormatException {
      return <String, dynamic>{};
    }
  }
}
