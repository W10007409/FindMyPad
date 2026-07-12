package com.wjtb.padtracker.ui

sealed interface UiState {
  data object Idle : UiState
  data object Loading : UiState
  data object Success : UiState
  data object Conflict : UiState
  data class Error(val msg: String) : UiState
}
