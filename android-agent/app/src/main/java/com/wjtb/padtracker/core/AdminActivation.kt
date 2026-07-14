package com.wjtb.padtracker.core
import android.content.Context
import android.content.Intent
interface AdminActivation {
    fun isActive(context: Context): Boolean
    fun activationIntent(context: Context): Intent?   // null = no prompt needed (dev)
}
