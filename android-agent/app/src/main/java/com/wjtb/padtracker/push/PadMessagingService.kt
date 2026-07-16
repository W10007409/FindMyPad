package com.wjtb.padtracker.push

import android.content.Intent
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
      FcmCommand.Ring ->
        startActivity(Intent(this, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
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
}
