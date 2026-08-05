---
manual_id: XR4000-MM-07
title: XR-4000 Industrial Air Compressor — Maintenance & Troubleshooting Manual
model: XR-4000
revision: "Rev C, 2024-11"
---

# XR-4000 Industrial Air Compressor — Maintenance & Troubleshooting Manual

## 1. Overview

The XR-4000 is a two-stage rotary screw air compressor rated for continuous
industrial duty. This manual covers routine maintenance, error code
diagnosis, and step-by-step troubleshooting procedures.

## 2. Specifications

| Parameter          | Value              |
|---------------------|--------------------|
| Motor power         | 30 kW (40 hp)      |
| Max discharge pressure | 13 bar (188 psi) |
| Operating temp range | 5°C to 46°C       |
| Oil type            | XR-Synth 46        |
| Oil capacity         | 9.5 L              |
| Control voltage     | 24 VDC             |

## 3. Safety Warnings

> ⚠ SAFETY WARNING: Discharge piping and the airend remain hot (up to 95°C)
> during and after operation. Allow a minimum of 20 minutes cooling before
> servicing.

> ⚠ SAFETY WARNING: Always lock out / tag out the main disconnect and bleed
> residual tank pressure to 0 bar before opening any panel or fitting.

> ⚠ SAFETY WARNING: Do not bypass the high-pressure safety relief valve
> under any circumstances. A blocked or bypassed relief valve can cause
> explosive tank rupture.

## 4. Error Code Reference

| Code | Description                          | Severity |
|------|---------------------------------------|----------|
| E12  | Low oil pressure                      | Critical |
| E23  | High discharge air temperature        | Critical |
| E31  | Motor overload trip                   | High     |
| E45  | Compressor fails to start             | High     |
| E52  | Pressure sensor fault (open circuit)  | Medium   |
| E67  | Condensate drain valve fault          | Low      |
| E88  | Scheduled maintenance due             | Info     |

## 5. Troubleshooting Procedures

### 5.1 Compressor Fails to Start (E45)

Possible causes, in order of likelihood:

1. Main disconnect not fully engaged or upstream breaker tripped.
2. Emergency stop button latched.
3. Control voltage fuse (F3, 2A) blown.
4. Motor overload relay tripped (see 5.3).
5. Start capacitor or contactor failure (requires certified electrician).

Diagnostic steps:

1. Confirm the main disconnect is in the ON position and check upstream
   breaker/fuses at the panel.
2. Check that the E-stop button is released (twist to release, indicator
   ring should be unlit).
3. Open the control panel (after lockout/tagout) and inspect fuse F3 with a
   multimeter; replace with an identical 2A fuse if open.
4. If the overload relay (K2) trip indicator is showing, allow the motor to
   cool for 15 minutes, then reset by pressing the amber reset button on K2.
   Do not reset more than twice without investigating cause (see 5.3).
5. If steps 1-4 do not resolve the fault, the start contactor or capacitor
   may have failed. This requires a certified electrician — do not attempt
   internal electrical repair without lockout/tagout and proper training.

### 5.2 Low Oil Pressure (E12)

Possible causes:

1. Oil level below minimum mark on sight glass.
2. Clogged oil filter.
3. Oil pressure sensor miscalibrated or failed.
4. Worn oil pump.

Diagnostic steps:

1. With the unit stopped and depressurized, check the oil sight glass;
   level should be between MIN and MAX marks. Top up with XR-Synth 46 if
   low.
2. Inspect the oil filter service indicator (red = replace). Replace the
   filter per section 7.2 if indicated.
3. If oil level and filter are fine, use the diagnostic menu (MENU > 4 >
   2) to read live oil pressure. Compare to the expected range of 2.5-4.0
   bar at operating temperature. A reading of exactly 0.0 bar with the
   pump confirmed running usually indicates a failed pressure sensor
   rather than an actual mechanical fault.
4. If pressure is genuinely low and filter/level are good, the oil pump
   may be worn. This requires airend service by a certified technician.

### 5.3 Motor Overload Trip (E31)

Possible causes:

1. Voltage imbalance or single-phasing on incoming power.
2. Airend seizure or bearing failure increasing load.
3. Discharge pressure set too high, causing the motor to work harder than
   rated.
4. Overload relay miscalibrated.

Diagnostic steps:

1. Measure incoming three-phase voltage at the disconnect; phases should
   be within 2% of each other. Imbalance beyond 2% indicates an upstream
   power quality issue — contact a licensed electrician.
2. With power off and locked out, attempt to manually rotate the airend
   coupling (a few degrees only). Excessive resistance or grinding
   indicates airend or bearing failure — stop and schedule service.
3. Confirm discharge pressure setpoint in MENU > 2 > 1 does not exceed
   13 bar (nameplate maximum).
4. If none of the above apply, the overload relay may be miscalibrated;
   verify against nameplate full-load amps (FLA = 58A at 400V).

### 5.4 High Discharge Air Temperature (E23)

Possible causes:

1. Blocked or dirty air-cooled aftercooler fins.
2. Cooling fan failure.
3. Low oil level (reduces lubrication cooling).
4. Ambient temperature exceeding 46°C rated maximum.

Diagnostic steps:

1. Inspect and clean aftercooler fins with low-pressure compressed air
   (never a pressure washer) — see section 7.4.
2. Confirm the cooling fan spins freely and runs when the unit is under
   load; a seized or slow fan will not adequately cool the aftercooler.
3. Check oil level per section 5.2, step 1.
4. Verify ambient temperature at the installation site is within the
   rated 5-46°C range; provide additional ventilation if it is not.

## 6. Maintenance Schedule

| Interval        | Task                                  |
|------------------|----------------------------------------|
| Daily            | Check oil sight glass, drain condensate |
| 500 hours         | Replace oil filter, inspect belts     |
| 2000 hours        | Replace oil, replace air filter       |
| 8000 hours        | Full airend inspection                |

## 7. Service Procedures

### 7.2 Oil Filter Replacement

1. Lock out / tag out and bleed tank pressure to 0 bar.
2. Allow 20 minutes cooling per the safety warning in section 3.
3. Place a drain pan under the filter housing.
4. Unscrew the filter counter-clockwise using a strap wrench.
5. Lightly oil the new filter gasket, thread on by hand until seated, then
   turn an additional 3/4 turn.
6. Run the unit briefly and check for leaks at the filter base.

### 7.4 Aftercooler Cleaning

1. Lock out / tag out.
2. Remove the cooler guard (4x M6 bolts).
3. Blow out fins from the airflow-exit side using compressed air at no
   more than 3 bar to avoid bending the fins.
4. Reinstall the guard and verify fan clearance.
