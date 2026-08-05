---
manual_id: FP200-MM-03
title: FP-200 Centrifugal Process Pump — Maintenance & Troubleshooting Manual
model: FP-200
revision: "Rev A, 2023-06"
---

# FP-200 Centrifugal Process Pump — Maintenance & Troubleshooting Manual

## 1. Overview

The FP-200 is a single-stage centrifugal pump used for general process
water transfer. This manual covers troubleshooting, error codes, and
scheduled maintenance.

## 2. Specifications

| Parameter        | Value          |
|--------------------|----------------|
| Motor power        | 7.5 kW (10 hp) |
| Max flow rate       | 200 L/min      |
| Max head            | 45 m           |
| Seal type           | Mechanical, carbon/ceramic |
| Control voltage     | 24 VDC         |

## 3. Safety Warnings

> ⚠ SAFETY WARNING: Isolate and lock out power before removing the coupling
> guard or seal housing. Rotating shafts can cause severe injury.

> ⚠ SAFETY WARNING: Process fluid may be hot or hazardous. Verify the line
> is depressurized and drained before opening the casing.

## 4. Error Code Reference

| Code | Description                     | Severity |
|------|-----------------------------------|----------|
| P10  | Pump fails to prime               | High     |
| P22  | Low flow / no flow detected       | High     |
| P34  | Seal leak detected                | Critical |
| P41  | Motor overload trip               | High     |
| P55  | Vibration threshold exceeded      | Medium   |

## 5. Troubleshooting Procedures

### 5.1 Pump Fails to Prime (P10)

Possible causes:

1. Suction line air leak.
2. Foot valve or strainer clogged.
3. Suction lift exceeds pump's rated capability.
4. Casing not fully vented of air before start.

Diagnostic steps:

1. Inspect all suction-side fittings and the mechanical seal for air
   leaks; a leak here allows air in rather than fluid out.
2. Check and clean the foot valve/strainer at the suction source.
3. Confirm suction lift does not exceed 6 m (nameplate rating).
4. Open the casing vent valve until a steady stream of liquid (no air)
   flows out, then close and restart.

### 5.2 Low Flow / No Flow (P22)

Possible causes:

1. Discharge valve partially closed.
2. Impeller wear or clogging.
3. Wrong direction of rotation (after rewiring/motor swap).
4. Cavitation due to insufficient suction pressure.

Diagnostic steps:

1. Verify discharge valve is fully open.
2. If flow is significantly below rated and valve is open, the impeller
   may be clogged or worn — schedule inspection.
3. Briefly bump-start the motor and confirm rotation matches the
   direction arrow on the casing; reverse two motor leads if incorrect
   (lock out power first).
4. Listen for a rattling/gravel sound at the suction — this indicates
   cavitation; check suction line for restrictions or excessive lift.

### 5.3 Seal Leak Detected (P34)

Possible causes:

1. Worn mechanical seal faces.
2. Seal running dry (no process fluid flow through the seal chamber).
3. Excessive shaft vibration damaging the seal (see P55).

Diagnostic steps:

1. Confirm visually whether the leak is a steady drip (normal seal
   wear, monitor) or a continuous stream (seal failure, stop pump
   immediately).
2. Check that any seal flush line is not blocked.
3. If vibration is also present, address the vibration cause first
   (section 5.5) as it commonly causes premature seal failure.
4. Seal replacement requires the pump to be removed from service,
   locked out, and the casing drained — refer to section 7.1.

### 5.4 Motor Overload Trip (P41)

Possible causes:

1. Pump running against a closed or nearly-closed discharge valve
   (deadheading), which increases motor load on centrifugal pumps at
   low flow.
2. Bearing failure.
3. Voltage imbalance.

Diagnostic steps:

1. Confirm the discharge valve is open enough to allow adequate flow;
   deadheading is the most common cause of overload on this pump family.
2. Manually rotate the shaft (locked out) to check for binding or
   grinding — bearing failure will feel notchy or stiff.
3. Measure incoming voltage across all three phases; imbalance beyond 2%
   indicates an upstream power issue.

### 5.5 Vibration Threshold Exceeded (P55)

Possible causes:

1. Coupling misalignment.
2. Impeller imbalance (debris caught in impeller).
3. Worn bearings.
4. Cavitation.

Diagnostic steps:

1. Check coupling alignment with a dial indicator; realign per section
   7.3 if out of tolerance (>0.05 mm).
2. Inspect impeller for debris or damage after locking out and draining.
3. If alignment and impeller are fine, bearings may be worn — schedule
   replacement.
4. Rule out cavitation per section 5.2, step 4.

## 6. Maintenance Schedule

| Interval    | Task                                |
|--------------|---------------------------------------|
| Weekly        | Visual seal leak check               |
| 1000 hours     | Grease bearings                      |
| 4000 hours     | Inspect coupling alignment           |
| 8000 hours     | Mechanical seal replacement (preventive) |

## 7. Service Procedures

### 7.1 Mechanical Seal Replacement

1. Lock out / tag out, isolate and drain the casing.
2. Remove coupling guard and disconnect coupling.
3. Remove casing bolts and slide out the rotating assembly.
4. Extract the old seal faces; clean the shaft sleeve.
5. Install new seal per manufacturer torque spec (12 Nm on gland bolts).
6. Reassemble in reverse order and verify free shaft rotation by hand
   before restoring power.

### 7.3 Coupling Alignment

1. Lock out power.
2. Mount dial indicator on one coupling half, rotate to check the other.
3. Adjust motor shims until parallel and angular misalignment are both
   within 0.05 mm.
4. Torque motor mounting bolts to spec and re-check alignment.
