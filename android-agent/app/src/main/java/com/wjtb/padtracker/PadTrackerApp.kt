package com.wjtb.padtracker
import android.app.Application
class PadTrackerApp : Application() {
  lateinit var container: AppContainer; private set
  override fun onCreate() {
    super.onCreate()
    container = AppContainer(this)
    com.wjtb.padtracker.work.ReportScheduler.schedule(androidx.work.WorkManager.getInstance(this))
  }
}
