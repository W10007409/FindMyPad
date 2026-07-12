package com.wjtb.padtracker.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wjtb.padtracker.data.Checkoutable
import com.wjtb.padtracker.domain.ConsentInfo
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.ui.UiState
import com.wjtb.padtracker.util.Clock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CheckoutViewModel(
  private val checkoutable: Checkoutable,
  private val clock: Clock,
) : ViewModel() {
  private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
  val uiState: StateFlow<UiState> = _uiState.asStateFlow()

  fun submit(empNo: String) {
    _uiState.value = UiState.Loading
    viewModelScope.launch {
      _uiState.value = when (val result = checkoutable.checkout(ConsentInfo(empNo, clock.nowIso()))) {
        is ApiResult.Ok -> UiState.Success
        is ApiResult.Conflict -> UiState.Conflict
        is ApiResult.Error -> UiState.Error(result.cause.message ?: "네트워크 오류")
      }
    }
  }
}
