package com.wjtb.padtracker.ui.ring

import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.wjtb.padtracker.ui.theme.PadTrackerTheme

/**
 * Full-screen "find my pad" activity: shows over the lock screen, forces the alarm stream to max
 * volume, and loops an alarm ringtone until the owner (or whoever finds the pad) taps 중지.
 *
 * Audio side effects live only here; RingController itself stays a pure start/stop state holder
 * so its lifecycle logic is unit-testable without an Android runtime (see RingControllerTest).
 */
class RingActivity : ComponentActivity() {
  private lateinit var audioManager: AudioManager
  private var ringtone: Ringtone? = null
  private var previousAlarmVolume: Int = 0
  private lateinit var controller: RingController

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setShowWhenLocked(true)
    setTurnScreenOn(true)

    audioManager = getSystemService(AudioManager::class.java)

    val department = intent.getStringExtra(EXTRA_DEPARTMENT).orEmpty()
    val name = intent.getStringExtra(EXTRA_NAME).orEmpty()
    val extension = intent.getStringExtra(EXTRA_EXTENSION).orEmpty()

    controller = RingController(onStart = ::startRinging, onStop = ::stopRinging)

    setContent {
      PadTrackerTheme {
        RingScreen(
          department = department,
          name = name,
          extension = extension,
          onStop = {
            controller.stop()
            finish()
          },
        )
      }
    }

    controller.start()
  }

  private fun startRinging() {
    previousAlarmVolume = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
    val maxAlarmVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
    audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxAlarmVolume, 0)

    val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getValidRingtoneUri(this)
    ringtone = RingtoneManager.getRingtone(this, uri)?.apply {
      audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      // Ringtone.isLooping requires API 28+; on 26/27 (our minSdk) it plays once. Acceptable
      // for this glue task — see task-12-report.md deviations.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        isLooping = true
      }
      play()
    }
  }

  private fun stopRinging() {
    ringtone?.stop()
    ringtone = null
    audioManager.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0)
  }

  override fun onDestroy() {
    controller.stop()
    super.onDestroy()
  }

  companion object {
    const val EXTRA_DEPARTMENT = "department"
    const val EXTRA_NAME = "name"
    const val EXTRA_EXTENSION = "extension"
  }
}

@Composable
private fun RingScreen(
  department: String,
  name: String,
  extension: String,
  onStop: () -> Unit,
) {
  Column(
    modifier = Modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      text = "이 패드는 $department $name 님 기기입니다",
      style = MaterialTheme.typography.headlineSmall,
      textAlign = TextAlign.Center,
    )
    if (extension.isNotBlank()) {
      Spacer(Modifier.height(8.dp))
      Text("내선: $extension", style = MaterialTheme.typography.bodyMedium)
    }
    Spacer(Modifier.height(32.dp))
    Button(onClick = onStop) { Text("중지") }
  }
}
