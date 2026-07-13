package com.wjtb.padtracker.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wjtb.padtracker.AppContainer
import com.wjtb.padtracker.PadTrackerApp
import com.wjtb.padtracker.ui.checkout.CheckoutScreen
import com.wjtb.padtracker.ui.checkout.CheckoutViewModel
import com.wjtb.padtracker.ui.enrollment.EnrollmentScreen
import com.wjtb.padtracker.ui.enrollment.EnrollmentViewModel
import com.wjtb.padtracker.ui.home.HomeScreen
import com.wjtb.padtracker.ui.home.HomeViewModel
import com.wjtb.padtracker.ui.theme.PadTrackerTheme
import com.wjtb.padtracker.util.Clock
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val container = (application as PadTrackerApp).container
    setContent {
      PadTrackerTheme {
        AppNav(container)
      }
    }
  }
}

/** Which top-level screen is currently shown. Null while the initial deviceToken check is pending. */
private sealed interface Screen {
  data object Enrollment : Screen
  data object Home : Screen
  data object Checkout : Screen
}

@Composable
private fun AppNav(container: AppContainer) {
  var screen by remember { mutableStateOf<Screen?>(null) }
  val scope = rememberCoroutineScope()

  // Decide Enrollment vs Home once, based on whether this device already has a token.
  LaunchedEffect(Unit) {
    screen = if (container.store.deviceToken() == null) Screen.Enrollment else Screen.Home
  }

  val enrollmentViewModel: EnrollmentViewModel =
    viewModel { EnrollmentViewModel(container.deviceControl, container.repository) }
  val checkoutViewModel: CheckoutViewModel =
    viewModel { CheckoutViewModel(container.repository, clock = Clock { java.time.Instant.now().toString() }) }
  val homeViewModel: HomeViewModel =
    viewModel { HomeViewModel(checkoutStateProvider = { container.store.checkoutState() }) }

  when (val s = screen) {
    null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    Screen.Enrollment -> EnrollmentScreen(
      viewModel = enrollmentViewModel,
      onEnrolled = { screen = Screen.Home },
    )
    Screen.Home -> HomeScreen(
      viewModel = homeViewModel,
      onCheckout = { screen = Screen.Checkout },
      onReturn = {
        scope.launch {
          container.repository.returnDevice()
          homeViewModel.refresh()
        }
      },
    )
    Screen.Checkout -> CheckoutScreen(
      viewModel = checkoutViewModel,
      onDone = {
        homeViewModel.refresh()
        screen = Screen.Home
      },
    )
  }
}
