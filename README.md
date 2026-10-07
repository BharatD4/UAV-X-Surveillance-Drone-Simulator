# SKYGRID OPS — UAV Survey & Inspection Digital Twin

SKYGRID OPS is a browser-based mission-operations simulator for aerial-survey planning. It was built as a serious portfolio concept rather than a game-like 3D scene: the central workspace is a geographic operations map with an operator-defined boundary, coverage lanes, route progress, a moving aircraft marker, payload state, and structured flight telemetry.

> **Simulation boundary:** This is a local browser simulation. It does not communicate with an aircraft, remote controller, camera, autopilot, GPS receiver, radio, or any flight-control software. It must not be used to operate a real UAV.

## What is included

- Geographic mission-map context, using OpenStreetMap tiles with visible attribution
- Three sample survey perimeters plus a **Define Area** workflow: click four map corners to create a custom perimeter
- Automatic boustrophedon/lawnmower coverage-route generation
- Live virtual aircraft movement, route completion, waypoint capture events, and a home-pad return route
- Mission state machine: arm/takeoff, autonomous survey, hold/resume, return-to-home, landing, land-now, manual simulation, and replay
- Mission parameters for altitude, speed, and camera overlap
- Simulated flight telemetry: altitude, speed, heading, distance, virtual battery, link quality, motor temperature, and estimated duration
- Professional operations-console UI, mission timeline, payload/nav status, and local replay buffer
- Keyboard-based manual simulation controls protected by a virtual geofence

## Run locally

Install Node.js 18 or later, extract the project, and run:

```bash
npm install
npm run dev
```

Open the localhost address shown in the terminal (normally `http://localhost:5173`).

To create a deployable production build:

```bash
npm run build
```

The generated site is placed in `dist/`.

## Use the simulator

1. Select one of the survey perimeters, or select **Define Area** in the map and click four boundary corners.
2. Choose cruise altitude, survey speed, and camera overlap.
3. Select **Regenerate Coverage Path** to rebuild the lawnmower route.
4. Select **Arm & Start Survey**. The simulated aircraft takes off, captures every generated waypoint, returns home, and lands.
5. Use **Hold**, **Return Home**, or **Land Now — Simulated** during a virtual mission.
6. Once the virtual mission is complete, select **Replay** to inspect the locally recorded route again.

### Manual simulation controls

Select **Manual** only when the autonomous state is not operating.

| Input | Simulated function |
| --- | --- |
| `W` / `S` | Move forward / backward |
| `A` / `D` | Move left / right |
| `Q` / `E` | Rotate heading |
| `R` / `F` | Increase / decrease altitude |
| `Space` | Hold vertical movement |

The virtual geofence remains active in manual simulation mode.

## Project structure

```text
src/
  AppPro.jsx                     # flight simulation engine and operations-console UI
  components/MissionMap.jsx      # map tiles, mission overlays, drawing workflow, aircraft marker
  lib/mission.js                 # mission geometry and boustrophedon route generation
  pro.css                         # operations-console visual system
```

## Deployment

This is a static Vite application. It can be deployed to Vercel, Netlify, GitHub Pages, or another static host.

- Build command: `npm run build`
- Output directory: `dist`

No environment variables or backend are required. Map tiles load from OpenStreetMap when the browser has internet access; the simulated mission overlays, flight logic, and interface still load if map imagery is unavailable.

## Important note

All operational numbers, imagery context, sensor statuses, and events are simulated UI data. They are deliberately not intended as real aviation, navigation, battery-performance, or remote-pilot guidance.
