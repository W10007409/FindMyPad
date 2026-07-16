package com.wjtb.padtracker.ui.enrollment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wjtb.padtracker.core.DeviceControl
import com.wjtb.padtracker.core.PushService
import com.wjtb.padtracker.data.Enrollable
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.ui.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Runs the device onboarding sequence:
 *   1. DeviceControl.activateLicense() — must succeed or the flow stops with an Error.
 *   2. DeviceControl.readSerial() — must return a non-null serial or the flow stops with an Error.
 *   3. Enrollable.enroll(serial, model, wifiMac, fcmToken) — maps ApiResult to UiState.
 */
class EnrollmentViewModel(
  private val deviceControl: DeviceControl,
  private val enrollable: Enrollable,
  private val pushService: PushService,
) : ViewModel() {
  private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
  val uiState: StateFlow<UiState> = _uiState.asStateFlow()

  /** true when the screen should offer a manual serial text field (dev builds). */
  val allowsManualSerial: Boolean = deviceControl.allowsManualSerial

  /** Prefill for the manual serial field (dev: the ANDROID_ID fallback). Empty if unreadable. */
  val suggestedSerial: String get() = deviceControl.readSerial().orEmpty()

  /**
   * @param serialOverride operator-entered serial; only honored on builds where
   *   [allowsManualSerial] is true and the value is non-blank, otherwise the
   *   device-reported serial ([DeviceControl.readSerial]) is used.
   */
  fun enroll(serialOverride: String? = null, model: String? = null, wifiMac: String? = null) {
    _uiState.value = UiState.Loading
    viewModelScope.launch {
      val license = deviceControl.activateLicense()
      if (license.isFailure) {
        _uiState.value = UiState.Error(license.exceptionOrNull()?.message ?: "라이선스 활성화 실패")
        return@launch
      }
      val manual = serialOverride?.trim()?.takeIf { it.isNotEmpty() && allowsManualSerial }
      val serial = manual ?: deviceControl.readSerial()
      if (serial == null) {
        _uiState.value = UiState.Error("기기 시리얼을 읽을 수 없습니다")
        return@launch
      }
      val fcmToken = pushService.currentToken()
      _uiState.value = when (val result = enrollable.enroll(serial, model, wifiMac, fcmToken)) {
        is ApiResult.Ok -> UiState.Success
        is ApiResult.Conflict -> UiState.Conflict
        is ApiResult.Error -> UiState.Error(result.cause.message ?: "네트워크 오류")
      }
    }
  }
}
