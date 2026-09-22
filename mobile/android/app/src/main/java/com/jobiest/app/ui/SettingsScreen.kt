package com.jobiest.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.ApplicationsResponse
import com.jobiest.app.core.Entitlements
import com.jobiest.app.core.PreferencesResponse
import com.jobiest.app.core.TotpEnrollment
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Settings: automatic-submission toggle, agent pause/resume, MFA manager
 * (enroll TOTP by typing the secret, verify, disable), password reset
 * (website flow), plan, support and legal links, and sign out.
 */

class SettingsViewModel(private val api: ApiClient, private val auth: com.jobiest.app.core.AuthClient) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val email: String? = null,
        val plan: String = "FREE",
        val autoMode: Boolean = false,
        val agentActive: Boolean = true,
        val platformAutomation: Boolean = false,
        val automationEntitled: Boolean = false,
        val mfaEnrolled: Boolean = false,
        val error: String? = null,
        val busy: Boolean = false,
        val note: String? = null,
        val mfaRequired: Boolean = false,
        // enrollment flow
        val enrollment: TotpEnrollment? = null,
        val enrollCode: String = "",
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            try {
                kotlinx.coroutines.coroutineScope {
                    val prefsDeferred = async { api.json.decodeFromString(PreferencesResponse.serializer(), api.get("/preferences")) }
                    val appsDeferred = async { runCatching { api.json.decodeFromString(ApplicationsResponse.serializer(), api.get("/applications")) }.getOrNull() }
                    val entDeferred = async { runCatching { api.json.decodeFromString(Entitlements.serializer(), api.get("/entitlements")) }.getOrNull() }
                    val factorDeferred = async { runCatching { auth.enrolledTotpFactor() }.getOrNull() }
                    val prefs = prefsDeferred.await().preferences
                    val apps = appsDeferred.await()
                    val ent = entDeferred.await()
                    _state.value = State(
                        loading = false,
                        email = auth.session?.user?.email,
                        plan = ent?.plan ?: "FREE",
                        autoMode = prefs?.applicationMode == "auto",
                        agentActive = prefs?.active ?: true,
                        platformAutomation = apps?.automationEnabled ?: false,
                        automationEntitled = ent?.automationEnabled ?: false,
                        mfaEnrolled = factorDeferred.await() != null,
                    )
                }
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(loading = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not load settings.")
            }
        }
    }

    fun toggleAuto(on: Boolean) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null)
        viewModelScope.launch {
            try {
                api.post("/preferences/mode", kotlinx.serialization.json.buildJsonObject {
                    put("application_mode", kotlinx.serialization.json.JsonPrimitive(if (on) "auto" else "approval"))
                }.toString())
                _state.value = _state.value.copy(busy = false, note = "Saved.", autoMode = on)
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, note = "Could not save. Please try again.")
            }
        }
    }

    fun toggleAgent(active: Boolean) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null)
        viewModelScope.launch {
            try {
                api.post("/preferences/agent", kotlinx.serialization.json.buildJsonObject {
                    put("active", kotlinx.serialization.json.JsonPrimitive(active))
                }.toString())
                _state.value = _state.value.copy(busy = false, note = "Saved.", agentActive = active)
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, note = "Could not save. Please try again.")
            }
        }
    }

    fun startEnrollment() {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null)
        viewModelScope.launch {
            val enrollment = auth.enrollTotp()
            _state.value = if (enrollment == null) {
                _state.value.copy(busy = false, note = "Could not start MFA setup. Please try again.")
            } else {
                _state.value.copy(busy = false, enrollment = enrollment)
            }
        }
    }

    fun confirmEnrollment(code: String) {
        if (_state.value.busy) return
        val factorId = _state.value.enrollment?.id ?: return
        _state.value = _state.value.copy(busy = true, note = null)
        viewModelScope.launch {
            val ok = auth.verifyEnrollment(factorId, code)
            _state.value = if (ok) {
                _state.value.copy(busy = false, mfaEnrolled = true, enrollment = null, note = "Two-factor is on for your account.")
            } else {
                _state.value.copy(busy = false, note = "That code did not work. Check it and try again.")
            }
        }
    }

    fun disableMfa() {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null)
        viewModelScope.launch {
            val factor = auth.enrolledTotpFactor()
            if (factor == null) {
                _state.value = _state.value.copy(busy = false, mfaEnrolled = false, note = "MFA is already off.")
                return@launch
            }
            val ok = auth.unenrollFactor(factor.id)
            _state.value = _state.value.copy(busy = false, mfaEnrolled = !ok, note = if (ok) "Two-factor is off." else "Could not disable. Please try again.")
        }
    }

    fun signOut(onSignedOut: () -> Unit) {
        viewModelScope.launch {
            auth.signOut()
            onSignedOut()
        }
    }
}

