package com.jobiest.app.core

import com.jobiest.app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Client for the Jobiest website API (https://jobiest.com/api). Every request
 * carries the Supabase access token as Authorization: Bearer, which the site
 * already accepts for native clients with the same gates as the web app
 * (auth, entitlements, rate limits, audit). A 401 triggers one silent token
 * refresh and retry; MFA_REQUIRED surfaces as a typed exception so the UI
 * can route to the verification screen.
 */
class ApiClient(private val auth: AuthClient) {

    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val http = HttpClient(Android)

    /** API error with a machine code and a human message. */
    class ApiException(val code: String, message: String, val status: Int) : Exception(message)

    /** The account has MFA enrolled and this session has not completed it. */
    class MfaRequiredException : Exception("MFA_REQUIRED")

    suspend fun get(path: String): String = execute(HttpMethod.Get, path)

    suspend fun post(path: String, body: String? = null): String = execute(HttpMethod.Post, path, body)

    /** Upload the master CV: PDF bytes as multipart field "file". */
    suspend fun uploadPdf(fileName: String, bytes: ByteArray): String {
        val token = auth.accessToken() ?: throw ApiException("UNAUTHENTICATED", "Please sign in.", 401)
        val response = http.post("${BuildConfig.API_BASE_URL}/documents") {
            header(HttpHeaders.Authorization, "Bearer $token")
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            "file",
                            bytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, "application/pdf")
                                append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                            },
                        )
                    },
                ),
            )
        }
        if (response.status.value == 429) {
            throw ApiException("RATE_LIMITED", "Too many requests just now. Try again shortly.", 429)
        }
        if (!response.status.isSuccess()) {
            val code = errorCode(response.bodyAsText()) ?: "UPLOAD_FAILED"
            throw ApiException(code, friendly(code), response.status.value)
        }
        return response.bodyAsText()
    }

    private suspend fun execute(method: HttpMethod, path: String, body: String? = null, retry: Boolean = true): String {
        val token = auth.accessToken() ?: throw ApiException("UNAUTHENTICATED", "Please sign in.", 401)
        val response = http.request("${BuildConfig.API_BASE_URL}$path") {
            this.method = method
            header(HttpHeaders.Authorization, "Bearer $token")
            if (body != null) {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }
        if (response.status == HttpStatusCode.Unauthorized) {
            val code = errorCode(response.bodyAsText())
            when {
                code == "MFA_REQUIRED" -> throw MfaRequiredException()
                retry -> {
                    auth.forceRefresh()
                    return execute(method, path, body, retry = false)
                }
                else -> throw ApiException(code ?: "UNAUTHENTICATED", "Please sign in again.", 401)
            }
        }
        if (response.status.value == 429) {
            throw ApiException("RATE_LIMITED", "Too many requests just now. Wait a moment and try again.", 429)
        }
        if (!response.status.isSuccess()) {
            val text = response.bodyAsText()
            val code = errorCode(text) ?: "REQUEST_FAILED"
            throw ApiException(code, messageFor(text, code), response.status.value)
        }
        return response.bodyAsText()
    }

    /**
     * Prefer the server's human message: the signup and support routes return
     * friendly sentences in the error field, other routes return machine
     * codes that we translate ourselves.
     */
    private fun messageFor(bodyText: String, code: String): String {
        val parsed = runCatching { json.decodeFromString(ErrorBody.serializer(), bodyText) }.getOrNull()
        val serverMessage = parsed?.message ?: parsed?.error?.takeIf { it.contains(' ') }
        return serverMessage ?: friendly(code)
    }

    private fun errorCode(bodyText: String): String? =
        runCatching { json.decodeFromString(ErrorBody.serializer(), bodyText).error }.getOrNull()

    private fun friendly(code: String): String = when (code) {
        "VALIDATION_FAILED", "INVALID_BODY" -> "Please check the fields and try again."
        "RATE_LIMITED" -> "Too many requests just now. Wait a moment and try again."
        "NOT_FOUND" -> "Not found. It may have been removed."
        "PDF_REQUIRED", "FILE_REQUIRED" -> "Please choose a PDF file."
        "FILE_SIZE_INVALID" -> "That file is too large or empty. Maximum 5 MB."
        "INVALID_PDF_SIGNATURE" -> "That file is not a valid PDF."
        else -> "Something went wrong. Please try again."
    }

    @Serializable
    private data class ErrorBody(val error: String? = null, val message: String? = null)
}
