import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertOctagon, BatteryFull, Camera, CheckCircle2, ChevronRight, CircleStop,
  Clock3, Crosshair, Gauge, GitBranch, Home, Map, MapPin, Navigation, Pause,
  Play, RadioTower, RotateCcw, Route, Satellite, ShieldCheck, SlidersHorizontal,
  Thermometer, TowerControl, Wind,
} from 'lucide-react'
import MissionMap from './components/MissionMap'
import { HOME, SURVEY_AREAS, clamp, formatTime, generateSurveyRoute, makeEvent, routeDistance } from './lib/mission'

const DEFAULT = { altitude: 84, speed: 11.8, overlap: 75 }
const STATUS = {
  STANDBY: 'READY FOR ARM', TAKEOFF: 'TAKEOFF', SURVEY: 'AUTONOMOUS SURVEY', RTH: 'RETURN TO HOME',
  LANDING: 'LANDING', HOLD: 'MISSION HOLD', COMPLETE: 'MISSION COMPLETE', MANUAL: 'MANUAL SIMULATION',
  ABORT: 'ABORT / LAND NOW', REPLAY: 'MISSION REPLAY',
}

const phaseColor = (status) => ({ ABORT: 'red', HOLD: 'amber', COMPLETE: 'green', SURVEY: 'cyan', TAKEOFF: 'cyan', RTH: 'cyan', LANDING: 'cyan', MANUAL: 'amber', REPLAY: 'purple' }[status] || 'muted')

function Metric({ icon: Icon, label, value, unit, accent = 'cyan' }) {
  return <div className="metric"><span className={`metric-icon ${accent}`}><Icon size={15} /></span><div><label>{label}</label><strong>{value}<em>{unit}</em></strong></div></div>
}

function Range({ label, value, unit, min, max, step = 1, onChange }) {
  return <div className="range"><div><span>{label}</span><strong>{typeof value === 'number' && step < 1 ? value.toFixed(1) : value}<small>{unit}</small></strong></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>
}

