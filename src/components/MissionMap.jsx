import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, MapPin, MousePointer2, Navigation, ScanLine } from 'lucide-react'

const CENTER = { lat: 28.6139, lng: 77.2090 }
const ZOOM = 15
const TILE_SIZE = 256
const EARTH_METERS_PER_DEGREE = 111320

const lngToTile = (lng) => ((lng + 180) / 360) * (2 ** ZOOM)
const latToTile = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * (2 ** ZOOM)
const tileToLng = (tileX) => tileX / (2 ** ZOOM) * 360 - 180
const tileToLat = (tileY) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / (2 ** ZOOM)))) * 180) / Math.PI
const centerTile = { x: lngToTile(CENTER.lng), y: latToTile(CENTER.lat) }
const metersPerLng = EARTH_METERS_PER_DEGREE * Math.cos((CENTER.lat * Math.PI) / 180)

function worldToGeo(point) {
  return {
    lng: CENTER.lng + (point.x * 10) / metersPerLng,
    lat: CENTER.lat - (point.z * 10) / EARTH_METERS_PER_DEGREE,
  }
}

function geoToWorld(point) {
  return {
    x: ((point.lng - CENTER.lng) * metersPerLng) / 10,
    z: ((CENTER.lat - point.lat) * EARTH_METERS_PER_DEGREE) / 10,
  }
}

function cornersFor(area) {
  const corners = [
    { x: -area.width / 2, z: -area.depth / 2 },
    { x: area.width / 2, z: -area.depth / 2 },
    { x: area.width / 2, z: area.depth / 2 },
    { x: -area.width / 2, z: area.depth / 2 },
  ]
  return corners.map((point) => ({
    x: area.center.x + point.x * Math.cos(area.rotation) - point.z * Math.sin(area.rotation),
    z: area.center.z + point.x * Math.sin(area.rotation) + point.z * Math.cos(area.rotation),
  }))
}

function polyline(points, project, close = false) {
  if (!points.length) return ''
  const commands = points.map((point, index) => {
    const projected = project(point)
    return `${index ? 'L' : 'M'} ${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`
  })
  if (close) commands.push('Z')
  return commands.join(' ')
}

