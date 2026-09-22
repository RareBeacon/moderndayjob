package com.jobiest.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.ApplicationsResponse
import com.jobiest.app.core.BoardLinks
import com.jobiest.app.core.Completeness
import com.jobiest.app.core.Entitlements
import com.jobiest.app.core.PreferencesResponse
import com.jobiest.app.core.ProfileResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Dashboard: greeting, honest banner (mode-aware like the website), the
 * four numbers, drafts awaiting approval, board deep links built from the
 * user's own preferences, and the automatic-submission toggle.
 */

class DashboardViewModel(private val api: ApiClient) : ViewModel() {

    data class Data(
        val firstName: String = "there",
        val autoMode: Boolean = false,
        val platformAutomation: Boolean = false,
        val totalApplications: Int = 0,
        val interviews: Int = 0,
        val responseRate: Int = 0,
        val completeness: Int = 0,
        val plan: String = "FREE",
        val quotaLine: String = "",
        val drafts: List<com.jobiest.app.core.ApplicationRow> = emptyList(),
        val boardLinks: List<BoardLinks.BoardLink> = emptyList(),
        val automationEntitled: Boolean = false,
    )

    data class State(
        val loading: Boolean = true,
        val data: Data = Data(),
        val error: String? = null,
        val mfaRequired: Boolean = false,
        val toggling: Boolean = false,
        val toggleNote: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load() {
        _state.value = _state.value.copy(loading = true, error = null, toggleNote = null)
        viewModelScope.launch {
            try {
                kotlinx.coroutines.coroutineScope {
                    val profileDeferred = kotlinx.coroutines.async { api.json.decodeFromString(ProfileResponse.serializer(), api.get("/profile")) }
                    val prefsDeferred = kotlinx.coroutines.async { api.json.decodeFromString(PreferencesResponse.serializer(), api.get("/preferences")) }
                    val appsDeferred = kotlinx.coroutines.async { api.json.decodeFromString(ApplicationsResponse.serializer(), api.get("/applications")) }
                    val entDeferred = kotlinx.coroutines.async { api.json.decodeFromString(Entitlements.serializer(), api.get("/entitlements")) }
                    val compDeferred = kotlinx.coroutines.async { api.json.decodeFromString(Completeness.serializer(), api.get("/profile/completeness")) }

                    val profileResp = profileDeferred.await()
                    val prefsResp = prefsDeferred.await()
                    val appsResp = appsDeferred.await()
                    val entResp = entDeferred.await()
                    val compResp = compDeferred.await()

                    val apps = appsResp.applications
                    val inFlight = apps.count { it.status == "SUBMITTED" || it.status == "INTERVIEW" }
                    val interviews = apps.count { it.status == "INTERVIEW" }
                    val prefs = prefsResp.preferences
                    val roles = profileResp.profile?.targetRoles.orEmpty()
                    val data = Data(
                        firstName = (profileResp.profile?.fullName ?: "").split(" ").firstOrNull { it.isNotBlank() } ?: "there",
                        autoMode = prefs?.applicationMode == "auto",
                        platformAutomation = appsResp.automationEnabled,
                        totalApplications = apps.size,
                        interviews = interviews,
                        responseRate = if (inFlight > 0) (interviews * 100 / inFlight) else 0,
                        completeness = compResp.percent,
                        plan = entResp.plan,
                        quotaLine = if (entResp.plan == "FREE") {
                            "${entResp.aiCreditsRemaining} of 3 free documents left"
                        } else {
                            "${entResp.aiCreditsRemaining} AI generations today"
                        },
                        drafts = apps.filter { it.status == "DRAFT" }.take(3),
                        boardLinks = BoardLinks.build(roles, prefs?.locations, BoardLinks.isRemoteOnly(prefs?.remoteTypes)),
                        automationEntitled = entResp.automationEnabled,
                    )
                    _state.value = State(loading = false, data = data)
                }
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = State(loading = false, mfaRequired = true)
            } catch (e: ApiClient.ApiException) {
                _state.value = State(loading = false, error = e.message)
            } catch (e: Exception) {
                _state.value = State(loading = false, error = "Network problem. Pull to refresh or try again.")
            }
        }
    }

    /** Turn automatic submission on/off (approval default when off). */
    fun toggleAuto(on: Boolean) {
        if (_state.value.toggling) return
        _state.value = _state.value.copy(toggling = true, toggleNote = null)
        viewModelScope.launch {
            try {
                val body = kotlinx.serialization.json.buildJsonObject {
                    put("application_mode", kotlinx.serialization.json.JsonPrimitive(if (on) "auto" else "approval"))
                }.toString()
                api.post("/preferences/mode", body)
                _state.value = _state.value.copy(
                    toggling = false,
                    toggleNote = "Saved.",
                    data = _state.value.data.copy(autoMode = on),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(toggling = false, toggleNote = "Could not save. Please try again.")
            }
        }
    }
}

@Composable
fun DashboardScreen(
    container: AppContainer,
    onOpenApplication: (String) -> Unit,
    onNewApplication: () -> Unit,
    onBilling: () -> Unit,
    onMfaRequired: () -> Unit,
) {
    val vm = containerViewModel { DashboardViewModel(container.api) }
    val state by vm.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.mfaRequired) { if (it) onMfaRequired() }

    if (state.loading) {
        LoadingBox()
        return
    }

    val data = state.data
    LazyColumn(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(Modifier.padding(top = 16.dp)) {
                Text("Dashboard", fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp, color = JobiestColors.Rust)
                Text(
                    "Hello, ${data.firstName}.",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = JobiestColors.Ink,
                )
                Text(
                    if (data.autoMode) {
                        "Automatic submission is on for your account. We email you after every submission."
                    } else {
                        "Your application is free. Jobiest never asks candidates for money, and nothing is ever sent without your approval."
                    },
                    fontSize = 13.5.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Start an application", onNewApplication, modifier = Modifier.fillMaxWidth())
                Text(
                    "Plan · ${data.plan} · ${data.quotaLine}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCell("Applications", data.totalApplications.toString(), Modifier.weight(1f))
                StatCell("Interviews", data.interviews.toString(), Modifier.weight(1f))
                StatCell("Response", "${data.responseRate}%", Modifier.weight(1f))
                StatCell("Profile", "${data.completeness}%", Modifier.weight(1f))
            }
        }
        if (state.error != null) {
            item { ErrorBox(state.error.orEmpty(), onRetry = { vm.load() }) }
        }
        if (data.drafts.isNotEmpty()) {
            item {
                SectionCard(eyebrow = "AWAITING YOUR APPROVAL") {
                    data.drafts.forEach { draft ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(draft.job?.title ?: "Untitled role", fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
                                Text(draft.job?.company ?: "Unknown company", fontSize = 12.5.sp, color = JobiestColors.Muted)
                            }
                            TextButton(onClick = { onOpenApplication(draft.id) }) { Text("Review") }
                        }
                    }
                    Text(
                        "Drafts are prepared from your verified facts only. Approve, edit, or reject: your call, every time.",
                        fontSize = 12.sp,
                        color = JobiestColors.Muted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        item {
            SectionCard(eyebrow = "AUTOMATIC SUBMISSION") {
                if (!data.automationEntitled) {
                    Text(
                        "Automatic submission sends eligible applications for you on supported employer sites, within your rules, then emails you after each one. It is part of the paid plans.",
                        fontSize = 13.5.sp,
                        color = JobiestColors.Muted,
                    )
                    Spacer(Modifier.height(12.dp))
                    androidx.compose.material3.OutlinedButton(onClick = onBilling) { Text("See plans") }
                } else {
                    Text(
                        if (data.autoMode) {
                            "On. Your agent submits eligible applications for you on supported employer sites, within your rules, and emails you after each one. It applies through employers' own career sites only, never LinkedIn Easy Apply or Indeed Apply, and stops on CAPTCHA, logins, and unsupported sites."
                        } else {
                            "Off. Your agent prepares every application and waits for your approval before anything is sent. Turn this on and it submits eligible applications for you, within your rules, then emails you after each one."
                        },
                        fontSize = 13.5.sp,
                        color = JobiestColors.Muted,
                    )
                    if (data.autoMode && !data.platformAutomation) {
                        Text(
                            "Your choice is saved. Sending starts once final checks are complete; until then every application still waits for your approval.",
                            fontSize = 12.5.sp,
                            color = JobiestColors.Muted,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    if (data.autoMode) {
                        androidx.compose.material3.OutlinedButton(onClick = { vm.toggleAuto(false) }, enabled = !state.toggling) {
                            Text(if (state.toggling) "Saving…" else "Turn off automatic submission")
                        }
                    } else {
                        androidx.compose.material3.Button(onClick = { vm.toggleAuto(true) }, enabled = !state.toggling) {
                            Text(if (state.toggling) "Saving…" else "Turn on automatic submission")
                        }
                    }
                    if (state.toggleNote != null) {
                        Text(state.toggleNote.orEmpty(), fontSize = 12.5.sp, color = JobiestColors.Success, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
        if (data.boardLinks.isNotEmpty()) {
            item {
                SectionCard(eyebrow = "BROWSE THE BOARDS YOURSELF") {
                    data.boardLinks.forEach { link ->
                        TextButton(
                            onClick = { openInCustomTab(context, link.url) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.fillMaxWidth()) {
                                Text("${link.boardLabel}: ${link.role}", fontSize = 14.sp, color = JobiestColors.Rust, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                    Text(
                        "Search links built from your roles and locations. Your agent applies through employers' own career sites; these boards are for your own browsing.",
                        fontSize = 12.sp,
                        color = JobiestColors.Muted,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    SectionCard(modifier = modifier) {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp, color = JobiestColors.Muted)
    }
}
