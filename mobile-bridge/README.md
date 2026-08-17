# EyeVio Digital Wellbeing bridge

Browsers **cannot** read iOS Screen Time or Android Digital Wellbeing. Auto-pull requires wrapping the web app in a Capacitor (or similar) native shell and shipping the plugins in this folder.

## Contract (JS ↔ native)

Plugin name: `EyevioWellbeing`

| Method | Returns |
|--------|---------|
| `getCapability()` | `{ platform, source, ... }` |
| `requestPermission()` | `{ granted, deviceId, deviceName, osVersion, message? }` |
| `getScreenTime({ startDay, endDay })` | `{ days: [{ day, total_screen_hours, top_apps?, category_breakdown?, source }] }` |

The web app calls these via `src/utils/digitalWellbeingBridge.js`, then `POST /api/wellbeing/sync`, which upserts `screen_time_days` and **auto-fills** `lifestyle_logs.screen_time_hours`.

## Android

- Plugin: `android/EyevioWellbeingPlugin.kt`
- Uses `UsageStatsManager` (same underlying data Digital Wellbeing uses)
- User must grant **Usage access** (special app permission)
- No Play partnership with “Digital Wellbeing” app required

## iOS

- Plugin scaffold: `ios/EyevioWellbeingPlugin.swift`
- Apple does **not** expose Settings → Screen Time totals to third parties
- Path: **FamilyControls + DeviceActivity** (entitlement required) + user app/category picks
- Until entitlement + monitor are wired, use JSON/CSV import in the web UI

## Web fallback

`POST /api/wellbeing/import` accepts:

```json
{
  "days": [
    { "day": "2026-08-15", "total_screen_hours": 5.2, "category_breakdown": { "social": 1.1 } }
  ]
}
```

or CSV: `day,total_screen_hours`.
