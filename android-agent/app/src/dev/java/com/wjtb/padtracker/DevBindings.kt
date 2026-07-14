package com.wjtb.padtracker
import android.content.Context
import android.provider.Settings
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl =
  MockDeviceControl(Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown")
fun providePushService(): PushService = MockPushService()
fun provideAdminActivation(): AdminActivation = NoopAdminActivation()
