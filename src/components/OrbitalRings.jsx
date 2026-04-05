import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AI_GODS } from '../config/aiGods'

function createOrbitCurve(radius, inclination) {
  const inc = (inclination * Math.PI) / 180
  const points = []
  for (let i = 0; i <= 128; i++) {
    const angle = (i / 128) * Math.PI * 2
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * Math.sin(inc),
      Math.sin(angle) * radius * Math.cos(inc),
    ))
  }
  return points
}

function OrbitRing({ god, isActive }) {
  const lineRef = useRef()
  const points = createOrbitCurve(god.orbit.radius, god.orbit.inclination)
  const geometry = new THREE.BufferGeometry().setFromPoints(points)

  useFrame((state) => {
    if (!lineRef.current) return
    const t = state.clock.getElapsedTime()
    lineRef.current.material.opacity = isActive
      ? 0.2 + Math.sin(t * 1.2 + god.orbit.startAngle) * 0.05
      : 0.07
  })

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial color={god.color} transparent opacity={0.08} />
    </line>
  )
}

export default function OrbitalRings({ isDebating }) {
  return (
    <group>
      {AI_GODS.map((god) => (
        <OrbitRing key={god.id} god={god} isActive={isDebating} />
      ))}
    </group>
  )
}
