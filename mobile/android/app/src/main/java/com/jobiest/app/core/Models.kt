package com.jobiest.app.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Wire models for the Jobiest API (https://jobiest.com/api) and the Supabase
 * auth REST endpoints. Every field is optional-with-default where the server
 * may omit it, and unknown keys are ignored, so additive server changes
 * never crash the app.
 */

// ---------- Supabase auth ----------

@Serializable
data class SupabaseSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long? = null,
    val user: SupabaseUser? = null,
)

@Serializable
data class SupabaseUser(
    val id: String,
    val email: String? = null,
    val phone: String? = null,
    @SerialName("user_metadata") val userMetadata: Map<String, JsonElement> = emptyMap(),
    val factors: List<SupabaseFactor> = emptyList(),
) {
    val fullName: String?
        get() = (userMetadata["full_name"] as? JsonElement)?.let { el ->
            (el as? kotlinx.serialization.json.JsonPrimitive)?.content
        }
}

@Serializable
data class SupabaseFactor(
    val id: String,
    @SerialName("factor_type") val factorType: String? = null,
    val status: String? = null,
    @SerialName("friendly_name") val friendlyName: String? = null,
)

@Serializable
data class SupabaseErrorBody(
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
    val msg: String? = null,
    val code: String? = null,
) {
    fun description(): String? = errorDescription ?: msg ?: code ?: error
}

// ---------- profile ----------

@Serializable
data class ProfileResponse(
    val profile: ProfileRow? = null,
    val career: CareerRow? = null,
)

@Serializable
data class ProfileRow(
    @SerialName("full_name") val fullName: String? = null,
    val email: String? = null,
    @SerialName("application_email") val applicationEmail: String? = null,
    @SerialName("target_roles") val targetRoles: List<String> = emptyList(),
    @SerialName("account_status") val accountStatus: String? = null,
)

@Serializable
data class CareerRow(
    val headline: String? = null,
    val summary: String? = null,
    val skills: List<String> = emptyList(),
)

@Serializable
data class Completeness(val percent: Int = 0)

// ---------- preferences ----------

@Serializable
data class PreferencesResponse(val preferences: PreferencesRow? = null)

@Serializable
data class PreferencesRow(
    @SerialName("remote_types") val remoteTypes: List<String> = emptyList(),
    val locations: List<String> = emptyList(),
    @SerialName("employment_types") val employmentTypes: List<String> = emptyList(),
    @SerialName("salary_min") val salaryMin: Double? = null,
    val currency: String? = null,
    @SerialName("application_mode") val applicationMode: String = "approval",
    @SerialName("daily_target") val dailyTarget: Int = 10,
    val active: Boolean = true,
)

@Serializable
data class ModeToggleResponse(
    val ok: Boolean = false,
    @SerialName("application_mode") val applicationMode: String? = null,
)

@Serializable
data class AgentToggleResponse(val ok: Boolean = false, val active: Boolean? = null)

// ---------- entitlements ----------

@Serializable
data class Entitlements(
    @SerialName("user_id") val userId: String = "",
    @SerialName("account_status") val accountStatus: String = "ACTIVE",
    val plan: String = "FREE",
    @SerialName("automation_enabled") val automationEnabled: Boolean = false,
    @SerialName("ai_credits_remaining") val aiCreditsRemaining: Int = 0,
    @SerialName("applications_remaining") val applicationsRemaining: Int = 0,
    @SerialName("tool_uses_remaining") val toolUsesRemaining: Int? = null,
)

// ---------- applications ----------

@Serializable
data class JobRow(
    val company: String? = null,
    val title: String? = null,
    val url: String? = null,
    val location: String? = null,
)

@Serializable
data class ApplicationRow(
    val id: String,
    val status: String = "DRAFT",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("submitted_at") val submittedAt: String? = null,
    val email: String? = null,
    val error: String? = null,
    val job: JobRow? = null,
)

@Serializable
data class ApplicationsResponse(
    val applications: List<ApplicationRow> = emptyList(),
    @SerialName("automationEnabled") val automationEnabled: Boolean = false,
)

@Serializable
data class PackageDoc(
    val id: String = "",
    val kind: String = "",
    val title: String = "",
    val version: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    val content: String? = null,
    @SerialName("truthfulnessPassed") val truthfulnessPassed: Boolean = false,
)

@Serializable
data class TimelineEvent(
    val event: String = "",
    val at: String? = null,
)

@Serializable
data class ApplicationDetailResponse(
    val application: ApplicationRow,
    val `package`: List<PackageDoc> = emptyList(),
    val timeline: List<TimelineEvent> = emptyList(),
    @SerialName("automationEnabled") val automationEnabled: Boolean = false,
)

// ---------- documents ----------

@Serializable
data class UploadedDocument(
    val id: String = "",
    val kind: String = "",
    @SerialName("original_name") val originalName: String = "",
    @SerialName("mime_type") val mimeType: String = "",
    @SerialName("byte_size") val byteSize: Long = 0,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class UploadedDocumentsResponse(val documents: List<UploadedDocument> = emptyList())

@Serializable
data class GeneratedDocument(
    val id: String = "",
    val kind: String = "",
    val title: String = "",
    val version: Int = 0,
    @SerialName("is_active") val isActive: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("application_id") val applicationId: String? = null,
    val content: String? = null,
)

@Serializable
data class GeneratedDocumentsResponse(val documents: List<GeneratedDocument> = emptyList())

// ---------- billing ----------

@Serializable
data class PlanCard(
    val code: String = "",
    val name: String = "",
    val tagline: String = "",
    @SerialName("monthlyNgn") val monthlyNgn: Long = 0,
    val highlight: String = "",
    val features: List<String> = emptyList(),
    val cta: String = "",
    val ctaHref: String = "",
    val featured: Boolean = false,
)

@Serializable
data class PlansResponse(val plans: List<PlanCard> = emptyList())

@Serializable
data class ProvidersResponse(val paystack: Boolean = false, val flutterwave: Boolean = false)

@Serializable
data class CheckoutResponse(
    val reference: String = "",
    val data: CheckoutData? = null,
)

@Serializable
data class CheckoutData(
    @SerialName("authorization_url") val authorizationUrl: String? = null,
    @SerialName("access_code") val accessCode: String? = null,
)

// ---------- support ----------

@Serializable
data class SupportTicketResponse(
    val ok: Boolean = false,
    @SerialName("ticket_id") val ticketId: String? = null,
    val message: String? = null,
)

// ---------- signup (website route, same rules as the web form) ----------

@Serializable
data class SignUpBody(
    val email: String,
    val password: String,
    val fullName: String,
    val phone: String,
)
