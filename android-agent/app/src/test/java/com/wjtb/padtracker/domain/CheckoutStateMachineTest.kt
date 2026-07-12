package com.wjtb.padtracker.domain

import org.junit.Assert.*
import org.junit.Test

class CheckoutStateMachineTest {
  private val sm = CheckoutStateMachine()

  @Test fun starts_not_checked_out() {
    assertEquals(CheckoutState.NotCheckedOut, sm.reduce(CheckoutState.NotCheckedOut, CheckoutEvent.Reset))
  }

  @Test fun checkout_success_moves_to_checked_out() {
    val s = sm.reduce(CheckoutState.NotCheckedOut, CheckoutEvent.CheckedOut(42L, "E100"))
    assertEquals(CheckoutState.CheckedOut(42L, "E100"), s)
  }

  @Test fun return_moves_to_not_checked_out() {
    val s = sm.reduce(CheckoutState.CheckedOut(42L, "E100"), CheckoutEvent.Returned)
    assertEquals(CheckoutState.NotCheckedOut, s)
  }

  @Test fun cannot_checkout_when_already_checked_out() {
    // 이미 대여 중이면 새 CheckedOut 이벤트는 무시(기존 상태 유지) — 서버 409와 대칭
    val cur = CheckoutState.CheckedOut(1L, "E1")
    assertEquals(cur, sm.reduce(cur, CheckoutEvent.CheckedOut(2L, "E2")))
  }
}
