package com.wjtb.padtracker.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.wjtb.padtracker.core.PushService
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Real FCM-backed [PushService]. Returns the device's Firebase registration token so
 * the server can target it with RING / LOCATE_NOW pushes.
 *
 * Defensive by design: if Firebase isn't configured on this build (no google-services.json,
 * so no default FirebaseApp), token retrieval fails and we return null instead of crashing.
 * The device then enrolls with a null token — enrollment and reporting still work, only the
 * push commands are unavailable until the credential file is added and the pad re-enrolls.
 */
class RealPushService : PushService {
  override suspend fun currentToken(): String? = try {
    suspendCancellableCoroutine { cont ->
      FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token -> cont.resume(token) }
        .addOnFailureListener { e ->
          Log.w(TAG, "FCM token fetch failed", e)
          cont.resume(null)
        }
    }
  } catch (e: Exception) {
    // getInstance() throws if no default FirebaseApp (google-services.json missing).
    Log.w(TAG, "FCM not configured; enrolling without a push token", e)
    null
  }

  companion object {
    private const val TAG = "RealPushService"
  }
}
