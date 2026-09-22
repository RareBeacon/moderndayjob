package com.jobiest.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.jobiest.app.ui.JobiestColors

/** Loading / Ready / Failed state for every screen. */
sealed interface Async<out T> {
    data object Loading : Async<Nothing>
    data class Ready<T>(val value: T) : Async<T>
    data class Failed(val message: String, val mfaRequired: Boolean = false) : Async<Nothing>
}

/** Section card: hairline border, paper background, optional eyebrow label. */
@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    title: String? = null,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = JobiestColors.Card),
        border = androidx.compose.foundation.BorderStroke(1.dp, JobiestColors.Hairline),
    ) {
        Column(Modifier.padding(18.dp)) {
            if (eyebrow != null) {
                Text(
                    eyebrow,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                    color = JobiestColors.Rust,
                )
            }
            if (title != null) {
                Text(
                    title,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = JobiestColors.Ink,
                    modifier = Modifier.padding(top = if (eyebrow != null) 6.dp else 0.dp),
                )
            }
            Column(Modifier.padding(top = if (eyebrow != null || title != null) 10.dp else 0.dp)) {
                content()
            }
        }
    }
}

/** Status pill with the same verdict colors as the website. */
@Composable
fun StatusPill(status: String) {
    val (bg, fg, label) = when (status) {
        "DRAFT" -> Triple(JobiestColors.AmberBg, JobiestColors.Amber, "Draft")
        "AWAITING_APPROVAL" -> Triple(JobiestColors.RustContainer, JobiestColors.Rust, "Awaiting your approval")
        "APPROVED" -> Triple(JobiestColors.RustContainer, JobiestColors.Rust, "Approved")
        "SUBMITTED" -> Triple(JobiestColors.RustContainer, JobiestColors.Rust, "Submitted")
        "INTERVIEW" -> Triple(JobiestColors.SuccessBg, JobiestColors.Success, "Interview")
        "REJECTED" -> Triple(JobiestColors.DangerBg, JobiestColors.Danger, "Rejected")
        "WITHDRAWN" -> Triple(JobiestColors.Sunken, JobiestColors.Muted, "Withdrawn")
        else -> Triple(JobiestColors.Sunken, JobiestColors.Muted, status.lowercase().replace('_', ' '))
    }
    Box(
        Modifier
            .background(bg, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = fg)
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier, label: String = "Loading…") {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator(color = JobiestColors.Rust)
            Text(label, color = JobiestColors.Muted, fontSize = 13.sp)
        }
    }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(JobiestColors.DangerBg, RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Text(message, color = JobiestColors.Danger, fontSize = 13.5.sp)
        if (onRetry != null) {
            TextButton(onClick = onRetry) { Text("Try again") }
        }
    }
}

@Composable
fun EmptyState(text: String) {
    Text(
        text,
        color = JobiestColors.Muted,
        fontSize = 13.5.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 18.dp),
    )
}

/** Consistent labeled text field. */
@Composable
fun JobiestField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    supporting: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (placeholder.isEmpty()) null else ({ Text(placeholder) }),
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        supportingText = if (supporting == null) null else ({ Text(supporting, fontSize = 12.sp) }),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(
            containerColor = JobiestColors.Rust,
            contentColor = Color.White,
        ),
    ) {
        if (busy) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier
                    .padding(end = 8.dp)
                    .size(16.dp),
            )
        }
        Text(text)
    }
}

/** ViewModel built from the app container, without a DI framework. */
@Composable
inline fun <reified VM : ViewModel> containerViewModel(crossinline create: () -> VM): VM =
    viewModel<VM>(factory = viewModelFactory { initializer { create() } })

/** Open a URL in a Chrome custom tab (payments, tools, legal, resets). */
fun openInCustomTab(context: android.content.Context, url: String) {
    try {
        CustomTabsIntent.Builder().build().launchUrl(context, android.net.Uri.parse(url))
    } catch (_: Exception) {
        // No browser available; the caller's label already says it opens online.
    }
}
