package com.wjtb.padtracker.ui.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wjtb.padtracker.ui.UiState

/**
 * Employee-number entry + explicit location-consent notice (checkout submission implies consent
 * per ConsentInfo). Shows Loading/Success/Conflict/Error from CheckoutViewModel.uiState.
 */
@Composable
fun CheckoutScreen(
  viewModel: CheckoutViewModel,
  onDone: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val uiState by viewModel.uiState.collectAsState()
  var empNo by remember { mutableStateOf("") }

  Column(modifier = modifier.fillMaxSize().padding(24.dp)) {
    Text("체크아웃", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(16.dp))
    OutlinedTextField(
      value = empNo,
      onValueChange = { empNo = it },
      label = { Text("사번") },
      enabled = uiState !is UiState.Loading && uiState !is UiState.Success,
      modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(8.dp))
    Text(
      "제출 시 이 기기의 위치 정보 수집·활용에 동의하는 것으로 간주됩니다.",
      style = MaterialTheme.typography.bodySmall,
    )
    Spacer(Modifier.height(16.dp))
    Button(
      onClick = { viewModel.submit(empNo) },
      enabled = empNo.isNotBlank() && uiState !is UiState.Loading && uiState !is UiState.Success,
      modifier = Modifier.fillMaxWidth(),
    ) { Text("제출") }
    Spacer(Modifier.height(16.dp))
    when (val s = uiState) {
      is UiState.Idle -> {}
      is UiState.Loading -> CircularProgressIndicator()
      is UiState.Success -> Text("체크아웃이 완료되었습니다.")
      is UiState.Conflict -> Text("이미 체크아웃된 기기입니다.")
      is UiState.Error -> Text("오류: ${s.msg}")
    }
    Spacer(Modifier.height(16.dp))
    TextButton(onClick = onDone) { Text(if (uiState is UiState.Success) "확인" else "뒤로") }
  }
}
