package com.wjtb.padtracker.work
import androidx.work.*
import java.util.concurrent.TimeUnit
object ReportScheduler {
  const val INTERVAL_MINUTES = 15L
  const val WORK_NAME = "periodic_report"
  fun periodicRequest(): PeriodicWorkRequest =
    PeriodicWorkRequestBuilder<ReportWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .build()
  fun schedule(wm: WorkManager) = wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, periodicRequest())
}
