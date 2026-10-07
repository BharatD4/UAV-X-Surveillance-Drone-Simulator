export const HOME = { x: -52, z: -42 }

export const SURVEY_AREAS = {
  perimeter: {
    id: 'perimeter',
    label: 'Industrial perimeter',
    subtitle: 'Secure-yard inspection',
    center: { x: 12, z: 3 },
    width: 75,
    depth: 58,
    rotation: -0.08,
  },
  river: {
    id: 'river',
    label: 'River corridor',
    subtitle: 'Waterfront observation',
    center: { x: 22, z: -8 },
    width: 68,
    depth: 44,
    rotation: 0.13,
  },
  campus: {
    id: 'campus',
    label: 'Campus sweep',
    subtitle: 'Facilities survey',
    center: { x: -1, z: 14 },
    width: 62,
    depth: 53,
    rotation: 0,
  },
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const distance2D = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)

export const formatTime = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export const pointInRotatedArea = (point, area) => {
  const cos = Math.cos(-area.rotation)
  const sin = Math.sin(-area.rotation)
  const dx = point.x - area.center.x
  const dz = point.z - area.center.z
  const x = dx * cos - dz * sin
  const z = dx * sin + dz * cos
  return Math.abs(x) <= area.width / 2 && Math.abs(z) <= area.depth / 2
}

const rotatePoint = (point, area) => {
  const cos = Math.cos(area.rotation)
  const sin = Math.sin(area.rotation)
  return {
    x: area.center.x + point.x * cos - point.z * sin,
    z: area.center.z + point.x * sin + point.z * cos,
  }
}

/** Build a boustrophedon (lawnmower) flight route inside the selected simulated area. */
export const generateSurveyRoute = (area, overlap) => {
  const laneSpacing = clamp(13 - overlap * 0.09, 4.8, 10.5)
  const inset = 4
  const halfDepth = Math.max(3, area.depth / 2 - inset)
  const halfWidth = Math.max(4, area.width / 2 - inset)
  const laneCount = Math.max(3, Math.floor((halfDepth * 2) / laneSpacing) + 1)
  const route = []

  for (let lane = 0; lane < laneCount; lane += 1) {
    const z = -halfDepth + (lane / (laneCount - 1)) * halfDepth * 2
    const isForward = lane % 2 === 0
    route.push(rotatePoint({ x: isForward ? -halfWidth : halfWidth, z }, area))
    route.push(rotatePoint({ x: isForward ? halfWidth : -halfWidth, z }, area))
  }

  return route.map((point, index) => ({ ...point, id: `WP-${String(index + 1).padStart(2, '0')}` }))
}

export const routeDistance = (route) => route.reduce((total, point, index) => (
  index === 0 ? total : total + distance2D(route[index - 1], point)
), 0)

export const makeEvent = (type, message) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type,
  message,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
})
