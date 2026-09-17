import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/storage/secure_session_store.dart';
import '../data/account_api.dart';
import '../data/auth_api.dart';

enum AuthStatus {
  /// Session restore in progress (cold start).
  restoring,
  signedOut,
  signedIn,

  /// Password accepted, second factor pending.
  mfaRequired,
}

/// Owns the session: sign-in, refresh, MFA, sign-out. Nothing else in the app
/// touches tokens.
class AuthController extends ChangeNotifier {
  AuthController({
    required AuthApi authApi,
    required AccountApi accountApi,
    required SecureSessionStore store,
  })  : _authApi = authApi,
        _accountApi = accountApi,
        _store = store;

  final AuthApi _authApi;
  final AccountApi _accountApi;
  final SecureSessionStore _store;

  AuthStatus _status = AuthStatus.restoring;
  AuthTokens? _tokens;
  String? _pendingEmail;
  String? _pendingPassword;
  String? _lastError;
  bool _busy = false;

  AuthStatus get status => _status;
  bool get busy => _busy;
  String? get lastError => _lastError;
  String? get email => _tokens?.email.isNotEmpty == true ? _tokens!.email : _pendingEmail;
  String? get userId => _tokens?.userId;
  bool get isSignedIn => _status == AuthStatus.signedIn && _tokens != null;

  /// The access token, refreshed first when it is about to expire.
  Future<String?> currentToken() async {
    final tokens = _tokens;
    if (tokens == null) return null;
    final now = DateTime.now().toUtc();
    if (!now.isBefore(tokens.expiresAt)) {
      // Already expired: a refresh is the only way to keep the session.
      final refreshed = await _refresh();
      return refreshed ? _tokens?.accessToken : null;
    }
    if (tokens.expiresAt.difference(now).inSeconds < 60) {
      final refreshed = await _refresh();
      if (!refreshed) return _tokens?.accessToken; // still valid for a few seconds
    }
    return _tokens?.accessToken;
  }

  void _setBusy(bool value) {
    _busy = value;
    notifyListeners();
  }

  /// Restores a stored session on cold start. An unreachable backend must not
  /// sign the user out: only a provider rejection does.
  Future<void> bootstrap() async {
    final stored = await _store.read();
    if (stored == null) {
      _status = AuthStatus.signedOut;
      notifyListeners();
      return;
    }
    _tokens = AuthTokens(
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresAt: stored.expiresAt,
      userId: stored.userId,
      email: stored.email,
    );
    if (stored.isExpiringSoon) {
      final refreshed = await _refresh();
      if (!refreshed) {
        await _clearSession();
        _status = AuthStatus.signedOut;
        notifyListeners();
        return;
      }
    }
    _status = _tokens!.needsSecondFactor ? AuthStatus.mfaRequired : AuthStatus.signedIn;
    notifyListeners();
  }

  Future<bool> _refresh() async {
    final current = _tokens;
    if (current == null) return false;
    try {
      final refreshed = await _authApi.refresh(current.refreshToken);
      _tokens = refreshed;
      await _persist(refreshed);
      return true;
    } on ApiException catch (error) {
      if (error.kind == ApiFailureKind.offline || error.kind == ApiFailureKind.timeout) {
        // Network problem, not a rejected session: keep the tokens and let the
        // next request try again.
        return false;
      }
      return false;
    }
  }

  /// Called by [ApiClient] after a 401. Returns true when a usable token could
  /// be obtained again (then the request is retried once).
  Future<bool> recoverSession() async {
    final refreshed = await _refresh();
    if (!refreshed) {
      await _clearSession();
      _status = AuthStatus.signedOut;
      notifyListeners();
      return false;
    }
    _status = _tokens!.needsSecondFactor ? AuthStatus.mfaRequired : AuthStatus.signedIn;
    notifyListeners();
    return !_tokens!.needsSecondFactor;
  }

  Future<void> _persist(AuthTokens tokens) => _store.write(StoredSession(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        userId: tokens.userId,
        email: tokens.email,
      ));

  Future<void> _clearSession() async {
    _tokens = null;
    _pendingPassword = null;
    await _store.clear();
  }

  /// Sign in with email + password. Throws [ApiException] on failure so the
  /// caller can show the provider's real message.
  Future<AuthStatus> signIn(String email, String password) async {
    _setBusy(true);
    _lastError = null;
    try {
      final tokens = await _authApi.signInWithPassword(email.trim().toLowerCase(), password);
      _tokens = tokens;
      _pendingEmail = tokens.email.isNotEmpty ? tokens.email : email.trim().toLowerCase();
      _pendingPassword = password;
      await _persist(tokens);

      if (tokens.needsSecondFactor) {
        _status = AuthStatus.mfaRequired;
        notifyListeners();
        return _status;
      }
      _pendingPassword = null;
      _status = AuthStatus.signedIn;
      notifyListeners();
      return _status;
    } on ApiException catch (error) {
      _lastError = error.message;
      rethrow;
    } finally {
      _setBusy(false);
    }
  }

