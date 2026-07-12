package com.wjtb.padtracker.ui

import app.cash.turbine.test
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.data.api.CheckoutResponse
import com.wjtb.padtracker.ui.checkout.CheckoutViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutViewModelTest {
  @Before fun setUp() { Dispatchers.setMain(StandardTestDispatcher()) }
  @After fun tearDown() { Dispatchers.resetMain() }

  @Test fun conflict_sets_conflict_state() = runTest {
    val vm = CheckoutViewModel(checkoutable = { ApiResult.Conflict }, clock = { "2026-07-12T00:00:00Z" })
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.submit("E100")
      assertEquals(UiState.Loading, awaitItem())
      assertEquals(UiState.Conflict, awaitItem())
    }
  }

  @Test fun ok_sets_success() = runTest {
    val vm = CheckoutViewModel(checkoutable = { ApiResult.Ok(CheckoutResponse(1, 2)) }, clock = { "2026-07-12T00:00:00Z" })
    vm.uiState.test { awaitItem(); vm.submit("E100"); awaitItem(); assertEquals(UiState.Success, awaitItem()) }
  }

  @Test fun error_sets_error_state() = runTest {
    val vm = CheckoutViewModel(checkoutable = { ApiResult.Error(RuntimeException("net")) }, clock = { "2026-07-12T00:00:00Z" })
    vm.uiState.test {
      assertEquals(UiState.Idle, awaitItem())
      vm.submit("E100")
      assertEquals(UiState.Loading, awaitItem())
      assertTrue(awaitItem() is UiState.Error)
    }
  }
}
