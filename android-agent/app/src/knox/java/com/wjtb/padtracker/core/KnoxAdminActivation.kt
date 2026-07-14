package com.wjtb.padtracker.core
import android.content.Context
import android.content.Intent
import com.wjtb.padtracker.admin.DeviceAdminHelper
class KnoxAdminActivation : AdminActivation {
    override fun isActive(context: Context): Boolean = DeviceAdminHelper.isAdminActive(context)
    override fun activationIntent(context: Context): Intent? = DeviceAdminHelper.adminActivationIntent(context)
}
