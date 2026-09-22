package com.jobiest.app.core

import android.content.Context
import com.jobiest.app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Auth against the Supabase GoTrue REST API directly (stable, documented
 * endpoints), instead of an SDK: full control of token refresh and the MFA
 * flows, and one less dependency to drift. The session is persisted in
 * private preferences as JSON; the access token is refreshed ~60s before
 * expiry. Tokens are never logged.
 *
 * Account creation goes through the website's /api/auth/signup (same rules
 * as the web form: full name, E.164 phone, password policy, verification
 * email, welcome email) so every business rule stays server-side. This
 * client only handles password sign-in, refresh, sign-out and MFA.
 */
class AuthClient(context: Context) {

    private val prefs = context.getSharedPreferences("jobiest_auth", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val http = HttpClient(Android)
    private val refreshMutex = Mutex()

    /** Null = signed out. Emits on every sign-in, refresh and sign-out. */
    val sessionFlow = MutableStateFlow<SupabaseSession?>(load())

    var session: SupabaseSession?
        get() = sessionFlow.value
        private set(value) {
            val text = value?.let { json.encodeToString(SupabaseSession.serializer(), it) }
            if (text != null) prefs.edit().putString(KEY_SESSION, text).apply()
            else prefs.edit().remove(KEY_SESSION).apply()
            sessionFlow.value = value
        }

    private fun load(): SupabaseSession? =
        prefs.getString(KEY_SESSION, null)?.let {
            runCatching { json.decodeFromString(SupabaseSession.serializer(), it) }.getOrNull()
        }

    val userEmail: String? get() = session?.user?.email

    // ---------- password sign-in ----------

    suspend fun signIn(email: String, password: String): AuthResult {
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                contentType(ContentType.Application.Json)
                setBody(CredentialsBody(email.trim(), password))
            }
        }.getOrElse { return AuthResult.Failure("Network problem. Check your connection and try again.") }
        return if (response.status == HttpStatusCode.OK) {
            val parsed = runCatching {
                json.decodeFromString(SupabaseSession.serializer(), response.bodyAsText())
            }.getOrNull() ?: return AuthResult.Failure("Sign in failed. Please try again.")
            session = parsed
            AuthResult.Success
        } else {
            AuthResult.Failure(friendlyAuthError(response.bodyAsText()))
        }
    }

    suspend fun signOut() {
        session?.let { s ->
            runCatching {
                http.post("${BuildConfig.SUPABASE_URL}/auth/v1/logout") {
                    header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    header("Authorization", "Bearer ${s.accessToken}")
                }
            }
        }
        session = null
    }

    // ---------- token refresh ----------

    /** A valid access token, refreshing first when close to expiry. */
    suspend fun accessToken(): String? {
        val s = session ?: return null
        val expiresAt = s.expiresAt ?: return s.accessToken
        val now = System.currentTimeMillis() / 1000
        if (expiresAt - now > 60) return s.accessToken
        return forceRefresh()
    }

    suspend fun forceRefresh(): String? = refreshMutex.withLock {
        val current = session ?: return@withLock null
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                contentType(ContentType.Application.Json)
                setBody(RefreshBody(current.refreshToken))
            }
        }.getOrNull() ?: return@withLock null
        if (response.status != HttpStatusCode.OK) {
            if (response.status.value == 400) session = null // refresh token rejected: sign out
            return@withLock null
        }
        val refreshed = runCatching {
            json.decodeFromString(SupabaseSession.serializer(), response.bodyAsText())
        }.getOrNull() ?: return@withLock null
        session = refreshed
        refreshed.accessToken
    }

    // ---------- MFA (TOTP) ----------

    /** The user's verified TOTP factor, or null when MFA is not enrolled. */
    suspend fun enrolledTotpFactor(): SupabaseFactor? {
        val token = accessToken() ?: return null
        val response = runCatching {
            http.get("${BuildConfig.SUPABASE_URL}/auth/v1/user") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
            }
        }.getOrNull() ?: return null
        if (!response.status.isSuccess()) return null
        val user = runCatching {
            json.decodeFromString(SupabaseUser.serializer(), response.bodyAsText())
        }.getOrNull() ?: return null
        return user.factors.firstOrNull { it.factorType == "totp" && it.status == "verified" }
    }

    /** Start a challenge for the verified factor; returns the challenge id. */
    suspend fun startChallenge(factorId: String): String? {
        val token = accessToken() ?: return null
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/challenge") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(ChallengeBody(factorId))
            }
        }.getOrNull() ?: return null
        if (!response.status.isSuccess()) return null
        return runCatching {
            json.decodeFromString(ChallengeResponse.serializer(), response.bodyAsText()).id
        }.getOrNull()
    }

    /** Verify the challenge code; on success the session becomes aal2 and is saved. */
    suspend fun verifyChallenge(factorId: String, challengeId: String, code: String): AuthResult {
        val token = accessToken() ?: return AuthResult.Failure("Please sign in again.")
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/challenge/verify") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(VerifyBody(factorId, challengeId, code.trim()))
            }
        }.getOrElse { return AuthResult.Failure("Network problem. Please try again.") }
        return if (response.status == HttpStatusCode.OK) {
            val parsed = runCatching {
                json.decodeFromString(SupabaseSession.serializer(), response.bodyAsText())
            }.getOrNull() ?: return AuthResult.Failure("Verification failed. Please try again.")
            session = parsed
            AuthResult.Success
        } else {
            AuthResult.Failure("That code did not work. Check it and try again.")
        }
    }

    /** Enroll a new TOTP factor; returns the factor id + secret/URI to enter in an authenticator app. */
    suspend fun enrollTotp(): TotpEnrollment? {
        val token = accessToken() ?: return null
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/factors") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(EnrollBody(friendlyName = "Jobiest app", factorType = "totp", issuer = "Jobiest"))
            }
        }.getOrNull() ?: return null
        if (!response.status.isSuccess()) return null
        return runCatching {
            json.decodeFromString(TotpEnrollment.serializer(), response.bodyAsText())
        }.getOrNull()
    }

    /** Confirm enrollment with a first code; the session becomes aal2. */
    suspend fun verifyEnrollment(factorId: String, code: String): Boolean {
        val token = accessToken() ?: return false
        val response = runCatching {
            http.post("${BuildConfig.SUPABASE_URL}/auth/v1/factors/$factorId/verify") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
                contentType(ContentType.Application.Json)
                setBody(EnrollVerifyBody(code.trim()))
            }
        }.getOrNull() ?: return false
        if (!response.status.isSuccess()) return false
        // Response carries the upgraded session; keep it.
        runCatching {
            json.decodeFromString(SupabaseSession.serializer(), response.bodyAsText())
        }.getOrNull()?.let { session = it }
        return true
    }

    /** Remove a factor (disable MFA). Requires an aal2 session. */
    suspend fun unenrollFactor(factorId: String): Boolean {
        val token = accessToken() ?: return false
        val response = runCatching {
            http.delete("${BuildConfig.SUPABASE_URL}/auth/v1/factors/$factorId") {
                header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                header("Authorization", "Bearer $token")
            }
        }.getOrNull() ?: return false
        return response.status.isSuccess()
    }

    // ---------- helpers ----------

    private fun friendlyAuthError(body: String): String {
        val parsed = runCatching { json.decodeFromString(SupabaseErrorBody.serializer(), body) }.getOrNull()
        return when (parsed?.description()) {
            "Invalid login credentials" -> "Wrong email or password. Please try again."
            "Email not confirmed" -> "Please verify your email first; check your inbox."
            else -> parsed?.description() ?: "Sign in failed. Please try again."
        }
    }

    companion object {
        private const val KEY_SESSION = "session"
    }
}

sealed interface AuthResult {
    data object Success : AuthResult
    data class Failure(val message: String) : AuthResult
}

@Serializable
private data class CredentialsBody(val email: String, val password: String)

@Serializable
private data class RefreshBody(val refresh_token: String)

@Serializable
private data class ChallengeBody(val factor_id: String)

@Serializable
private data class ChallengeResponse(val id: String = "")

@Serializable
private data class VerifyBody(val factor_id: String, val challenge_id: String, val code: String)

@Serializable
private data class EnrollBody(val friendly_name: String, val factor_type: String, val issuer: String)

@Serializable
private data class EnrollVerifyBody(val code: String)

@Serializable
data class TotpEnrollment(
    val id: String = "",
    val totp: TotpSecret? = null,
)

@Serializable
data class TotpSecret(
    @SerialName("qr_code") val qrCode: String? = null,
    val secret: String? = null,
    val uri: String? = null,
)
