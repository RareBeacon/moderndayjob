package com.jobiest.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Jobiest design tokens (mirrors the website's final editorial palette:
 * warm paper, deep ink, rust accent, hairlines, sharp corners).
 */
object JobiestColors {
    val Rust = Color(0xFFC63F20)
    val RustStrong = Color(0xFFA93318)
    val RustContainer = Color(0xFFFBECE9)
    val OnRustContainer = Color(0xFF5C1508)
    val Ink = Color(0xFF1A1A1A)
    val Muted = Color(0xFF6B6B6B)
    val Paper = Color(0xFFF9F8F6)
    val Card = Color(0xFFFFFFFF)
    val Sunken = Color(0xFFF0EFEA)
    val Hairline = Color(0xFFE5E4E0)
    val Success = Color(0xFF2E7D32)
    val SuccessBg = Color(0xFFE8F5E9)
    val Danger = Color(0xFFB3261E)
    val DangerBg = Color(0xFFFCE8E8)
    val Amber = Color(0xFFB45309)
    val AmberBg = Color(0xFFFFF4E5)
}

private val LightScheme = lightColorScheme(
    primary = JobiestColors.Rust,
    onPrimary = Color.White,
    primaryContainer = JobiestColors.RustContainer,
    onPrimaryContainer = JobiestColors.OnRustContainer,
    secondary = JobiestColors.Ink,
    onSecondary = Color.White,
    background = JobiestColors.Paper,
    onBackground = JobiestColors.Ink,
    surface = JobiestColors.Card,
    onSurface = JobiestColors.Ink,
    surfaceVariant = JobiestColors.Sunken,
    onSurfaceVariant = JobiestColors.Muted,
    outline = JobiestColors.Hairline,
    error = JobiestColors.Danger,
)

@Composable
fun JobiestTheme(content: @Composable () -> Unit) {
    // The brand is a light, warm, editorial surface; dark mode falls back to
    // Material defaults so text stays readable without a second palette yet.
    val scheme = if (isSystemInDarkTheme()) {
        LightScheme.copy(background = Color(0xFF121212), surface = Color(0xFF1E1E1E))
    } else {
        LightScheme
    }
    MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
}
