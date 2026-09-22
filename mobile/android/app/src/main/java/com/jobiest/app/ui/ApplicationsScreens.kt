package com.jobiest.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.ApplicationDetailResponse
import com.jobiest.app.core.ApplicationRow
import com.jobiest.app.core.ApplicationsResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Applications: list with status filters, detail with package documents,
 * timeline and the approve / reject / withdraw / submit / auto-submit
 * actions, plus the two intake forms (job link via the agent, or manual
 * tracking of something already sent).
 */

class ApplicationsViewModel(private val api: ApiClient) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val applications: List<ApplicationRow> = emptyList(),
        val automationEnabled: Boolean = false,
        val error: String? = null,
        val mfaRequired: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            try {
                val resp = api.json.decodeFromString(ApplicationsResponse.serializer(), api.get("/applications"))
                _state.value = State(loading = false, applications = resp.applications, automationEnabled = resp.automationEnabled)
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = State(loading = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = State(loading = false, error = e.message ?: "Could not load applications.")
            }
        }
    }
}

@Composable
fun ApplicationsScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    onNew: () -> Unit,
    onMfaRequired: () -> Unit,
) {
    val vm = containerViewModel { ApplicationsViewModel(container.api) }
    val state by vm.state.collectAsState()
    var filter by remember { mutableIntStateOf(0) }
    val filters = listOf("All", "Drafts", "Submitted", "Interviews")

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.mfaRequired) { if (it) onMfaRequired() }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(16.dp))
        Text("Applications", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(
            "Bring a job you want as a link, let your agent prepare the package, approve it, and track every step.",
            fontSize = 13.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )
        PrimaryButton("Start an application", onNew, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        TabRow(selectedTabIndex = filter) {
            filters.forEachIndexed { index, label ->
                Tab(
                    selected = filter == index,
                    onClick = { filter = index },
                    text = { Text(label, fontSize = 13.sp) },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        if (state.loading) {
            LoadingBox()
        } else if (state.error != null) {
            ErrorBox(state.error.orEmpty(), onRetry = { vm.load() })
        } else {
            val apps = when (filter) {
                1 -> state.applications.filter { it.status == "DRAFT" || it.status == "AWAITING_APPROVAL" }
                2 -> state.applications.filter { it.status == "SUBMITTED" }
                3 -> state.applications.filter { it.status == "INTERVIEW" }
                else -> state.applications
            }
            if (apps.isEmpty()) {
                EmptyState("Nothing here yet. Bring a job link and your agent will prepare the first application.")
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(apps, key = { it.id }) { app ->
                        SectionCard {
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(app.job?.title ?: "Untitled role", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
                                    Text(
                                        (app.job?.company ?: "Unknown company") + (app.job?.location?.let { " · $it" } ?: ""),
                                        fontSize = 12.5.sp,
                                        color = JobiestColors.Muted,
                                        modifier = Modifier.padding(top = 2.dp),
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    StatusPill(app.status)
                                }
                                TextButton(onClick = { onOpen(app.id) }) { Text("Open") }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(20.dp)) }
                }
            }
        }
    }
}

// ---------- detail ----------

class ApplicationDetailViewModel(private val api: ApiClient) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val detail: ApplicationDetailResponse? = null,
        val error: String? = null,
        val actionBusy: String? = null,
        val actionNote: String? = null,
        val mfaRequired: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            try {
                val resp = api.json.decodeFromString(ApplicationDetailResponse.serializer(), api.get("/applications/$id"))
                _state.value = State(loading = false, detail = resp)
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = State(loading = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = State(loading = false, error = e.message ?: "Could not load this application.")
            }
        }
    }

    fun act(id: String, action: String) {
        if (_state.value.actionBusy != null) return
        _state.value = _state.value.copy(actionBusy = action, actionNote = null)
        viewModelScope.launch {
            try {
                api.post("/applications/$id/$action")
                load(id)
                _state.value = _state.value.copy(
                    actionBusy = null,
                    actionNote = when (action) {
                        "approve" -> "Approved. Nothing is sent until you say so (or automatic submission sends it within your rules)."
                        "reject" -> "Rejected."
                        "withdraw" -> "Withdrawn."
                        "submit" -> "Queued; the agent fills the employer form and stops for any CAPTCHA, login, or unsupported step."
                        "auto-submit" -> "Queued; the agent fills the employer form and stops for any CAPTCHA, login, or unsupported step."
                        else -> "Done."
                    },
                )
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(actionBusy = null, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(actionBusy = null, actionNote = e.message ?: "That did not work. Please try again.")
            }
        }
    }
}

@Composable
fun ApplicationDetailScreen(
    container: AppContainer,
    id: String,
    onBack: () -> Unit,
    onMfaRequired: () -> Unit,
) {
    val vm = containerViewModel { ApplicationDetailViewModel(container.api) }
    val state by vm.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(id) { vm.load(id) }
    LaunchedEffect(state.mfaRequired) { if (it) onMfaRequired() }

    if (state.loading) {
        LoadingBox()
        return
    }
    val detail = state.detail
    if (detail == null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            ErrorBox(state.error ?: "This application could not be loaded.", onRetry = { vm.load(id) })
            TextButton(onClick = onBack) { Text("Back") }
        }
        return
    }

    val app = detail.application
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(top = 16.dp)) {
                TextButton(onClick = onBack, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("← Back") }
                Text(app.job?.title ?: "Untitled role", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
                Text(app.job?.company ?: "Unknown company", fontSize = 14.sp, color = JobiestColors.Muted, modifier = Modifier.padding(top = 2.dp))
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    StatusPill(app.status)
                    app.job?.url?.let { url ->
                        TextButton(onClick = { openInCustomTab(context, url) }) { Text("View job posting") }
                    }
                }
            }
        }
        if (state.actionNote != null) {
            item { ErrorBox(state.actionNote.orEmpty()) }
        }
        item {
            SectionCard(eyebrow = "PREPARED PACKAGE") {
                if (detail.`package`.isEmpty()) {
                    Text("No documents prepared yet.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                } else {
                    detail.`package`.forEach { doc ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(doc.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
                                Text(doc.kind, fontSize = 11.5.sp, color = JobiestColors.Muted)
                            }
                            Text(
                                if (doc.truthfulnessPassed) "Truthful" else "Needs review",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (doc.truthfulnessPassed) JobiestColors.Success else JobiestColors.Amber,
                            )
                        }
                    }
                    Text(
                        "Every document is generated from your verified profile facts only.",
                        fontSize = 12.sp,
                        color = JobiestColors.Muted,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
        item {
            SectionCard(eyebrow = "TIMELINE") {
                if (detail.timeline.isEmpty()) {
                    Text("Nothing recorded yet.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                } else {
                    detail.timeline.forEach { event ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(event.event, fontSize = 13.sp, color = JobiestColors.Ink, fontWeight = FontWeight.Medium)
                            Text((event.at ?: "").take(10), fontSize = 12.sp, color = JobiestColors.Muted)
                        }
                    }
                }
            }
        }
        item {
            SectionCard(eyebrow = "ACTIONS") {
                val status = app.status
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (status == "DRAFT" || status == "AWAITING_APPROVAL") {
                        PrimaryButton(
                            "Approve",
                            { vm.act(app.id, "approve") },
                            busy = state.actionBusy == "approve",
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedButton(
                            "Reject",
                            { vm.act(app.id, "reject") },
                            enabled = state.actionBusy == null,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (status == "APPROVED" || status == "SUBMITTED") {
                        OutlinedButton(
                            "Withdraw",
                            { vm.act(app.id, "withdraw") },
                            enabled = state.actionBusy == null,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (status == "APPROVED" && detail.automationEnabled) {
                        PrimaryButton(
                            "Send with agent",
                            { vm.act(app.id, "auto-submit") },
                            busy = state.actionBusy == "auto-submit",
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                Text(
                    "The agent stops for any CAPTCHA, login, or unsupported step, and emails you after every submission.",
                    fontSize = 12.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ---------- intake forms ----------

class NewApplicationViewModel(private val api: ApiClient) : ViewModel() {
    data class State(val busy: Boolean = false, val error: String? = null, val done: Boolean = false, val doneMessage: String? = null)

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun submitTarget(url: String, title: String, company: String, location: String, description: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            try {
                val body = kotlinx.serialization.json.buildJsonObject {
                    put("url", kotlinx.serialization.json.JsonPrimitive(url.trim()))
                    put("title", kotlinx.serialization.json.JsonPrimitive(title.trim()))
                    put("company", kotlinx.serialization.json.JsonPrimitive(company.trim()))
                    if (location.isNotBlank()) put("location", kotlinx.serialization.json.JsonPrimitive(location.trim()))
                    if (description.isNotBlank()) put("description", kotlinx.serialization.json.JsonPrimitive(description.trim()))
                }.toString()
                api.post("/applications/target", body)
                _state.value = State(done = true, doneMessage = "Your agent is preparing the package. Watch it under Applications.")
            } catch (e: ApiClient.ApiException) {
                _state.value = State(error = e.message)
            } catch (e: Exception) {
                _state.value = State(error = "Network problem. Please try again.")
            }
        }
    }

    fun submitManual(company: String, title: String, url: String, status: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            try {
                val body = kotlinx.serialization.json.buildJsonObject {
                    put("mode", kotlinx.serialization.json.JsonPrimitive("manual"))
                    put("company", kotlinx.serialization.json.JsonPrimitive(company.trim()))
                    put("title", kotlinx.serialization.json.JsonPrimitive(title.trim()))
                    put("url", kotlinx.serialization.json.JsonPrimitive(url.trim()))
                    put("status", kotlinx.serialization.json.JsonPrimitive(status))
                }.toString()
                api.post("/applications", body)
                _state.value = State(done = true, doneMessage = "Tracked. It now lives with the rest of your pipeline.")
            } catch (e: ApiClient.ApiException) {
                _state.value = State(error = e.message)
            } catch (e: Exception) {
                _state.value = State(error = "Network problem. Please try again.")
            }
        }
    }
}

@Composable
fun NewApplicationScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = containerViewModel { NewApplicationViewModel(container.api) }
    val state by vm.state.collectAsState()
    var tab by remember { mutableIntStateOf(0) }

    var url by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("SUBMITTED") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        TextButton(onClick = onBack, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("← Back") }
        Text("Start an application", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(
            "Two ways in: let the agent prepare everything from a job link, or record something you already sent yourself.",
            fontSize = 13.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp, bottom = 14.dp),
        )

        if (state.done) {
            SectionCard(eyebrow = "ON IT") {
                Text(state.doneMessage ?: "Done.", fontSize = 14.sp, color = JobiestColors.Ink)
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Back to applications", onBack, modifier = Modifier.fillMaxWidth())
            }
            return@Column
        }

        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Job link", fontSize = 13.sp) })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Track manually", fontSize = 13.sp) })
        }
        Spacer(Modifier.height(16.dp))

        if (tab == 0) {
            JobiestField("Job link", url, { url = it }, keyboardType = KeyboardType.Uri, placeholder = "https://boards.greenhouse.io/… or any job posting link")
            Spacer(Modifier.height(10.dp))
            JobiestField("Role title", title, { title = it }, placeholder = "Product Designer")
            Spacer(Modifier.height(10.dp))
            JobiestField("Company", company, { company = it }, placeholder = "Acme Ltd")
            Spacer(Modifier.height(10.dp))
            JobiestField("Location (optional)", location, { location = it }, placeholder = "Lagos, Nigeria or Remote")
            Spacer(Modifier.height(10.dp))
            JobiestField("Job description (optional)", description, { description = it }, singleLine = false, minLines = 4, supporting = "Paste the posting text for better tailoring.")
            Spacer(Modifier.height(16.dp))
            if (state.error != null) {
                ErrorBox(state.error.orEmpty())
                Spacer(Modifier.height(10.dp))
            }
            PrimaryButton(
                "Prepare my application",
                { vm.submitTarget(url, title, company, location, description) },
                enabled = url.isNotBlank() && title.length >= 2 && company.length >= 2,
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            JobiestField("Job link", url, { url = it }, keyboardType = KeyboardType.Uri)
            Spacer(Modifier.height(10.dp))
            JobiestField("Role title", title, { title = it })
            Spacer(Modifier.height(10.dp))
            JobiestField("Company", company, { company = it })
            Spacer(Modifier.height(14.dp))
            Text("Status", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                listOf("SUBMITTED", "INTERVIEW", "REJECTED", "WITHDRAWN").forEach { option ->
                    FilterChip(
                        selected = status == option,
                        onClick = { status = option },
                        label = { Text(option.lowercase().replaceFirstChar { it.uppercase() }, fontSize = 12.sp) },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            if (state.error != null) {
                ErrorBox(state.error.orEmpty())
                Spacer(Modifier.height(10.dp))
            }
            PrimaryButton(
                "Track it",
                { vm.submitManual(company, title, url, status) },
                enabled = url.isNotBlank() && title.length >= 2 && company.length >= 2,
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}
