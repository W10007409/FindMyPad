package com.wjtb.padtracker.data
import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.wjtb.padtracker.domain.CheckoutState
import kotlinx.coroutines.flow.first

interface DeviceStore {
  suspend fun deviceToken(): String?
  suspend fun setDeviceToken(t: String?)
  suspend fun checkoutState(): CheckoutState
  suspend fun setCheckoutState(s: CheckoutState)
  suspend fun baseUrl(): String
}

private val Context.dataStore by preferencesDataStore(name = "pad")
class DataStoreDeviceStore(private val context: Context, private val defaultBaseUrl: String) : DeviceStore {
  private val TOKEN = stringPreferencesKey("device_token")
  private val CO_ID = longPreferencesKey("checkout_id")
  private val CO_EMP = stringPreferencesKey("checkout_emp")
  private val BASE = stringPreferencesKey("base_url")
  override suspend fun deviceToken() = context.dataStore.data.first()[TOKEN]
  override suspend fun setDeviceToken(t: String?) { context.dataStore.edit { if (t == null) it.remove(TOKEN) else it[TOKEN] = t } }
  override suspend fun checkoutState(): CheckoutState {
    val p = context.dataStore.data.first(); val id = p[CO_ID]; val emp = p[CO_EMP]
    return if (id != null && emp != null) CheckoutState.CheckedOut(id, emp) else CheckoutState.NotCheckedOut
  }
  override suspend fun setCheckoutState(s: CheckoutState) { context.dataStore.edit {
    when (s) { is CheckoutState.CheckedOut -> { it[CO_ID] = s.checkoutId; it[CO_EMP] = s.empNo }
      is CheckoutState.NotCheckedOut -> { it.remove(CO_ID); it.remove(CO_EMP) } } } }
  override suspend fun baseUrl() = context.dataStore.data.first()[BASE] ?: defaultBaseUrl
}
