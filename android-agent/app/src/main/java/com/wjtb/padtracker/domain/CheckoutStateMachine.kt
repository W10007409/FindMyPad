package com.wjtb.padtracker.domain

class CheckoutStateMachine {
  fun reduce(state: CheckoutState, event: CheckoutEvent): CheckoutState = when (event) {
    is CheckoutEvent.Reset -> CheckoutState.NotCheckedOut
    is CheckoutEvent.Returned -> CheckoutState.NotCheckedOut
    is CheckoutEvent.CheckedOut -> when (state) {
      is CheckoutState.NotCheckedOut -> CheckoutState.CheckedOut(event.checkoutId, event.empNo)
      is CheckoutState.CheckedOut -> state // 이미 대여 중 — 무시 (서버 409와 대칭)
    }
  }
}
