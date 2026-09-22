package com.jobiest.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The ten free career tools. V1 opens each tool on the website in a custom
 * tab (they are public, free, and already mobile-tested); native tool
 * screens arrive in a later release. Honest label, no pretending.
 */
private data class Tool(val label: String, val description: String, val path: String)

private val TOOLS = listOf(
    Tool("ATS resume scanner", "Check your resume against the systems employers use.", "/free-ats-resume-scanner"),
    Tool("Cover letter writer", "A truthful cover letter in your own voice.", "/free-cover-letter-writer"),
    Tool("Job description analyzer", "Understand requirements, seniority and fit.", "/free-job-description-analyzer"),
    Tool("Salary insights", "See what roles like yours pay.", "/free-salary-insights"),
    Tool("Skills matcher", "Match your skills to target roles.", "/free-skills-matcher"),
    Tool("Resume summary generator", "A sharp summary for the top of your CV.", "/free-resume-summary-generator"),
    Tool("LinkedIn headline builder", "A headline that says what you do.", "/free-linkedin-headline-builder"),
    Tool("Interview question generator", "Practice the questions you will actually get.", "/free-interview-question-generator"),
    Tool("Follow-up email writer", "Polite, effective follow-ups.", "/free-follow-up-email-writer"),
    Tool("Career path explorer", "See where your role can go next.", "/free-career-path-explorer"),
)

@Composable
fun ToolsScreen() {
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(Modifier.padding(top = 16.dp)) {
                Text("Career tools", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
                Text(
                    "Free forever, no account needed. Each tool opens on jobiest.com.",
                    fontSize = 13.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        items(TOOLS) { tool ->
            SectionCard {
                Column {
                    Text(tool.label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = JobiestColors.Ink)
                    Text(tool.description, fontSize = 12.5.sp, color = JobiestColors.Muted, modifier = Modifier.padding(top = 2.dp))
                    TextButton(onClick = { openInCustomTab(context, "https://jobiest.com${tool.path}") }) {
                        Text("Open tool →")
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
