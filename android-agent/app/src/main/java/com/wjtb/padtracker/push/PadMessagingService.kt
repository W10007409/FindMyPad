package com.wjtb.padtracker.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wjtb.padtracker.domain.FcmCommand
import com.wjtb.padtracker.ui.ring.RingActivity
import com.wjtb.padtracker.work.ReportWorker

class PadMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    when (MessageRouter.route(message.data)) {
      // Android 10+ forbids starting an Activity directly from the background (an FCM
      // handler runs in the background), so we post a high-importance full-screen-intent
      // notification instead — the OS is allowed to launch RingActivity over the lock
      // screen from that, the same mechanism incoming-call screens use.
      FcmCommand.Ring -> showRingFullScreen(message.data)
      FcmCommand.LocateNow ->
        // Fire an immediate one-off report (battery + Wi-Fi BSSID) instead of waiting for
        // the next periodic cycle. ReportWorker also flushes any queued reports.
        WorkManager.getInstance(this).enqueue(
          OneTimeWorkRequestBuilder<ReportWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build(),
        )
      null -> {}
    }
  }

  override fun onNewToken(token: String) {
    // Pilot limitation: the FCM token is captured fresh at enrollment. If the token rotates
    // after enrollment, the pad must re-enroll for the server to receive the new token
    // (there is no standalone token-refresh endpoint yet).
  }

  private fun showRingFullScreen(data: Map<String, String>) {
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(RING_CHANNEL_ID, "패드 찾기 벨", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "관리자가 패드를 찾기 위해 벨을 울립니다."
        enableVibration(true)
      },
    )
    // Carry the assigned renter (from the RING payload) into the ring screen so whoever
    // finds the pad sees whose it is.
    val ringIntent = Intent(this, RingActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(RingActivity.EXTRA_NAME, data["ownerName"].orEmpty())
      .putExtra(RingActivity.EXTRA_DEPARTMENT, data["ownerDept"].orEmpty())
    val fullScreen = PendingIntent.getActivity(
      this,
      0,
      ringIntent,
      // FLAG_UPDATE_CURRENT is required: PendingIntent equality ignores extras, so without it
      // a cached PendingIntent from an earlier ring would keep its old (possibly empty) owner
      // extras and this ring's owner name would never reach RingActivity.
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notif = NotificationCompat.Builder(this, RING_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("패드 찾기")
      .setContentText("관리자가 이 패드의 벨을 울렸습니다. 탭하여 확인하세요.")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setFullScreenIntent(fullScreen, true)
      .setAutoCancel(true)
      .setOngoing(true)
      .build()
    nm.notify(RING_NOTIF_ID, notif)
  }

  companion object {
    const val RING_CHANNEL_ID = "pad_ring"
    const val RING_NOTIF_ID = 2001
  }
}