export default function AppPro() {
  const [area, setArea] = useState(SURVEY_AREAS.perimeter)
  const [settings, setSettings] = useState(DEFAULT)
  const [status, setStatus] = useState('STANDBY')
  const [drone, setDrone] = useState({ x: HOME.x, z: HOME.z, y: 0, heading: 0, speed: 0, distance: 0, verticalSpeed: 0 })
  const [telemetry, setTelemetry] = useState({ battery: 98, flight: 0, signal: 99, waypoint: 0, replayFrames: 0, temperature: 28 })
  const [events, setEvents] = useState(() => [
    makeEvent('system', 'Simulation isolated — no vehicle, radio, or flight-controller connection'),
    makeEvent('planner', 'Mission workspace loaded — select a perimeter or define one on the map'),
  ])
  const [routeVersion, setRouteVersion] = useState(0)

  const route = useMemo(() => generateSurveyRoute(area, settings.overlap), [area, settings.overlap, routeVersion])
  const surveyDistance = useMemo(() => routeDistance(route) * 10, [route])
  const transitDistance = useMemo(() => route.length ? (Math.hypot(route[0].x - HOME.x, route[0].z - HOME.z) + Math.hypot(route.at(-1).x - HOME.x, route.at(-1).z - HOME.z)) * 10 : 0, [route])
  const plannedDistance = surveyDistance + transitDistance
  const plannedMinutes = Math.max(1, Math.ceil(plannedDistance / settings.speed / 60))
  const progress = route.length ? Math.round(Math.min(100, telemetry.waypoint / route.length * 100)) : 0

  const droneRef = useRef({ ...drone })
  const statusRef = useRef('STANDBY')
  const settingsRef = useRef(settings)
  const routeRef = useRef(route)
  const pointRef = useRef(0)
  const resumeRef = useRef('STANDBY')
  const keyRef = useRef({})
  const sessionRef = useRef({ battery: 98, flight: 0, temperature: 28, signal: 99, record: [], published: 0, recorded: 0, warned: false, replayCursor: 0 })

  const log = useCallback((type, message) => setEvents((current) => [makeEvent(type, message), ...current].slice(0, 10)), [])
  const transition = useCallback((next, type, message) => {
    statusRef.current = next
    setStatus(next)
    if (message) log(type, message)
  }, [log])

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { routeRef.current = route }, [route])

  useEffect(() => {
    const toggle = (event, active) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Space'].includes(event.code)) {
        event.preventDefault()
        keyRef.current[event.code] = active
      }
    }
    const down = (event) => toggle(event, true)
    const up = (event) => toggle(event, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    const angleTo = (from, to, smoothing) => {
      const delta = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      return from + delta * Math.min(1, smoothing)
    }
    const follow = (d, target, desiredAltitude, dt) => {
      const dx = target.x - d.x
      const dz = target.z - d.z
      const remaining = Math.hypot(dx, dz)
      const step = Math.min(remaining, settingsRef.current.speed / 10 * dt)
      if (remaining > 0.001) {
        d.heading = angleTo(d.heading, Math.atan2(dx, dz), dt * 3)
        d.x += dx / remaining * step
        d.z += dz / remaining * step
        d.distance += step * 10
      }
      const vertical = clamp(desiredAltitude - d.y, -18 * dt, 18 * dt)
      d.y += vertical
      d.verticalSpeed = vertical / dt
      d.speed = step / dt * 10
      return remaining < 0.55
    }
    const timer = window.setInterval(() => {
      const dt = 0.05
      const current = statusRef.current
      const d = droneRef.current
      const session = sessionRef.current
      let active = false

      if (current === 'TAKEOFF') {
        d.y = Math.min(settingsRef.current.altitude, d.y + 18 * dt)
        d.speed = 0
        d.verticalSpeed = 18
        active = true
        if (d.y >= settingsRef.current.altitude - .1) transition('SURVEY', 'mission', 'Cruise altitude established — survey automation engaged')
      } else if (current === 'SURVEY') {
        const target = routeRef.current[pointRef.current]
        active = true
        if (target && follow(d, target, settingsRef.current.altitude, dt)) {
          const reached = pointRef.current
          pointRef.current += 1
          log('waypoint', `${routeRef.current[reached].id} captured — coverage ${Math.round(pointRef.current / routeRef.current.length * 100)}%`)
          if (pointRef.current >= routeRef.current.length) transition('RTH', 'mission', 'Coverage complete — return-to-home navigation initiated')
        }
      } else if (current === 'RTH') {
        active = true
        if (follow(d, HOME, settingsRef.current.altitude, dt)) transition('LANDING', 'mission', 'Home pad acquired — landing sequence started')
      } else if (current === 'LANDING' || current === 'ABORT') {
        active = true
        d.speed = 0
        d.verticalSpeed = current === 'ABORT' ? -22 : -14
        d.y = Math.max(0, d.y + d.verticalSpeed * dt)
        if (d.y <= .01) {
          if (current === 'LANDING') Object.assign(d, { x: HOME.x, z: HOME.z })
          transition('COMPLETE', current === 'ABORT' ? 'alert' : 'mission', current === 'ABORT' ? 'Controlled emergency landing completed — simulator disarmed' : 'Mission closed — virtual aircraft secured at home pad')
        }
      } else if (current === 'MANUAL') {
        const keys = keyRef.current
        const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)
        const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)
        const yaw = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)
        const climb = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0)
        d.heading += yaw * dt * 1.8
        const scale = settingsRef.current.speed / 10 * dt
        const nx = d.x + (Math.sin(d.heading) * forward + Math.cos(d.heading) * strafe) * scale
        const nz = d.z + (Math.cos(d.heading) * forward - Math.sin(d.heading) * strafe) * scale
        if (Math.hypot(nx, nz) < 92) {
          d.distance += Math.hypot(nx - d.x, nz - d.z) * 10
          d.x = nx; d.z = nz
        }
        if (!keys.Space) d.y = clamp(d.y + climb * 15 * dt, 0, 120)
        d.speed = Math.hypot(forward, strafe) * settingsRef.current.speed
        d.verticalSpeed = climb * 15
        active = Boolean(forward || strafe || yaw || climb)
      } else if (current === 'REPLAY') {
        const index = Math.floor(session.replayCursor)
        const frame = session.record[index]
        if (frame) {
          Object.assign(d, frame)
          session.replayCursor += dt * 3.5
          active = true
        } else transition('COMPLETE', 'replay', 'Recorded mission replay completed')
      } else if (current !== 'HOLD') {
        d.speed = 0
        d.verticalSpeed = 0
      }

      if (active && current !== 'REPLAY') {
        session.flight += dt
        session.battery = Math.max(0, session.battery - (0.006 + d.speed * 0.00055) * dt)
        session.temperature = 27 + Math.min(17, d.speed * .45 + d.y * .045)
        if (session.battery < 18 && !session.warned) { session.warned = true; log('alert', 'Battery reserve reached 18% — return-to-home recommended') }
        session.recorded += dt
        if (session.recorded > .34) {
          session.recorded = 0
          session.record.push({ ...d })
          if (session.record.length > 1800) session.record.shift()
        }
      }
      session.published += dt
      if (session.published >= .1) {
        session.published = 0
        session.signal = clamp(99 - Math.hypot(d.x - HOME.x, d.z - HOME.z) * .12, 70, 99)
        setDrone({ ...d })
        setTelemetry({ battery: session.battery, flight: session.flight, signal: session.signal, waypoint: pointRef.current, replayFrames: session.record.length, temperature: session.temperature })
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [log, transition])

  const hasFlight = !['STANDBY', 'COMPLETE'].includes(status)
  const selectArea = (next) => {
    if (['TAKEOFF', 'SURVEY', 'RTH', 'LANDING'].includes(statusRef.current)) return
    setArea(next); pointRef.current = 0
    log('planner', `${next.label} selected — route parameters refreshed`)
  }
  const defineArea = (customArea) => {
    if (['TAKEOFF', 'SURVEY', 'RTH', 'LANDING'].includes(statusRef.current)) return
    setArea(customArea); pointRef.current = 0
    log('planner', 'Operator-defined perimeter accepted — coverage route regenerated')
  }
  const generate = () => {
    if (['TAKEOFF', 'SURVEY', 'RTH', 'LANDING'].includes(statusRef.current)) return
    pointRef.current = 0; setRouteVersion((value) => value + 1)
    log('planner', `Boustrophedon path generated — ${route.length} operational waypoints`)
  }
  const start = () => {
    if (statusRef.current === 'HOLD') { transition(resumeRef.current, 'mission', 'Mission resumed from controlled hold'); return }
    if (!['STANDBY', 'COMPLETE', 'MANUAL'].includes(statusRef.current)) return
    const d = droneRef.current
    Object.assign(d, { x: HOME.x, z: HOME.z, y: 0, heading: 0, speed: 0, distance: 0, verticalSpeed: 0 })
    pointRef.current = 0
    sessionRef.current = { battery: 98, flight: 0, temperature: 28, signal: 99, record: [], published: 0, recorded: 0, warned: false, replayCursor: 0 }
    setDrone({ ...d }); setTelemetry((old) => ({ ...old, battery: 98, flight: 0, waypoint: 0, replayFrames: 0 }))
    transition('TAKEOFF', 'mission', 'Mission armed in simulation — virtual takeoff initiated')
  }
  const hold = () => {
    if (statusRef.current === 'HOLD') { transition(resumeRef.current, 'mission', 'Mission resumed from controlled hold'); return }
    if (['TAKEOFF', 'SURVEY', 'RTH', 'LANDING', 'MANUAL'].includes(statusRef.current)) { resumeRef.current = statusRef.current; transition('HOLD', 'mission', 'Hold command accepted — aircraft maintaining virtual position') }
  }
  const rth = () => { if (!['STANDBY', 'COMPLETE', 'REPLAY'].includes(statusRef.current)) transition('RTH', 'mission', 'Return-to-home accepted — routing to launch pad') }
  const abort = () => { if (!['STANDBY', 'COMPLETE', 'REPLAY'].includes(statusRef.current)) transition('ABORT', 'alert', 'Land-now command received — controlled descent engaged') }
  const manual = () => { if (!['TAKEOFF', 'SURVEY', 'RTH', 'LANDING', 'REPLAY'].includes(statusRef.current)) transition('MANUAL', 'manual', 'Manual simulation enabled — virtual geofence stays active') }
  const replay = () => { if (sessionRef.current.record.length && !hasFlight) { sessionRef.current.replayCursor = 0; transition('REPLAY', 'replay', 'Recorded local trajectory replay started') } }

  return <main className="pro-app">
    <header className="pro-header">
      <div className="pro-brand"><div className="pro-logo"><Navigation size={20} /></div><div><strong>SKYGRID<span>·OPS</span></strong><small>UAV SURVEY &amp; INSPECTION DIGITAL TWIN</small></div></div>
      <div className="pro-header-center"><span><ShieldCheck size={14} /> BROWSER SIMULATION</span><i /><span><RadioTower size={14} /> NO AIRCRAFT LINK</span></div>
      <div className="pro-status"><i className={phaseColor(status)} /><div><small>FLIGHT STATUS</small><strong>{STATUS[status]}</strong></div><Clock3 size={16} /><strong className="pro-time">{formatTime(telemetry.flight)}</strong></div>
    </header>
    <div className="pro-layout">
      <aside className="mission-panel">
        <div className="module-title"><span>MISSION DESIGN</span><strong>Survey Configuration</strong><SlidersHorizontal size={17} /></div>
        <div className="project-chip"><Map size={17} /><div><span>OPERATION</span><strong>Infrastructure Survey</strong><small><i /> DIGITAL MISSION</small></div></div>
        <p className="panel-caption">Choose an operating perimeter or define four corners directly on the map.</p>
        <div className="subhead"><Crosshair size={13} /> SURVEY PERIMETER</div>
        <div className="preset-list">{Object.values(SURVEY_AREAS).map((preset) => <button disabled={['TAKEOFF', 'SURVEY', 'RTH', 'LANDING'].includes(status)} className={area.id === preset.id ? 'selected' : ''} onClick={() => selectArea(preset)} key={preset.id}><span><strong>{preset.label}</strong><small>{preset.subtitle}</small></span><ChevronRight size={15} /></button>)}</div>
        <div className="site-card"><MapPin size={15} /><div><small>OPERATING SECTOR</small><strong>New Delhi · Sector 12A</strong></div><span>RTK READY</span></div>
        <div className="subhead"><Gauge size={13} /> FLIGHT ENVELOPE</div>
        <Range label="CRUISE ALTITUDE" value={settings.altitude} unit="m AGL" min={45} max={120} onChange={(altitude) => setSettings((state) => ({ ...state, altitude }))} />
        <Range label="SURVEY SPEED" value={settings.speed} unit="m/s" min={5} max={18} step={.1} onChange={(speed) => setSettings((state) => ({ ...state, speed }))} />
        <Range label="CAMERA OVERLAP" value={settings.overlap} unit="%" min={60} max={88} onChange={(overlap) => setSettings((state) => ({ ...state, overlap }))} />
        <div className="planner-estimates"><div><small>WAYPOINTS</small><strong>{route.length}</strong></div><div><small>PATH LENGTH</small><strong>{(plannedDistance / 1000).toFixed(2)} <em>km</em></strong></div><div><small>ENDURANCE</small><strong>{plannedMinutes} <em>min</em></strong></div></div>
        <button className="build-route" onClick={generate}><GitBranch size={16} /> REGENERATE COVERAGE PATH</button>
      </aside>

      <section className="map-stage">
        <MissionMap area={area} route={route} drone={drone} currentWaypoint={telemetry.waypoint} status={status} onCustomArea={defineArea} />
        <div className="stage-corner tl"><span>MISSION MAP / LIVE</span><strong>SECTOR 12A</strong></div><div className="stage-corner tr"><Satellite size={15} /><span>GNSS LOCKED</span></div>
        <div className="flight-hud"><div><small>ALTITUDE</small><strong>{Math.round(drone.y)}<em>m</em></strong></div><div><small>GROUND SPEED</small><strong>{drone.speed.toFixed(1)}<em>m/s</em></strong></div><div><small>HEADING</small><strong>{((drone.heading * 180 / Math.PI + 360) % 360).toFixed(0).padStart(3, '0')}<em>°</em></strong></div><div><small>AREA COVERAGE</small><strong>{progress}<em>%</em></strong></div></div>
      </section>

      <aside className="control-panel">
        <div className="module-title"><span>FLIGHT COMPUTER</span><strong>Atlas S3</strong><TowerControl size={17} /></div>
        <div className="aircraft-card-pro"><div className="aircraft-avatar"><Navigation size={26} /></div><div><small>VIRTUAL AIRCRAFT</small><strong>ATLAS-S3 / 01</strong><span><i /> TELEMETRY STREAM NOMINAL</span></div><b>SIM</b></div>
        <div className="metrics"><Metric icon={Gauge} label="ALTITUDE" value={Math.round(drone.y)} unit="m" /><Metric icon={Wind} label="VERTICAL" value={drone.verticalSpeed.toFixed(1)} unit="m/s" accent="blue" /><Metric icon={Navigation} label="HEADING" value={((drone.heading * 180 / Math.PI + 360) % 360).toFixed(0).padStart(3, '0')} unit="°" accent="gold" /><Metric icon={Route} label="DISTANCE" value={(drone.distance / 1000).toFixed(2)} unit="km" accent="rose" /></div>
        <div className="computer-rows"><div><span><BatteryFull size={14} /> BATTERY / ESTIMATE</span><strong>{telemetry.battery.toFixed(0)}%</strong><i><b style={{ width: `${telemetry.battery}%` }} /></i><small>{Math.max(0, Math.round(telemetry.battery * .39))} min simulated reserve</small></div><div><span><RadioTower size={14} /> NAVIGATION LINK</span><strong>{telemetry.signal.toFixed(0)}%</strong><i><b className="blue" style={{ width: `${telemetry.signal}%` }} /></i><small>RTK fixed · 19 satellites · virtual feed</small></div></div>
        <div className="command-title"><span>MISSION COMMANDS</span><small>SIMULATION-ONLY</small></div>
        <button className="arm-button" disabled={['TAKEOFF', 'SURVEY', 'RTH', 'LANDING', 'REPLAY'].includes(status)} onClick={start}><Play size={16} fill="currentColor" /> {status === 'HOLD' ? 'RESUME AUTOMATION' : 'ARM & START SURVEY'}</button>
        <div className="command-grid-pro"><button disabled={!hasFlight || status === 'REPLAY'} onClick={hold}><Pause size={14} /> {status === 'HOLD' ? 'RESUME' : 'HOLD'}</button><button disabled={!hasFlight || status === 'REPLAY'} onClick={rth}><Home size={14} /> RETURN HOME</button><button disabled={['TAKEOFF', 'SURVEY', 'RTH', 'LANDING', 'REPLAY'].includes(status)} onClick={manual}><Navigation size={14} /> MANUAL</button><button disabled={!telemetry.replayFrames || hasFlight} onClick={replay}><RotateCcw size={14} /> REPLAY</button></div>
        <button className="abort-button" disabled={!hasFlight || status === 'REPLAY'} onClick={abort}><AlertOctagon size={15} /> LAND NOW — SIMULATED</button>
        <div className="key-help"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> translate</span><span><kbd>Q</kbd><kbd>E</kbd> heading</span><span><kbd>R</kbd><kbd>F</kbd> altitude</span></div>
      </aside>
    </div>
    <div className="pro-bottom"><section className="operations-log"><div className="bottom-title"><div><span>OPERATION TIMELINE</span><strong>Mission activity</strong></div><span className="stream"><i /> LIVE LOG</span></div><div className="event-stream">{events.map((event) => <article className={event.type} key={event.id}><span>{event.type === 'alert' ? <AlertOctagon size={13} /> : event.type === 'waypoint' ? <Camera size={13} /> : event.type === 'mission' ? <CheckCircle2 size={13} /> : <Activity size={13} />}</span><p>{event.message}<small>{event.timestamp}</small></p></article>)}</div></section><section className="payload-panel"><div className="bottom-title"><div><span>PAYLOAD &amp; NAVIGATION</span><strong>Data acquisition</strong></div><Camera size={16} /></div><div className="payload-stats"><div><small>CAMERA</small><strong><i /> SURVEY READY</strong></div><div><small>THERMAL</small><strong>{telemetry.temperature.toFixed(0)}°C</strong></div><div><small>GEOFENCE</small><strong><i /> 920 m</strong></div><div><small>REPLAY BUFFER</small><strong>{telemetry.replayFrames} frames</strong></div></div></section></div>
    <footer>SKYGRID OPS DIGITAL TWIN · LOCAL BROWSER SIMULATION · NO REAL FLIGHT, HARDWARE, RADIO, VIDEO, OR AUTOPILOT CONNECTION</footer>
  </main>
}
