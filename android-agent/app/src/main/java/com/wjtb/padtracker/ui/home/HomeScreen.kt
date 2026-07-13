package com.wjtb.padtracker.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.wjtb.padtracker.domain.CheckoutState

/**
 * Shows the device's current checkout state and offers the single relevant action:
 * "체크아웃" when free, "반납" when checked out to somebody.
 */
@Composable
fun HomeScreen(
  viewModel: HomeViewModel,
  onCheckout: () -> Unit,
  onReturn: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val state by viewModel.checkoutState.collectAsState()

  Column(
    modifier = modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("PadTracker", style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(16.dp))
    when (val s = state) {
      is CheckoutState.NotCheckedOut -> {
        Text("현재 체크아웃되지 않았습니다.")
        Spacer(Modifier.height(24.dp))
        Button(onClick = onCheckout) { Text("체크아웃") }
      }
      is CheckoutState.CheckedOut -> {
        Text("사번 ${s.empNo} 님이 체크아웃 중입니다.")
        Spacer(Modifier.height(24.dp))
        Button(onClick = onReturn) { Text("반납") }
      }
    }
  }
}
