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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
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
import com.jobiest.app.core.AuthClient
import com.jobiest.app.core.AuthResult
import com.jobiest.app.core.SignUpBody
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Auth screens: sign in, create account (website rules: full name, E.164
 * phone, password policy, verification email), and the TOTP verification
 * screen for accounts with MFA enrolled.
 */

// ---------- Sign in ----------

class LoginViewModel(private val auth: AuthClient) : ViewModel() {
    data class State(
        val busy: Boolean = false,
        val error: String? = null,
        val mfaRequired: Boolean = false,
        val signedIn: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun signIn(email: String, password: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            when (val result = auth.signIn(email, password)) {
                is AuthResult.Success -> {
                    val factor = auth.enrolledTotpFactor()
                    _state.value = if (factor != null) State(mfaRequired = true) else State(signedIn = true)
                }
                is AuthResult.Failure -> _state.value = State(error = result.message)
            }
        }
    }
}

@Composable
fun LoginScreen(
    container: AppContainer,
    onSignedIn: () -> Unit,
    onSignUp: () -> Unit,
    onMfaRequired: () -> Unit,
) {
    val vm = containerViewModel { LoginViewModel(container.auth) }
    val state by vm.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(state.signedIn) { if (state.signedIn) onSignedIn( } }
    LaunchedEffect(state.mfaRequired) { if (state.mfaRequired) onMfaRequired( } }

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Jobiest", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Rust)
        Text(
            "Your AI agent for the job search.",
            fontSize = 15.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp),
        )
        Spacer(Modifier.height(28.dp))
        JobiestField("Email", email, { email = it }, keyboardType = KeyboardType.Email, placeholder = "you@example.com")
        Spacer(Modifier.height(12.dp))
        JobiestField("Password", password, { password = it }, keyboardType = KeyboardType.Password)
        Spacer(Modifier.height(18.dp))
        if (state.error != null) {
            ErrorBox(state.error.orEmpty())
            Spacer(Modifier.height(12.dp))
        }
        PrimaryButton(
            "Sign in",
            { vm.signIn(email, password) },
            enabled = email.isNotBlank() && password.isNotBlank(),
            busy = state.busy,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = { openInCustomTab(context, "https://jobiest.com/login?reset=1") }) {
                Text("Forgot password?")
            }
            TextButton(onClick = onSignUp) { Text("Create account") }
        }
    }
}

// ---------- Sign up ----------

class SignUpViewModel(private val api: ApiClient) : ViewModel() {
    data class State(val busy: Boolean = false, val error: String? = null, val done: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun signUp(fullName: String, email: String, phone: String, password: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            try {
                api.post("/auth/signup", api.json.encodeToString(SignUpBody.serializer(), SignUpBody(email, password, fullName, phone)))
                _state.value = State(done = true)
            } catch (e: ApiClient.ApiException) {
                _state.value = State(error = e.message)
            } catch (e: Exception) {
                _state.value = State(error = "Network problem. Please try again.")
            }
        }
    }
}

@Composable
fun SignUpScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = containerViewModel { SignUpViewModel(container.api) }
    val state by vm.state.collectAsState()

    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text("Create your account", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(
            "Same rules as the website: verify your email to activate the account.",
            fontSize = 13.5.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
        )
        if (state.done) {
            SectionCard(eyebrow = "ONE MORE STEP", title = "Check your email") {
                Text(
                    "We sent a verification link to ${email.ifBlank { "your inbox" }}. Open it to activate your account, then come back and sign in.",
                    fontSize = 13.5.sp,
                    color = JobiestColors.Muted,
                )
                Spacer(Modifier.height(14.dp))
                PrimaryButton("Back to sign in", onBack, modifier = Modifier.fillMaxWidth())
            }
        } else {
            JobiestField("Full name", fullName, { fullName = it }, placeholder = "Adaeze Okafor")
            Spacer(Modifier.height(12.dp))
            JobiestField("Email", email, { email = it }, keyboardType = KeyboardType.Email)
            Spacer(Modifier.height(12.dp))
            JobiestField(
                "Phone number",
                phone,
                { phone = it },
                keyboardType = KeyboardType.Phone,
                placeholder = "+234 801 234 5678",
                supporting = "With country code, e.g. +234",
            )
            Spacer(Modifier.height(12.dp))
            JobiestField(
                "Password",
                password,
                { password = it },
                keyboardType = KeyboardType.Password,
                supporting = "At least 8 characters, one number and one special character.",
            )
            Spacer(Modifier.height(18.dp))
            if (state.error != null) {
                ErrorBox(state.error.orEmpty())
                Spacer(Modifier.height(12.dp))
            }
            PrimaryButton(
                "Create account",
                { vm.signUp(fullName, email, phone, password) },
                enabled = fullName.isNotBlank() && email.isNotBlank() && phone.isNotBlank() && password.isNotBlank(),
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp)) {
                Text("Already have an account? Sign in")
            }
        }
    }
}

// ---------- MFA verification ----------

class MfaViewModel(private val auth: AuthClient) : ViewModel() {
    data class State(val busy: Boolean = false, val error: String? = null, val done: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun verify(code: String) {
        if (_state.value.busy) return
        _state.value = State(busy = true)
        viewModelScope.launch {
            val factor = auth.enrolledTotpFactor()
            if (factor == null) {
                _state.value = State(error = "MFA is not set up on your account. Please sign in again.")
                return@launch
            }
            val challengeId = auth.startChallenge(factor.id)
            if (challengeId == null) {
                _state.value = State(error = "Could not start verification. Please try again.")
                return@launch
            }
            when (val result = auth.verifyChallenge(factor.id, challengeId, code)) {
                is AuthResult.Success -> _state.value = State(done = true)
                is AuthResult.Failure -> _state.value = State(error = result.message)
            }
        }
    }
}

@Composable
fun MfaScreen(container: AppContainer, onDone: () -> Unit) {
    val vm = containerViewModel { MfaViewModel(container.auth) }
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }

    LaunchedEffect(state.done) { if (state.done) onDone( } }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        SectionCard(eyebrow = "SECURITY", title = "Two-factor verification") {
            Text(
                "Enter the 6-digit code from your authenticator app to finish signing in.",
                fontSize = 13.5.sp,
                color = JobiestColors.Muted,
            )
            Spacer(Modifier.height(14.dp))
            JobiestField("Authenticator code", code, { code = it }, keyboardType = KeyboardType.NumberPassword)
            Spacer(Modifier.height(16.dp))
            if (state.error != null) {
                ErrorBox(state.error.orEmpty())
                Spacer(Modifier.height(12.dp))
            }
            PrimaryButton(
                "Verify",
                { vm.verify(code) },
                enabled = code.isNotBlank(),
                busy = state.busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
