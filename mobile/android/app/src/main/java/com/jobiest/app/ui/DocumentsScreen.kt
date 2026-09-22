package com.jobiest.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.GeneratedDocument
import com.jobiest.app.core.GeneratedDocumentsResponse
import com.jobiest.app.core.UploadedDocument
import com.jobiest.app.core.UploadedDocumentsResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Documents: the master CV (PDF upload, stays private) and everything the
 * agent has generated (CV, cover letter, answers), each viewable and
 * shareable as text.
 */

class DocumentsViewModel(private val api: ApiClient) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val uploaded: List<UploadedDocument> = emptyList(),
        val generated: List<GeneratedDocument> = emptyList(),
        val error: String? = null,
        val busy: Boolean = false,
        val note: String? = null,
        val mfaRequired: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            try {
                kotlinx.coroutines.coroutineScope {
                    val upDeferred = async { api.json.decodeFromString(UploadedDocumentsResponse.serializer(), api.get("/documents")) }
                    val genDeferred = async { api.json.decodeFromString(GeneratedDocumentsResponse.serializer(), api.get("/documents/generated")) }
                    _state.value = State(loading = false, uploaded = upDeferred.await().documents, generated = genDeferred.await().documents)
                }
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(loading = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not load documents.")
            }
        }
    }

    fun uploadPdf(name: String, bytes: ByteArray) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null, error = null)
        viewModelScope.launch {
            try {
                api.uploadPdf(name, bytes)
                _state.value = _state.value.copy(busy = false, note = "Your CV is stored privately.")
                load()
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(busy = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, error = e.message ?: "Upload could not be completed.")
            }
        }
    }

    fun generate(kind: String) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, note = null, error = null)
        viewModelScope.launch {
            try {
                val body = kotlinx.serialization.json.buildJsonObject {
                    put("kind", kotlinx.serialization.json.JsonPrimitive(kind))
                }.toString()
                api.post("/documents/generate", body)
                _state.value = _state.value.copy(busy = false, note = "Generated.")
                load()
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(busy = false, mfaRequired = true)
            } catch (e: ApiClient.ApiException) {
                _state.value = _state.value.copy(busy = false, error = e.message)
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, error = "Network problem. Please try again.")
            }
        }
    }
}

@Composable
fun DocumentsScreen(container: AppContainer, onMfaRequired: () -> Unit) {
    val vm = containerViewModel { DocumentsViewModel(container.api) }
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.mfaRequired) { if (state.mfaRequired) onMfaRequired() }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            runCatching {
                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "cv.pdf"
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null && bytes.isNotEmpty()) vm.uploadPdf(if (name.endsWith(".pdf")) name else "$name.pdf", bytes)
            }
        }
    }

    if (state.loading) {
        LoadingBox()
        return
    }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(top = 16.dp)) {
                Text("Documents", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
                Text(
                    "Your master CV stays private. Generated documents use verified facts only.",
                    fontSize = 13.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        if (state.error != null) {
            item { ErrorBox(state.error.orEmpty(), onRetry = { vm.load() }) }
        }
        if (state.note != null) {
            item { Text(state.note.orEmpty(), fontSize = 13.sp, color = JobiestColors.Success) }
        }
        item {
            SectionCard(eyebrow = "MASTER CV", title = "Upload your master CV") {
                Text("PDF only, maximum 5 MB. It stays private to your account.", fontSize = 12.5.sp, color = JobiestColors.Muted)
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { picker.launch("application/pdf") }, enabled = !state.busy) {
                    Text(if (state.busy) "Working…" else "Choose PDF")
                }
                if (state.uploaded.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    state.uploaded.forEach { doc ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(doc.originalName, fontSize = 13.5.sp, color = JobiestColors.Ink)
                            Text("${doc.byteSize / 1024} KB", fontSize = 12.sp, color = JobiestColors.Muted)
                        }
                    }
                }
            }
        }
        item {
            SectionCard(eyebrow = "GENERATE", title = "Let the agent write") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { vm.generate("CV") }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("CV") }
                    OutlinedButton(onClick = { vm.generate("COVER_LETTER") }, enabled = !state.busy, modifier = Modifier.weight(1f)) { Text("Cover letter") }
                }
                Text(
                    "Generated from your profile. To tailor to a specific job, start an application from its link.",
                    fontSize = 12.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        item {
            SectionCard(eyebrow = "GENERATED DOCUMENTS") {
                if (state.generated.isEmpty()) {
                    Text("Nothing generated yet.", fontSize = 13.5.sp, color = JobiestColors.Muted)
                } else {
                    state.generated.forEach { doc ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 5.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(doc.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
                                Text("${doc.kind} · ${(doc.createdAt ?: "").take(10)}", fontSize = 12.sp, color = JobiestColors.Muted)
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

/** Full content of one generated document, with share. */
@Composable
fun DocContentView(container: AppContainer, id: String, onBack: () -> Unit) {
    val vm = containerViewModel { DocumentsViewModel(container.api) }
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { vm.load() }

    val doc = state.generated.firstOrNull { it.id == id }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("← Back") }
        if (doc == null) {
            if (state.loading) LoadingBox() else EmptyState("That document is no longer available.")
        } else {
            Text(doc.title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
            OutlinedButton(
                onClick = {
                    val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(android.content.Intent.EXTRA_TEXT, doc.content ?: "")
                    }
                    runCatching { context.startActivity(android.content.Intent.createChooser(send, "Share document")) }
                },
                modifier = Modifier.padding(top = 8.dp),
            ) { Text("Share as text") }
            Spacer(Modifier.height(12.dp))
            LazyColumn {
                item {
                    Text(
                        doc.content ?: "",
                        fontSize = 13.5.sp,
                        color = JobiestColors.Ink,
                        lineHeight = 21.sp,
                    )
                }
            }
        }
    }
}
