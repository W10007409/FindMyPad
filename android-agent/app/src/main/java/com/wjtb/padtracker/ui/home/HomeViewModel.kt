package com.wjtb.padtracker.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wjtb.padtracker.domain.CheckoutState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Exposes the device's current CheckoutState. Injected as a narrow suspend function so this
 * ViewModel never needs the concrete DeviceStore — pass `deviceStore::checkoutState` at the call site.
 */
class HomeViewModel(
  private val checkoutStateProvider: suspend () -> CheckoutState,
) : ViewModel() {
  private val _checkoutState = MutableStateFlow<CheckoutState>(CheckoutState.NotCheckedOut)
  val checkoutState: StateFlow<CheckoutState> = _checkoutState.asStateFlow()

  init { refresh() }

  fun refresh() {
    viewModelScope.launch {
      _checkoutState.value = checkoutStateProvider()
    }
  }
}
