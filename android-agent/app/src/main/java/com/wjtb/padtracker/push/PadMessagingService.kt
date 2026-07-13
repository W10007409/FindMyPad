package com.wjtb.padtracker.push

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wjtb.padtracker.domain.FcmCommand
import com.wjtb.padtracker.ui.ring.RingActivity

class PadMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    when (MessageRouter.route(message.data)) {
      FcmCommand.Ring ->
        startActivity(Intent(this, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      FcmCommand.LocateNow -> {
        // 즉시 1회 위치 보고: WorkManager one-time enqueue는 이후 작업(컨테이너 경유)에서 연결한다.
      }
      null -> {}
    }
  }

  override fun onNewToken(token: String) {
    // 토큰 저장/서버 재등록 훅은 이후 작업에서 연결한다.
  }
}
