package com.wjtb.padtracker.ui.enrollment

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wjtb.padtracker.ui.UiState

/**
 * Minimal onboarding screen: kicks off EnrollmentViewModel.enroll() and reports progress/result.
 * On success the caller decides when to move on (see the "홈으로 이동" button) rather than this
 * screen auto-navigating, so re-entering the screen never causes a surprise nav side effect.
 */
@Composable
fun EnrollmentScreen(
  viewModel: EnrollmentViewModel,
  onEnrolled: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val uiState by viewModel.uiState.collectAsState()

  Column(
    modifier = modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("기기 등록", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(16.dp))
    when (val s = uiState) {
      is UiState.Idle -> Text("등록을 시작하려면 아래 버튼을 눌러주세요.")
      is UiState.Loading -> {
        CircularProgressIndicator()
        Spacer(Modifier.height(8.dp))
        Text("등록 중...")
      }
      is UiState.Success -> Text("등록이 완료되었습니다.")
      is UiState.Conflict -> Text("이미 등록된 기기입니다.")
      is UiState.Error -> Text("오류: ${s.msg}")
    }
    Spacer(Modifier.height(24.dp))
    if (uiState is UiState.Success) {
      Button(onClick = onEnrolled) { Text("홈으로 이동") }
    } else {
      Button(onClick = { viewModel.enroll() }, enabled = uiState !is UiState.Loading) {
        Text("등록 시작")
      }
    }
  }
}
