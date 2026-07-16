package com.wjtb.padtracker.work

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.wjtb.padtracker.PadTrackerApp
import com.wjtb.padtracker.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service that keeps reporting the pad's telemetry (battery + Wi-Fi BSSID)
 * on a fixed interval for as long as the pad is powered on — no need to open the app.
 *
 * Persistence:
 *  - START_STICKY: if the OS kills the service under memory pressure it recreates it
 *    (with a null intent), so onStartCommand starts the loop again — a system-initiated
 *    restart isn't subject to the background foreground-service-start restriction.
 *  - Started from allowed contexts only: enrollment success and app launch (foreground),
 *    and BOOT_COMPLETED ([BootReceiver]) so it comes back after a reboot.
 *  - WorkManager ([ReportScheduler]) remains as a 15-minute heartbeat/queue-flush net.
 *
 * FGS type is `location`: reading the Wi-Fi BSSID is location-gated, and the pad's
 * position is exactly what we track, so this type is both honest and free of the
 * dataSync daily time cap.
 */
class ReportingService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var loopJob: Job? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ServiceCompat.startForeground(
      this,
      NOTIF_ID,
      buildNotification(),
      ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
    )
    if (loopJob?.isActive != true) {
      val container = (application as PadTrackerApp).container
      val loop = ReportingLoop(
        enrolled = { container.store.deviceToken() != null },
        reportOnce = {
          container.repository.flushQueue()
          container.repository.sendReport(SnapshotCollector(applicationContext).collect())
        },
        intervalMs = REPORT_INTERVAL_MS,
      )
      loopJob = scope.launch {
        loop.run()
        stopSelf() // reached only when not enrolled — nothing to report
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    scope.cancel()
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "패드 위치 추적", NotificationManager.IMPORTANCE_LOW).apply {
        description = "패드 위치·상태를 주기적으로 전송합니다."
      },
    )
    val tap = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("패드 추적 실행 중")
      .setContentText("위치와 상태를 주기적으로 전송하고 있습니다.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setContentIntent(tap)
      .build()
  }

  companion object {
    const val REPORT_INTERVAL_MS = 60_000L
    private const val NOTIF_ID = 1001
    private const val CHANNEL_ID = "pad_tracking"

    /** Start the foreground service. Call only from a foreground or boot context. */
    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, ReportingService::class.java))
    }
  }
}
