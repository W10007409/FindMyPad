package com.wjtb.padtracker
import android.content.Context
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl = KnoxDeviceControl()
fun providePushService(): PushService = object : PushService { override suspend fun currentToken(): String? = null }
