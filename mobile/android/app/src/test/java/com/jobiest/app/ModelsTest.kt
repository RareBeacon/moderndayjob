package com.jobiest.app

import com.jobiest.app.core.ApplicationDetailResponse
import com.jobiest.app.core.ApplicationsResponse
import com.jobiest.app.core.SupabaseSession
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** Wire parsing: additive server fields must never break the app. */
class ModelsTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `parses the applications list`() {
        val text = """
            {"applications":[{"id":"a1","status":"DRAFT","job":{"company":"Acme","title":"Designer"}}],
             "automationEnabled":false}
        """.trimIndent()
        val resp = json.decodeFromString(ApplicationsResponse.serializer(), text)
        assertEquals(1, resp.applications.size)
        assertEquals("Acme", resp.applications[0].job?.company)
        assertFalse(resp.automationEnabled)
    }

    @Test
    fun `parses application detail with unknown fields present`() {
        val text = """
            {"application":{"id":"a1","status":"AWAITING_APPROVAL","job":{"company":"Acme","title":"X"},
             "someFutureField":true},
             "package":[{"id":"d1","kind":"CV","title":"CV","version":2,"truthfulnessPassed":true,"newField":1}],
             "timeline":[{"event":"PREPARED","at":"2026-09-22","meta":{"a":1}}],
             "automationEnabled":true}
        """.trimIndent()
        val resp = json.decodeFromString(ApplicationDetailResponse.serializer(), text)
        assertEquals("a1", resp.application.id)
        assertEquals(1, resp.`package`.size)
        assertTrue(resp.`package`[0].truthfulnessPassed)
        assertEquals("PREPARED", resp.timeline.first().event)
        assertTrue(resp.automationEnabled)
    }

    @Test
    fun `parses a minimal session`() {
        val text = """{"access_token":"at","refresh_token":"rt"}"""
        val session = json.decodeFromString(SupabaseSession.serializer(), text)
        assertEquals("at", session.accessToken)
        assertEquals("rt", session.refreshToken)
        assertNull(session.expiresAt)
        assertNull(session.user)
    }

    private fun assertTrue(value: Boolean) = org.junit.Assert.assertTrue(value)
}
