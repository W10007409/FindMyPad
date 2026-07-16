package com.wjtb.padtracker.work
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.WorkManager
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      ReportScheduler.schedule(WorkManager.getInstance(context))
      // Starting a foreground service from BOOT_COMPLETED is exempt from the
      // background-start restriction, so the pad resumes tracking after a reboot
      // without anyone opening the app.
      ReportingService.start(context)
    }
  }
}
