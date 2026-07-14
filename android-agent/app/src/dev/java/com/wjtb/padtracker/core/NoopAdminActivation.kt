package com.wjtb.padtracker.core
import android.content.Context
import android.content.Intent
class NoopAdminActivation : AdminActivation {
    override fun isActive(context: Context): Boolean = true
    override fun activationIntent(context: Context): Intent? = null
}
