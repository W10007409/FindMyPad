package com.wjtb.padtracker.ui

import app.cash.turbine.test
import com.wjtb.padtracker.core.DeviceControl
import com.wjtb.padtracker.core.MockDeviceControl
import com.wjtb.padtracker.core.PushService
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.data.api.EnrollResponse
import com.wjtb.padtracker.ui.enrollment.EnrollmentViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class EnrollmentViewModelTest {
  @Before fun setUp() { Dispatchers.setMain(StandardTestDispatcher()) }
  @After fun tearDown() { Dispatchers.resetMain() }

  private val deviceControl = MockDeviceControl(androidId = "ANDROID-123")
  private val pushService = object : PushService { override suspend fun currentToken() = "FCM-XYZ" }

  @Test fun success_sets_success_state() = runTest {
    val vm = EnrollmentViewModel(
      deviceControl = deviceControl,
      enrollable = { _, _, _, _ -> ApiResult.Ok(EnrollResponse(1, "A-1", "DTOK")) },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertEquals(UiState.Success, awaitItem())
    }
  }

  @Test fun enroll_error_sets_error_state() = runTest {
    val vm = EnrollmentViewModel(
      deviceControl = deviceControl,
      enrollable = { _, _, _, _ -> ApiResult.Error(RuntimeException("net")) },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertTrue(awaitItem() is UiState.Error)
    }
  }

  @Test fun enroll_conflict_sets_conflict_state() = runTest {
    val vm = EnrollmentViewModel(
      deviceControl = deviceControl,
      enrollable = { _, _, _, _ -> ApiResult.Conflict },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertEquals(UiState.Conflict, awaitItem())
    }
  }

  @Test fun license_activation_failure_sets_error_state() = runTest {
    val failingDeviceControl = object : DeviceControl {
      override suspend fun activateLicense(): Result<Unit> = Result.failure(RuntimeException("license denied"))
      override fun lockUninstall(): Boolean = true
      override fun grantPermissionsSilently(perms: List<String>): Boolean = true
      override fun disableMacRandomization(ssid: String): Boolean = true
      override fun readSerial(): String? = "S1"
    }
    val vm = EnrollmentViewModel(
      deviceControl = failingDeviceControl,
      enrollable = { _, _, _, _ -> ApiResult.Ok(EnrollResponse(1, "A-1", "DTOK")) },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertTrue(awaitItem() is UiState.Error)
    }
  }

  @Test fun null_serial_sets_error_state() = runTest {
    val noSerialDeviceControl = object : DeviceControl {
      override suspend fun activateLicense(): Result<Unit> = Result.success(Unit)
      override fun lockUninstall(): Boolean = true
      override fun grantPermissionsSilently(perms: List<String>): Boolean = true
      override fun disableMacRandomization(ssid: String): Boolean = true
      override fun readSerial(): String? = null
    }
    val vm = EnrollmentViewModel(
      deviceControl = noSerialDeviceControl,
      enrollable = { _, _, _, _ -> ApiResult.Ok(EnrollResponse(1, "A-1", "DTOK")) },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertTrue(awaitItem() is UiState.Error)
    }
  }

  @Test fun enroll_forwards_push_token_to_enrollable() = runTest {
    var capturedFcmToken: String? = null
    val vm = EnrollmentViewModel(
      deviceControl = deviceControl,
      enrollable = { _, _, _, fcmToken ->
        capturedFcmToken = fcmToken
        ApiResult.Ok(EnrollResponse(1, "A-1", "DTOK"))
      },
      pushService = pushService,
    )
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.enroll()
      assertEquals(UiState.Loading, awaitItem())
      assertEquals(UiState.Success, awaitItem())
    }
    assertEquals("FCM-XYZ", capturedFcmToken)
  }
}
