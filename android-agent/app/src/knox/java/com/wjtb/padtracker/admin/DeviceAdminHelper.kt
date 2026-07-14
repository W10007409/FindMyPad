package com.wjtb.padtracker.admin
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

object DeviceAdminHelper {
    fun componentName(ctx: Context): ComponentName = ComponentName(ctx, AgentAdminReceiver::class.java)

    fun isAdminActive(ctx: Context): Boolean {
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isAdminActive(componentName(ctx))
    }

    fun adminActivationIntent(ctx: Context): Intent =
        Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName(ctx))
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "패드 위치추적 에이전트가 기기 관리 정책(앱 삭제 방지 등)을 적용하려면 기기 관리자 권한이 필요합니다.",
            )
}
