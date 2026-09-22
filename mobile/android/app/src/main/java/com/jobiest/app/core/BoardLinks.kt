package com.jobiest.app.core

import java.net.URLEncoder

/**
 * Port of lib/boardlinks.ts (the "employer's front door" strategy): build
 * search links into LinkedIn and Indeed from the user's own saved
 * preferences. The agent applies through employers' own career sites; these
 * links let the user browse the boards directly. Never automated, never
 * scraped.
 */
object BoardLinks {

    private const val MAX_ROLES = 3
    private const val LINKEDIN_REMOTE_FILTER = "2"
    private const val INDEED_REMOTE_TOKEN = "032b3046-06a3-4876-8dfd-474ebaf14158"

    data class BoardLink(val boardLabel: String, val role: String, val url: String)

    /** Remote-only when every remote_types entry means "remote". */
    fun isRemoteOnly(remoteTypes: List<String>?): Boolean {
        val types = remoteTypes.orEmpty().map { it.trim() }.filter { it.isNotEmpty() }
        return types.isNotEmpty() && types.all { it.contains("remote", ignoreCase = true) }
    }

    fun build(targetRoles: List<String>?, locations: List<String>?, remoteOnly: Boolean): List<BoardLink> {
        val roles = targetRoles.orEmpty().map { it.trim() }.filter { it.isNotEmpty() }.take(MAX_ROLES)
        val location = locations.orEmpty().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: ""
        val links = mutableListOf<BoardLink>()
        for (role in roles) {
            val linkedin = StringBuilder("https://www.linkedin.com/jobs/search/?keywords=${enc(role)}")
            if (location.isNotEmpty()) linkedin.append("&location=${enc(location)}")
            if (remoteOnly) linkedin.append("&f_WT=$LINKEDIN_REMOTE_FILTER")
            links.add(BoardLink("LinkedIn", role, linkedin.toString()))

            val indeed = StringBuilder("https://www.indeed.com/jobs?q=${enc(role)}")
            if (location.isNotEmpty()) indeed.append("&l=${enc(location)}")
            indeed.append("&fromage=7")
            if (remoteOnly) indeed.append("&remotejob=$INDEED_REMOTE_TOKEN")
            links.add(BoardLink("Indeed", role, indeed.toString()))
        }
        return links
    }

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}
