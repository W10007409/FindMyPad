package com.wjtb.padtracker
import android.content.Context
import android.provider.Settings
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl =
  MockDeviceControl(Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown")
// Real FCM so dev test devices can receive RING / LOCATE_NOW once google-services.json is added.
// Without the credential file RealPushService returns a null token (no crash).
fun providePushService(): PushService = com.wjtb.padtracker.push.RealPushService()
fun provideAdminActivation(): AdminActivation = NoopAdminActivation()
