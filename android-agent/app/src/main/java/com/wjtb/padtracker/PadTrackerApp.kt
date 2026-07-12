package com.wjtb.padtracker
import android.app.Application
class PadTrackerApp : Application() {
  lateinit var container: AppContainer; private set
  override fun onCreate() { super.onCreate(); container = AppContainer(this) }
}