  /// Register through the backend, then sign in with the new credentials.
  Future<AuthStatus> register(String email, String password) async {
    _setBusy(true);
    _lastError = null;
    try {
      await _accountApi.register(email: email.trim().toLowerCase(), password: password);
      return await signIn(email, password);
    } finally {
      _setBusy(false);
    }
  }

  Future<void> requestPasswordReset(String email) =>
      _accountApi.requestPasswordReset(email.trim().toLowerCase());

  /// Completes a passwordless TOTP challenge. `code` is the 6-digit code from
  /// the user's authenticator app.
  Future<void> submitSecondFactor(String code) async {
    final tokens = _tokens;
    if (tokens == null) {
      throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in again.');
    }
    _setBusy(true);
    _lastError = null;
    try {
      final factors = tokens.factors.isNotEmpty
          ? tokens.factors
          : await _authApi.factorsFor(tokens.accessToken);
      MfaFactor? factor;
      for (final candidate in factors) {
        if (candidate.isVerified) {
          factor = candidate;
          break;
        }
      }
      if (factor == null) {
        throw ApiException(ApiFailureKind.server,
            'No verified authenticator is attached to this account.');
      }
      final challengeId = await _authApi.challengeFactor(tokens.accessToken, factor.id);
      final verified =
          await _authApi.verifyFactor(tokens.accessToken, factor.id, challengeId, code.trim());
      _tokens = verified;
      await _persist(verified);
      _status = AuthStatus.signedIn;
      notifyListeners();
    } on ApiException catch (error) {
      _lastError = error.message;
      rethrow;
    } finally {
      _setBusy(false);
    }
  }

  List<MfaFactor> get factors => _tokens?.factors ?? const <MfaFactor>[];

  /// Asks the auth provider for the account's current factors and caches them
  /// on the session. Used by the Security screen.
  Future<List<MfaFactor>> refreshFactors() async {
    final tokens = _tokens;
    if (tokens == null) return const <MfaFactor>[];
    final factors = await _authApi.factorsFor(tokens.accessToken);
    _tokens = AuthTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      userId: tokens.userId,
      email: tokens.email,
      factors: factors,
    );
    notifyListeners();
    return factors;
  }

  Future<TotpEnrollment> beginTotpEnrollment(String friendlyName) async {
    final token = _tokens?.accessToken;
    if (token == null) throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in again.');
    return _authApi.enrollTotp(token, friendlyName);
  }

  Future<void> confirmTotpEnrollment({
    required String factorId,
    required String code,
  }) async {
    final tokens = _tokens;
    if (tokens == null) throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in again.');
    final challengeId = await _authApi.challengeFactor(tokens.accessToken, factorId);
    final verified =
        await _authApi.verifyFactor(tokens.accessToken, factorId, challengeId, code.trim());
    _tokens = verified;
    await _persist(verified);
    notifyListeners();
  }

  /// Changes the account password through the auth provider.
  Future<void> changePassword(String newPassword) async {
    final token = _tokens?.accessToken;
    if (token == null) throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in again.');
    await _authApi.updatePassword(token, newPassword);
  }

  Future<void> removeFactor(String factorId) async {
    final tokens = _tokens;
    if (tokens == null) throw ApiException(ApiFailureKind.unauthenticated, 'Please sign in again.');
    await _authApi.unenroll(tokens.accessToken, factorId);
    _tokens = AuthTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      userId: tokens.userId,
      email: tokens.email,
      factors: tokens.factors.where((f) => f.id != factorId).toList(),
    );
    notifyListeners();
  }

  /// Ends the session for real: the refresh token is revoked at the provider,
  /// then the local session is destroyed. If the provider call fails because of
  /// the network, the local session is still cleared (so the device is signed
  /// out) and the caller is told that server-side revocation could not be
  /// confirmed.
  Future<SignOutResult> signOut() async {
    final tokens = _tokens;
    if (tokens == null) {
      await _clearSession();
      _status = AuthStatus.signedOut;
      notifyListeners();
      return SignOutResult(revokedOnServer: true);
    }

    var revoked = false;
    var revocationError = '';
    try {
      await _authApi.revokeSession(tokens.accessToken);
      revoked = true;
    } on ApiException catch (error) {
      revocationError = error.message;
    }

    await _clearSession();
    _status = AuthStatus.signedOut;
    notifyListeners();
    return SignOutResult(revokedOnServer: revoked, error: revocationError);
  }
}

class SignOutResult {
  SignOutResult({required this.revokedOnServer, this.error = ''});

  final bool revokedOnServer;
  final String error;
}

