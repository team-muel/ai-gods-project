import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { calcOrbitPosition } from '../config/aiGods'
import { useDiscussionStore } from '../store/discussionStore'

// 발언 중인 신 → 중앙으로 에너지 빔
function EnergyBeam({ god }) {
  const lineRef = useRef()

  useFrame((state) => {
    if (!lineRef.current) return
    const t = state.clock.getElapsedTime()
    const [x, y, z] = calcOrbitPosition(god.orbit, t)

    const points = [
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(0, 0, 0),
    ]
    lineRef.current.geometry.setFromPoints(points)
    lineRef.current.material.opacity = 0.4 + Math.sin(t * 5) * 0.25
  })

  return (
    <line ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial color={god.color} transparent opacity={0.5} />
    </line>
  )
}

export default function ConnectionLines({ gods }) {
  const { activeGodId, isDiscussing } = useDiscussionStore()
  const activeGod = gods.find(g => g.id === activeGodId)

  if (!isDiscussing || !activeGod) return null

  return (
    <group>
      <EnergyBeam god={activeGod} />
    </group>
  )
}