@Composable
fun SettingsScreen(
    container: AppContainer,
    onBilling: () -> Unit,
    onSupport: () -> Unit,
    onMfaRequired: () -> Unit,
) {
    val vm = containerViewModel { SettingsViewModel(container.api, container.auth) }
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.mfaRequired) { if (state.mfaRequired) onMfaRequired( } }

    if (state.loading) {
        LoadingBox()
        return
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Settings", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(state.email ?: "", fontSize = 13.sp, color = JobiestColors.Muted, modifier = Modifier.padding(top = 2.dp, bottom = 14.dp))

        if (state.error != null) { ErrorBox(state.error.orEmpty(), onRetry = { vm.load() }); Spacer(Modifier.height(12.dp)) }
        if (state.note != null) {
            Text(state.note.orEmpty(), fontSize = 13.sp, color = JobiestColors.Success)
            Spacer(Modifier.height(12.dp))
        }

        // Automatic submission
        SectionCard(eyebrow = "APPLICATIONS", title = "Automatic submission") {
            if (!state.automationEntitled) {
                Text("Automatic submission is part of the paid plans.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = onBilling) { Text("See plans") }
            } else {
                Text(
                    if (state.autoMode) "On. Your agent submits eligible applications within your rules and emails you after each one."
                    else "Off. Every application waits for your approval before anything is sent.",
                    fontSize = 13.5.sp,
                    color = JobiestColors.Muted,
                )
                if (state.autoMode && !state.platformAutomation) {
                    Text(
                        "Your choice is saved. Sending starts once final checks are complete; until then every application waits for your approval.",
                        fontSize = 12.5.sp,
                        color = JobiestColors.Muted,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
                Spacer(Modifier.height(10.dp))
                if (state.autoMode) {
                    OutlinedButton(onClick = { vm.toggleAuto(false) }, enabled = !state.busy) { Text("Turn off") }
                } else {
                    Button(onClick = { vm.toggleAuto(true) }, enabled = !state.busy) { Text("Turn on") }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    if (state.agentActive) "Agent is active." else "Agent is paused; nothing runs until you resume.",
                    fontSize = 12.5.sp,
                    color = JobiestColors.Muted,
                )
                TextButton(onClick = { vm.toggleAgent(!state.agentActive) }, enabled = !state.busy) {
                    Text(if (state.agentActive) "Pause agent" else "Resume agent")
                }
            }
        }
        Spacer(Modifier.height(12.dp))

        // Security / MFA
        SectionCard(eyebrow = "SECURITY", title = "Two-factor authentication") {
            val enrollment = state.enrollment
            if (enrollment != null) {
                Text(
                    "1. In your authenticator app, add an account with this secret (manual entry):",
                    fontSize = 13.sp, color = JobiestColors.Muted,
                )
                Text(
                    enrollment.totp?.secret ?: "",
                    fontSize = 16.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink,
                    modifier = Modifier.padding(vertical = 6.dp),
                )
                Text("2. Enter the 6-digit code it shows:", fontSize = 13.sp, color = JobiestColors.Muted)
                Spacer(Modifier.height(8.dp))
                var code by remember { mutableStateOf("") }
                JobiestField("Authenticator code", code, { code = it }, keyboardType = KeyboardType.NumberPassword)
                Spacer(Modifier.height(10.dp))
                Button(onClick = { vm.confirmEnrollment(code) }, enabled = code.isNotBlank() && !state.busy) { Text("Confirm and enable") }
            } else if (state.mfaEnrolled) {
                Text("Two-factor is on. Signing in asks for a code from your authenticator app.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { vm.disableMfa() }, enabled = !state.busy) { Text("Turn off two-factor") }
            } else {
                Text("Add a second factor so a stolen password alone cannot open your account.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { vm.startEnrollment() }, enabled = !state.busy) { Text("Set up two-factor") }
            }
        }
        Spacer(Modifier.height(12.dp))

        // Password
        SectionCard(eyebrow = "SECURITY", title = "Password") {
            Text("We email a reset link; nothing changes until you click it.", fontSize = 13.sp, color = JobiestColors.Muted)
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { openInCustomTab(context, "https://jobiest.com/login?reset=1") }) { Text("Reset my password") }
        }
        Spacer(Modifier.height(12.dp))

        // Plan
        SectionCard(eyebrow = "PLAN", title = state.plan) {
            Text("Manage your plan and payments on the website's secure checkout.", fontSize = 13.sp, color = JobiestColors.Muted)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onBilling) { Text("See plans") }
                OutlinedButton(onClick = { openInCustomTab(context, "https://jobiest.com/billing") }) { Text("Billing history") }
            }
        }
        Spacer(Modifier.height(12.dp))

        // Support + legal
        SectionCard(eyebrow = "SUPPORT", title = "Talk to a human") {
            Text("Account, jobs, CV, applications, agent or payments: a real person replies.", fontSize = 13.sp, color = JobiestColors.Muted)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onSupport) { Text("Contact support") }
            }
        }
        Spacer(Modifier.height(12.dp))
        SectionCard(eyebrow = "LEGAL") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { openInCustomTab(context, "https://jobiest.com/terms") }) { Text("Terms") }
                TextButton(onClick = { openInCustomTab(context, "https://jobiest.com/privacy") }) { Text("Privacy") }
                TextButton(onClick = { openInCustomTab(context, "https://jobiest.com/refund") }) { Text("Refunds") }
            }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(
            onClick = {
                vm.signOut {
                    // sessionFlow clears -> RootNav returns to login
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign out") }
        Spacer(Modifier.height(30.dp))
    }
}