export default function MissionMap({ area, route, drone, currentWaypoint, status, onCustomArea }) {
  const containerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 900, height: 650 })
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState([])
  const [mapError, setMapError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const projectGeo = (geo) => ({
    x: dimensions.width / 2 + (lngToTile(geo.lng) - centerTile.x) * TILE_SIZE,
    y: dimensions.height / 2 + (latToTile(geo.lat) - centerTile.y) * TILE_SIZE,
  })
  const project = (point) => projectGeo(worldToGeo(point))
  const unproject = (x, y) => ({
    lng: tileToLng(centerTile.x + (x - dimensions.width / 2) / TILE_SIZE),
    lat: tileToLat(centerTile.y + (y - dimensions.height / 2) / TILE_SIZE),
  })

  const tiles = useMemo(() => {
    const originX = Math.floor(centerTile.x) - 3
    const originY = Math.floor(centerTile.y) - 3
    return Array.from({ length: 36 }, (_, index) => {
      const col = index % 6
      const row = Math.floor(index / 6)
      const tileX = originX + col
      const tileY = originY + row
      return { x: tileX, y: tileY, id: `${tileX}-${tileY}` }
    })
  }, [])

  const boundary = useMemo(() => cornersFor(area), [area])
  const dronePosition = project(drone)
  const homePosition = project({ x: -52, z: -42 })
  const draftWorld = draft.map(geoToWorld)
  const visibleRoute = route.slice(0, Math.max(1, currentWaypoint + 1))

  const handleMapClick = (event) => {
    if (!drawing) return
    const rect = containerRef.current.getBoundingClientRect()
    const point = unproject(event.clientX - rect.left, event.clientY - rect.top)
    const next = [...draft, point]
    if (next.length === 4) {
      const world = next.map(geoToWorld)
      const xs = world.map((item) => item.x)
      const zs = world.map((item) => item.z)
      onCustomArea({
        id: 'custom',
        label: 'Operator-defined perimeter',
        subtitle: 'Map-selected survey area',
        center: { x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2 },
        width: Math.max(28, Math.max(...xs) - Math.min(...xs)),
        depth: Math.max(28, Math.max(...zs) - Math.min(...zs)),
        rotation: 0,
      })
      setDraft([])
      setDrawing(false)
      return
    }
    setDraft(next)
  }

  return (
    <div className={`mission-map ${drawing ? 'drawing' : ''}`} ref={containerRef} onClick={handleMapClick}>
      <div className="tile-layer" aria-hidden="true">
        {tiles.map((tile) => {
          const position = projectGeo({ lng: tileToLng(tile.x), lat: tileToLat(tile.y) })
          return <img key={tile.id} onError={() => setMapError(true)} src={`https://tile.openstreetmap.org/${ZOOM}/${tile.x}/${tile.y}.png`} alt="" style={{ left: position.x, top: position.y, width: TILE_SIZE, height: TILE_SIZE }} />
        })}
      </div>
      {mapError && <div className="map-offline">Map tiles unavailable — operational overlay remains active</div>}
      <div className="map-wash" />
      <svg className="mission-overlay" width={dimensions.width} height={dimensions.height} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
        <path d={polyline(boundary, project, true)} className="boundary-fill" />
        <path d={polyline(boundary, project, true)} className="boundary-line" />
        <path d={polyline(route, project)} className="planned-route" />
        {visibleRoute.length > 1 && <path d={polyline(visibleRoute, project)} className="flown-route" />}
        {route.map((point, index) => {
          const position = project(point)
          return <g key={point.id} className={index < currentWaypoint ? 'waypoint complete' : index === currentWaypoint ? 'waypoint active' : 'waypoint'} transform={`translate(${position.x} ${position.y})`}>
            <circle r={index === currentWaypoint ? 6.4 : 4.2} />
            {(index === 0 || index === route.length - 1 || index === currentWaypoint) && <text x="8" y="-7">{point.id}</text>}
          </g>
        })}
        {draftWorld.length > 0 && <path d={polyline(draftWorld, project, draftWorld.length > 2)} className="draft-route" />}
        {draftWorld.map((point, index) => {
          const position = project(point)
          return <circle key={index} className="draft-point" cx={position.x} cy={position.y} r="5" />
        })}
      </svg>
      <div className="home-marker" style={{ left: homePosition.x, top: homePosition.y }}><span><Navigation size={13} /></span><label>HOME PAD</label></div>
      <div className={`drone-marker ${status.toLowerCase()}`} style={{ left: dronePosition.x, top: dronePosition.y, transform: `translate(-50%, -50%) rotate(${drone.heading * 180 / Math.PI}deg)` }}>
        <div className="drone-rings"><i /><i /></div><div className="drone-symbol"><Navigation size={19} fill="currentColor" /></div>
      </div>
      <div className="map-head"><div><span>LIVE OPERATIONS MAP</span><strong>NEW DELHI / SECTOR 12A</strong></div><div className="coord"><MapPin size={13} /> 28.6139° N&nbsp;&nbsp;77.2090° E</div></div>
      <button className={`draw-area ${drawing ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); setDrawing((active) => !active); setDraft([]) }}><MousePointer2 size={14} /> {drawing ? `CLICK MAP: ${4 - draft.length} POINTS` : 'DEFINE AREA'}</button>
      <div className="map-legend"><span><i className="legend-flight" /> FLIGHT PATH</span><span><i className="legend-boundary" /> MISSION BOUNDARY</span><span><i className="legend-aircraft" /> AIRCRAFT</span></div>
      <div className="map-scale"><ScanLine size={13} /> <span>500 m</span><i /></div>
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  )
}
