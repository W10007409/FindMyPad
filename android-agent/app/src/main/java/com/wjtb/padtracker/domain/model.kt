package com.wjtb.padtracker.domain

data class ConsentInfo(val empNo: String, val consentAtIso: String)

sealed interface CheckoutState {
  data object NotCheckedOut : CheckoutState
  data class CheckedOut(val checkoutId: Long, val empNo: String) : CheckoutState
}

sealed interface CheckoutEvent {
  data object Reset : CheckoutEvent
  data class CheckedOut(val checkoutId: Long, val empNo: String) : CheckoutEvent
  data object Returned : CheckoutEvent
}
