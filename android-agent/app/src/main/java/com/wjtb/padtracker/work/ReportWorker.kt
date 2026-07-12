package com.wjtb.padtracker.work
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.wjtb.padtracker.PadTrackerApp
class ReportWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result {
    val container = (applicationContext as PadTrackerApp).container
    return try {
      container.repository.flushQueue()
      container.repository.sendReport(SnapshotCollector(applicationContext).collect())
      Result.success()
    } catch (e: Exception) { Result.retry() }
  }
}
