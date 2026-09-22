package com.jobiest.app

import com.jobiest.app.core.BoardLinks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors the website's tests for lib/boardlinks.ts: same URLs, same rules. */
class BoardLinksTest {

    @Test
    fun `remote only when every type is remote`() {
        assertTrue(BoardLinks.isRemoteOnly(listOf("remote")))
        assertTrue(BoardLinks.isRemoteOnly(listOf("Remote", "fully remote")))
        assertFalse(BoardLinks.isRemoteOnly(listOf("remote", "hybrid")))
        assertFalse(BoardLinks.isRemoteOnly(emptyList()))
        assertFalse(BoardLinks.isRemoteOnly(null))
    }

    @Test
    fun `builds one linkedin and one indeed link per role`() {
        val links = BoardLinks.build(listOf("Product Designer"), listOf("Lagos, Nigeria"), false)
        assertEquals(2, links.size)
        assertEquals("LinkedIn", links[0].boardLabel)
        assertTrue(links[0].url.startsWith("https://www.linkedin.com/jobs/search/?keywords=Product+Designer"))
        assertTrue(links[0].url.contains("location=Lagos%2C+Nigeria"))
        assertFalse(links[0].url.contains("f_WT"))
        assertEquals("Indeed", links[1].boardLabel)
        assertTrue(links[1].url.startsWith("https://www.indeed.com/jobs?q=Product+Designer"))
        assertTrue(links[1].url.contains("l=Lagos%2C+Nigeria"))
        assertTrue(links[1].url.contains("fromage=7"))
        assertFalse(links[1].url.contains("remotejob"))
    }

    @Test
    fun `remote filters only when remote only`() {
        val links = BoardLinks.build(listOf("Developer"), null, true)
        assertTrue(links[0].url.contains("f_WT=2"))
        assertFalse(links[0].url.contains("location="))
        assertTrue(links[1].url.contains("remotejob=032b3046-06a3-4876-8dfd-474ebaf14158"))
        assertFalse(links[1].url.contains("&l="))
    }

    @Test
    fun `at most three roles`() {
        assertEquals(6, BoardLinks.build(listOf("a", "b", "c", "d", "e"), null, false).size)
    }

    @Test
    fun `first location only, blanks ignored`() {
        val links = BoardLinks.build(listOf("Analyst"), listOf("  ", "Lagos", "Abuja"), false)
        assertTrue(links[0].url.contains("location=Lagos"))
        assertFalse(links[0].url.contains("Abuja"))
    }
}
