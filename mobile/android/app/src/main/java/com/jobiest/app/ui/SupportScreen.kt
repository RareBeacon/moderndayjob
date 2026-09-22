package com.jobiest.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Support intake: same ticket route as the website (a real person replies
 * from support@jobiest.com). Categories outside the website's list are
 * safely normalized to "Other" server-side.
 */
class SupportViewModel(private val api: ApiClient) : ViewModel() {
    data class State(val busy: Boolean = false, val error: String? = null, val done: Boolean = false, val ticketId: String? = null)

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun send(email: String, category: String, subject: String, message: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            try {
                val body = kotlinx.serialization.json.buildJsonObject {
                    put("email", kotlinx.serialization.json.JsonPrimitive(email.trim()))
                    put("category", kotlinx.serialization.json.JsonPrimitive(category))
                    put("subject", kotlinx.serialization.json.JsonPrimitive(subject.trim()))
                    put("message", kotlinx.serialization.json.JsonPrimitive(message.trim()))
                }.toString()
                api.post("/support/tickets", body)
                _state.value = State(done = true)
            } catch (e: ApiClient.ApiException) {
                _state.value = State(error = e.message)
            } catch (e: Exception) {
                _state.value = State(error = "Network problem. Please try again.")
            }
        }
    }
}

private val CATEGORIES = listOf("Account", "Payments", "Applications", "Documents", "Other")

@Composable
fun SupportScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = containerViewModel { SupportViewModel(container.api) }
    val state by vm.state.collectAsState()

    var email by remember { mutableStateOf(container.auth.session?.user?.email ?: "") }
    var category by remember { mutableStateOf("Other") }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        TextButton(onClick = onBack, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("← Back") }
        Text("Contact support", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(
            "A real person replies from support@jobiest.com.",
            fontSize = 13.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )

        if (state.done) {
            SectionCard(eyebrow = "SENT") {
                Text("Your ticket is in. We reply to ${email.ifBlank { "your email" }}.", fontSize = 14.sp, color = JobiestColors.Ink)
                Spacer(Modifier.height(12.dp))
                PrimaryButton("Back to settings", onBack, modifier = Modifier.fillMaxWidth())
            }
            return@Column
        }

        JobiestField("Your email", email, { email = it }, keyboardType = androidx.compose.ui.text.input.KeyboardType.Email)
        Spacer(Modifier.height(12.dp))
        Text("What is this about?", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
        androidx.compose.foundation.layout.Row(
            Modifier.padding(top = 6.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
        ) {
            CATEGORIES.take(3).forEach { option ->
                FilterChip(selected = category == option, onClick = { category = option }, label = { Text(option, fontSize = 12.sp) })
            }
        }
        androidx.compose.foundation.layout.Row(
            Modifier.padding(top = 6.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
        ) {
            CATEGORIES.drop(3).forEach { option ->
                FilterChip(selected = category == option, onClick = { category = option }, label = { Text(option, fontSize = 12.sp) })
            }
        }
        Spacer(Modifier.height(12.dp))
        JobiestField("Subject", subject, { subject = it }, placeholder = "A short summary")
        Spacer(Modifier.height(12.dp))
        JobiestField("Message", message, { message = it }, singleLine = false, minLines = 5)
        Spacer(Modifier.height(16.dp))
        if (state.error != null) {
            ErrorBox(state.error.orEmpty())
            Spacer(Modifier.height(10.dp))
        }
        PrimaryButton(
            "Send",
            { vm.send(email, category, subject, message) },
            enabled = email.isNotBlank() && subject.isNotBlank() && message.isNotBlank(),
            busy = state.busy,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(24.dp))
    }
}
