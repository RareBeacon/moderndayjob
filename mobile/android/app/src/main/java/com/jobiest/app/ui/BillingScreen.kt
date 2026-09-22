package com.jobiest.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jobiest.app.AppContainer
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.CheckoutResponse
import com.jobiest.app.core.Entitlements
import com.jobiest.app.core.PlanCard
import com.jobiest.app.core.PlansResponse
import com.jobiest.app.core.ProvidersResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

/**
 * Billing: current plan, the four plan cards from the website's single
 * source of truth (/api/plans), and checkout. Payments open the existing
 * Paystack web checkout in a browser tab; Google takes no cut and the
 * website flow stays the one place money changes hands.
 */

class BillingViewModel(private val api: ApiClient) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val plans: List<PlanCard> = emptyList(),
        val entitlements: Entitlements? = null,
        val paystackReady: Boolean = false,
        val error: String? = null,
        val checkoutBusy: Boolean = false,
        val checkoutError: String? = null,
        val mfaRequired: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            try {
                kotlinx.coroutines.coroutineScope {
                    val plansDeferred = kotlinx.coroutines.async { api.json.decodeFromString(PlansResponse.serializer(), api.get("/plans")) }
                    val entDeferred = kotlinx.coroutines.async { runCatching { api.json.decodeFromString(Entitlements.serializer(), api.get("/entitlements")) }.getOrNull() }
                    val provDeferred = kotlinx.coroutines.async { runCatching { api.json.decodeFromString(ProvidersResponse.serializer(), api.get("/billing/providers")) }.getOrNull() }
                    _state.value = State(
                        loading = false,
                        plans = plansDeferred.await().plans,
                        entitlements = entDeferred.await(),
                        paystackReady = provDeferred.await()?.paystack ?: false,
                    )
                }
            } catch (e: ApiClient.MfaRequiredException) {
                _state.value = _state.value.copy(loading = false, mfaRequired = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not load plans.")
            }
        }
    }

    /** Returns the hosted Paystack checkout URL to open in a browser. */
    suspend fun checkoutUrl(plan: String): String? {
        _state.value = _state.value.copy(checkoutBusy = true, checkoutError = null)
        return try {
            val body = kotlinx.serialization.json.buildJsonObject {
                put("plan", kotlinx.serialization.json.JsonPrimitive(plan))
            }.toString()
            val resp = api.json.decodeFromString(CheckoutResponse.serializer(), api.post("/billing/paystack/create", body))
            _state.value = _state.value.copy(checkoutBusy = false)
            resp.data?.authorizationUrl
        } catch (e: ApiClient.MfaRequiredException) {
            _state.value = _state.value.copy(checkoutBusy = false, mfaRequired = true)
            null
        } catch (e: Exception) {
            _state.value = _state.value.copy(checkoutBusy = false, checkoutError = e.message ?: "Could not start checkout. Please try again.")
            null
        }
    }
}

@Composable
fun BillingScreen(container: AppContainer, onBack: () -> Unit, onMfaRequired: () -> Unit) {
    val vm = containerViewModel { BillingViewModel(container.api) }
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.mfaRequired) { if (it) onMfaRequired() }

    if (state.loading) {
        LoadingBox()
        return
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        TextButton(onClick = onBack, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) { Text("← Back") }
        Text("Plans", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
        Text(
            "Your application is free. Jobiest never asks candidates for money; paid plans add capacity.",
            fontSize = 13.sp,
            color = JobiestColors.Muted,
            modifier = Modifier.padding(top = 4.dp, bottom = 14.dp),
        )
        state.entitlements?.let { ent ->
            SectionCard(eyebrow = "CURRENT PLAN") {
                Text(ent.plan, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
                Text(
                    "${ent.aiCreditsRemaining} AI generations left · ${ent.applicationsRemaining} agent applications left",
                    fontSize = 12.5.sp,
                    color = JobiestColors.Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Spacer(Modifier.height(12.dp))
        }
        if (state.error != null) {
            ErrorBox(state.error.orEmpty(), onRetry = { vm.load() })
            Spacer(Modifier.height(12.dp))
        }
        if (state.checkoutError != null) {
            ErrorBox(state.checkoutError.orEmpty())
            Spacer(Modifier.height(12.dp))
        }
        state.plans.forEach { plan ->
            SectionCard(eyebrow = plan.highlight) {
                Text(plan.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = JobiestColors.Ink)
                Text(
                    if (plan.monthlyNgn == 0L) "Free forever" else "₦${"%,d".format(plan.monthlyNgn)} / month",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = JobiestColors.Rust,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Spacer(Modifier.height(8.dp))
                plan.features.take(5).forEach { feature ->
                    Text("· $feature", fontSize = 12.5.sp, color = JobiestColors.Muted, modifier = Modifier.padding(vertical = 1.dp))
                }
                if (plan.code != "FREE" && state.paystackReady) {
                    Spacer(Modifier.height(10.dp))
                    val isCurrent = state.entitlements?.plan == plan.code
                    if (isCurrent) {
                        OutlinedButton(onClick = {}, enabled = false) { Text("Current plan") }
                    } else {
                        Button(
                            onClick = {
                                scope.launch {
                                    val url = vm.checkoutUrl(plan.code)
                                    if (url != null) openInCustomTab(context, url)
                                }
                            },
                            enabled = !state.checkoutBusy,
                        ) { Text(if (state.checkoutBusy) "Starting…" else "Pay with Paystack") }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        Text(
            "Checkout opens in your browser and uses the same secure Paystack page as the website. Your plan activates the moment payment is confirmed.",
            fontSize = 12.sp,
            color = JobiestColors.Muted,
        )
        Spacer(Modifier.height(24.dp))
    }
}
