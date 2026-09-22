package com.jobiest.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Construction
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.jobiest.app.ui.ApplicationsScreen
import com.jobiest.app.ui.ApplicationDetailScreen
import com.jobiest.app.ui.BillingScreen
import com.jobiest.app.ui.DashboardScreen
import com.jobiest.app.ui.DocumentsScreen
import com.jobiest.app.ui.DocContentView
import com.jobiest.app.ui.JobiestTheme
import com.jobiest.app.ui.LoginScreen
import com.jobiest.app.ui.MfaScreen
import com.jobiest.app.ui.NewApplicationScreen
import com.jobiest.app.ui.SettingsScreen
import com.jobiest.app.ui.SignUpScreen
import com.jobiest.app.ui.SupportScreen
import com.jobiest.app.ui.ToolsScreen

/**
 * Single-activity Compose app. One NavHost; the bottom bar appears only on
 * the five main tabs. When the auth session clears (sign-out, revoked
 * refresh token) every route falls back to login.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as JobiestApp).container
        setContent {
            JobiestTheme { RootNav(container) }
        }
    }
}

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@Composable
fun RootNav(container: AppContainer) {
    val nav = rememberNavController()
    val session by container.auth.sessionFlow.collectAsState()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val tabs = listOf(
        Tab("dashboard", "Home", Icons.Outlined.Dashboard),
        Tab("applications", "Jobs", Icons.Outlined.Work),
        Tab("documents", "Docs", Icons.Outlined.Description),
        Tab("tools", "Tools", Icons.Outlined.Construction),
        Tab("settings", "Settings", Icons.Outlined.Settings),
    )
    val showBottomBar = currentRoute in tabs.map { it.route }.toSet()

    // Session cleared anywhere -> back to login, always.
    LaunchedEffect(session) {
        if (session == null && currentRoute != null && currentRoute !in setOf("login", "signup")) {
            nav.navigate("login") { popUpTo(nav.graph.id) { inclusive = true } }
        }
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo("dashboard") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = if (session == null) "login" else "dashboard",
            modifier = Modifier.padding(padding),
        ) {
            composable("login") {
                LoginScreen(
                    container = container,
                    onSignedIn = { nav.navigate("dashboard") { popUpTo(nav.graph.id) { inclusive = true } } },
                    onSignUp = { nav.navigate("signup") },
                    onMfaRequired = { nav.navigate("mfa") },
                )
            }
            composable("signup") {
                SignUpScreen(container = container, onBack = { nav.popBackStack() })
            }
            composable("mfa") {
                MfaScreen(container = container, onDone = { nav.popBackStack() })
            }
            composable("dashboard") {
                DashboardScreen(
                    container = container,
                    onOpenApplication = { nav.navigate("application/$it") },
                    onNewApplication = { nav.navigate("newApplication") },
                    onBilling = { nav.navigate("billing") },
                    onMfaRequired = { nav.navigate("mfa") },
                )
            }
            composable("applications") {
                ApplicationsScreen(
                    container = container,
                    onOpen = { nav.navigate("application/$it") },
                    onNew = { nav.navigate("newApplication") },
                    onMfaRequired = { nav.navigate("mfa") },
                )
            }
            composable("application/{id}") { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                ApplicationDetailScreen(
                    container = container,
                    id = id,
                    onBack = { nav.popBackStack() },
                    onMfaRequired = { nav.navigate("mfa") },
                )
            }
            composable("newApplication") {
                NewApplicationScreen(container = container, onBack = { nav.popBackStack() })
            }
            composable("documents") {
                DocumentsScreen(container = container, onMfaRequired = { nav.navigate("mfa") })
            }
            composable("docView/{id}") { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                DocContentView(container = container, id = id, onBack = { nav.popBackStack() })
            }
            composable("tools") {
                ToolsScreen()
            }
            composable("billing") {
                BillingScreen(container = container, onBack = { nav.popBackStack() }, onMfaRequired = { nav.navigate("mfa") })
            }
            composable("settings") {
                SettingsScreen(
                    container = container,
                    onBilling = { nav.navigate("billing") },
                    onSupport = { nav.navigate("support") },
                    onMfaRequired = { nav.navigate("mfa") },
                )
            }
            composable("support") {
                SupportScreen(container = container, onBack = { nav.popBackStack() })
            }
        }
    }
}
