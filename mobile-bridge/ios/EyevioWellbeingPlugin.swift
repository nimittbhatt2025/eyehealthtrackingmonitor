import Foundation
import UIKit
import Capacitor

/**
 * Capacitor plugin scaffold — iOS Device Activity / Screen Time
 *
 * IMPORTANT:
 * - There is NO public API to read the system "Screen Time" settings app totals.
 * - Apple’s FamilyControls + DeviceActivity frameworks let *your app* monitor
 *   selected apps/categories after the user picks them (FamilyActivityPicker)
 *   and after Apple grants the Family Controls entitlement.
 * - Apply for the entitlement: https://developer.apple.com/contact/request/family-controls-distribution
 *
 * This scaffold exposes the same JS contract as Android. Wire DeviceActivityReport
 * / DeviceActivityCenter to fill getScreenTime once the entitlement is approved.
 *
 * Register in AppDelegate / Capacitor bridge:
 *   bridge?.registerPluginInstance(EyevioWellbeingPlugin())
 */

@objc(EyevioWellbeingPlugin)
public class EyevioWellbeingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EyevioWellbeingPlugin"
    public let jsName = "EyevioWellbeing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getScreenTime", returnType: CAPPluginReturnPromise),
    ]

    private let defaultsKey = "eyevio_wellbeing_device_id"

    @objc func getCapability(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "ios",
            "source": "ios_device_activity",
            "requiresFamilyControlsEntitlement": true,
            "note": "Cannot read Settings → Screen Time directly. Use DeviceActivity after entitlement + FamilyActivityPicker.",
        ])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        // Placeholder: request AuthorizationCenter.shared.requestAuthorization(for: .individual)
        // when FamilyControls is linked.
        let id = deviceId()
        call.resolve([
            "granted": false,
            "deviceId": id,
            "deviceName": UIDevice.current.name,
            "osVersion": UIDevice.current.systemVersion,
            "message": "Add FamilyControls entitlement, then call AuthorizationCenter.requestAuthorization and FamilyActivityPicker before enabling sync.",
        ])
    }

    @objc func getScreenTime(_ call: CAPPluginCall) {
        // Return empty until DeviceActivityMonitor accumulates intervals into App Group storage.
        // Expected shape consumed by digitalWellbeingBridge.js:
        // { days: [{ day: "YYYY-MM-DD", total_screen_hours: 4.2, source: "ios_device_activity", top_apps: [] }] }
        call.resolve([
            "days": [] as [Any],
            "warning": "Implement DeviceActivity persistence, then map intervals into daily totals here.",
        ])
    }

    private func deviceId() -> String {
        if let existing = UserDefaults.standard.string(forKey: defaultsKey) {
            return existing
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: defaultsKey)
        return id
    }
}
