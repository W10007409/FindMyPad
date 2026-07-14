package com.wjtb.padtracker.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.samsung.android.knox.AppIdentity
import com.samsung.android.knox.EnterpriseDeviceManager
import com.samsung.android.knox.application.ApplicationPolicy
import com.samsung.android.knox.license.KnoxEnterpriseLicenseManager
import com.wjtb.padtracker.admin.DeviceAdminHelper
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

class KnoxDeviceControl(
    private val context: Context,
    private val licenseKey: String,
) : DeviceControl {

    private val pkg: String get() = context.packageName

    override suspend fun activateLicense(): Result<Unit> {
        if (!DeviceAdminHelper.isAdminActive(context)) {
            return Result.failure(IllegalStateException("Device Admin not active"))
        }
        if (licenseKey.isBlank()) {
            return Result.failure(IllegalStateException("KPE license key not configured"))
        }
        val errorCode: Int? = withTimeoutOrNull(LICENSE_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context, intent: Intent) {
                        if (intent.action == KnoxEnterpriseLicenseManager.ACTION_LICENSE_STATUS) {
                            val code = intent.getIntExtra(
                                KnoxEnterpriseLicenseManager.EXTRA_LICENSE_ERROR_CODE,
                                KnoxEnterpriseLicenseManager.ERROR_UNKNOWN,
                            )
                            runCatching { context.unregisterReceiver(this) }
                            if (cont.isActive) cont.resume(code)
                        }
                    }
                }
                ContextCompat.registerReceiver(
                    context,
                    receiver,
                    IntentFilter(KnoxEnterpriseLicenseManager.ACTION_LICENSE_STATUS),
                    ContextCompat.RECEIVER_EXPORTED,
                )
                cont.invokeOnCancellation { runCatching { context.unregisterReceiver(receiver) } }
                try {
                    KnoxEnterpriseLicenseManager.getInstance(context).activateLicense(licenseKey)
                } catch (e: Exception) {
                    runCatching { context.unregisterReceiver(receiver) }
                    if (cont.isActive) cont.resume(KnoxEnterpriseLicenseManager.ERROR_INTERNAL)
                }
            }
        }
        return when (errorCode) {
            KnoxEnterpriseLicenseManager.ERROR_NONE -> Result.success(Unit)
            null -> Result.failure(IllegalStateException("License activation timed out"))
            else -> Result.failure(IllegalStateException("License activation failed (code=$errorCode)"))
        }
    }

    override fun lockUninstall(): Boolean = try {
        EnterpriseDeviceManager.getInstance(context).applicationPolicy
            .setApplicationUninstallationDisabled(pkg)
        true
    } catch (e: Exception) {
        Log.w(TAG, "lockUninstall failed", e); false
    }

    override fun grantPermissionsSilently(perms: List<String>): Boolean = try {
        EnterpriseDeviceManager.getInstance(context).applicationPolicy
            .applyRuntimePermissions(
                AppIdentity(pkg, null),
                perms,
                ApplicationPolicy.PERMISSION_POLICY_STATE_GRANT,
            )
        true
    } catch (e: Exception) {
        Log.w(TAG, "grantPermissionsSilently failed", e); false
    }

    override fun disableMacRandomization(ssid: String): Boolean {
        // 이 Knox SDK(API 28, 2019)에는 WifiPolicy MAC 랜덤화 API가 없다.
        // 실제 MAC 랜덤화 해제는 Knox Service Plugin(KSP) 프로파일(관리자 설정)로 처리한다.
        Log.w(TAG, "disableMacRandomization not supported by this Knox SDK; use KSP profile for ssid=$ssid")
        return false
    }

    override fun readSerial(): String? = try {
        Build.getSerial()
    } catch (e: Exception) {
        Log.w(TAG, "readSerial failed", e); null
    }

    companion object {
        private const val TAG = "KnoxDeviceControl"
        private const val LICENSE_TIMEOUT_MS = 30_000L
    }
}
