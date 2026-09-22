package com.jobiest.app

import android.app.Application
import com.jobiest.app.core.ApiClient
import com.jobiest.app.core.AuthClient

/**
 * Application entry point and the tiny dependency container: one auth client
 * (Supabase REST, persisted session) and one API client (jobiest.com with
 * Bearer tokens). No DI framework; a founder maintaining this alone should
 * be able to follow every wire.
 */
class JobiestApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(application: Application) {
    val auth: AuthClient = AuthClient(application)
    val api: ApiClient = ApiClient(auth)
}
