package com.eyevio.plugins.wellbeing

/**
 * Capacitor plugin scaffold — Android UsageStatsManager
 *
 * Drop into a Capacitor Android app and register in MainActivity:
 *   registerPlugin(EyevioWellbeingPlugin::class.java)
 *
 * Permission: PACKAGE_USAGE_STATS (special access — user must enable in Settings).
 * Manifest: <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
 *            tools:ignore="ProtectedPermissions" />
 *
 * This reads the same usage data Digital Wellbeing is built on. There is no
 * public "Digital Wellbeing API"; UsageStatsManager is the supported path.
 */

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

@CapacitorPlugin(name = "EyevioWellbeing")
class EyevioWellbeingPlugin : Plugin() {

    private val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = TimeZone.getDefault()
    }

    @PluginMethod
    fun getCapability(call: PluginCall) {
        val ret = JSObject()
        ret.put("platform", "android")
        ret.put("source", "android_usage_stats")
        ret.put("hasUsageAccess", hasUsageAccess())
        ret.put("note", "Uses UsageStatsManager (same data Digital Wellbeing uses).")
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (!hasUsageAccess()) {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("message", "Enable usage access for EyeVio, then tap Connect again.")
            call.resolve(ret)
            return
        }
        val ret = JSObject()
        ret.put("granted", true)
        ret.put("deviceId", deviceId())
        ret.put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}")
        ret.put("osVersion", Build.VERSION.RELEASE)
        call.resolve(ret)
    }

    @PluginMethod
    fun getScreenTime(call: PluginCall) {
        if (!hasUsageAccess()) {
            call.reject("Usage access not granted")
            return
        }

        val startDay = call.getString("startDay")
        val endDay = call.getString("endDay")
        if (startDay == null || endDay == null) {
            call.reject("startDay and endDay required (YYYY-MM-DD)")
            return
        }

        val startMs = dayStartMs(startDay)
        val endMs = dayStartMs(endDay) + 24L * 60L * 60L * 1000L - 1L

        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val stats = usm.queryAndAggregateUsageStats(startMs, endMs)

        // Bucket by local calendar day using queryUsageStats daily intervals
        val days = JSArray()
        var cursor = startMs
        val cal = Calendar.getInstance()
        while (cursor <= endMs) {
            cal.timeInMillis = cursor
            val next = cursor + 24L * 60L * 60L * 1000L
            val dayStats = usm.queryAndAggregateUsageStats(cursor, next - 1)
            var totalMs = 0L
            val apps = mutableListOf<Pair<String, Long>>()
            for ((pkg, st) in dayStats) {
                val t = st.totalTimeInForeground
                if (t <= 0) continue
                totalMs += t
                apps.add(pkg to t)
            }
            apps.sortByDescending { it.second }

            val dayObj = JSObject()
            dayObj.put("day", dayFmt.format(cal.time))
            dayObj.put("total_screen_hours", totalMs / 3_600_000.0)
            dayObj.put("total_screen_ms", totalMs)
            dayObj.put("source", "android_usage_stats")

            val top = JSArray()
            for ((pkg, t) in apps.take(8)) {
                val a = JSObject()
                a.put("name", pkg)
                a.put("bundle_id", pkg)
                a.put("hours", t / 3_600_000.0)
                top.put(a)
            }
            dayObj.put("top_apps", top)
            days.put(dayObj)

            cursor = next
        }

        // Touch stats to avoid unused warning in some AGP configs
        stats.size

        val ret = JSObject()
        ret.put("days", days)
        call.resolve(ret)
    }

    private fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun deviceId(): String {
        val prefs = context.getSharedPreferences("eyevio_wellbeing", Context.MODE_PRIVATE)
        var id = prefs.getString("device_id", null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", id).apply()
        }
        return id
    }

    private fun dayStartMs(day: String): Long {
        val parts = day.split("-").map { it.toInt() }
        val cal = Calendar.getInstance()
        cal.set(Calendar.YEAR, parts[0])
        cal.set(Calendar.MONTH, parts[1] - 1)
        cal.set(Calendar.DAY_OF_MONTH, parts[2])
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }
}
