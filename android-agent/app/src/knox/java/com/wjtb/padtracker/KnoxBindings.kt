package com.wjtb.padtracker
import android.content.Context
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl =
    KnoxDeviceControl(context, BuildConfig.KPE_LICENSE_KEY)
fun providePushService(): PushService = com.wjtb.padtracker.push.RealPushService()
fun provideAdminActivation(): AdminActivation = KnoxAdminActivation()
