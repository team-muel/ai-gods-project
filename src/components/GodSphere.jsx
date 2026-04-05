import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Ring } from '@react-three/drei'
import * as THREE from 'three'
import { calcOrbitPosition } from '../config/aiGods'
import { useDiscussionStore } from '../store/discussionStore'

export default function GodSphere({ god, isSelected, onClick }) {
  const groupRef = useRef()
  const meshRef = useRef()
  const glowRef = useRef()
  const [hovered, setHovered] = useState(false)

  const { activeGodId, isDiscussing } = useDiscussionStore()
  const isSpeaking = activeGodId === god.id

  const baseColor = new THREE.Color(god.color)
  const emissiveColor = new THREE.Color(god.emissiveColor)

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    // 궤도 위치 계산
    if (groupRef.current) {
      const [x, y, z] = calcOrbitPosition(god.orbit, t)
      groupRef.current.position.set(x, y, z)
    }

    // 자전
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.004
      meshRef.current.rotation.x = Math.sin(t * 0.4 + god.orbit.startAngle) * 0.05

      // 크기 변화
      const targetScale = isSpeaking ? 1.25 : isSelected ? 1.12 : hovered ? 1.06 : 1.0
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      )

      // 발광 강도
      if (meshRef.current.material) {
        const pulse = isSpeaking
          ? 0.7 + Math.sin(t * 4) * 0.3
          : isSelected
          ? 0.4 + Math.sin(t * 2) * 0.15
          : 0.15 + Math.sin(t * 1.2 + god.orbit.startAngle) * 0.08
        meshRef.current.material.emissiveIntensity = pulse
      }
    }

    // 외부 글로우
    if (glowRef.current) {
      glowRef.current.material.opacity = isSpeaking
        ? 0.12 + Math.sin(t * 3) * 0.06
        : hovered || isSelected
        ? 0.07
        : 0.03
    }
  })

  // 구체 크기 - 궤도 거리에 따라 다르게
  const sphereRadius = god.orbit.radius < 250 ? 36 : god.orbit.radius < 400 ? 44 : 52

  return (
    <group ref={groupRef}>
      {/* 메인 구체 */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[sphereRadius, 48, 48]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={0.2}
          roughness={0.15}
          metalness={0.4}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* 내부 코어 */}
      <mesh>
        <sphereGeometry args={[sphereRadius * 0.55, 24, 24]} />
        <meshBasicMaterial color={emissiveColor} transparent opacity={0.12} />
      </mesh>

      {/* 외부 글로우 */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[sphereRadius * 1.35, 24, 24]} />
        <meshBasicMaterial color={baseColor} transparent opacity={0.04} side={THREE.BackSide} />
      </mesh>

      {/* 발언 중 링 */}
      {isSpeaking && (
        <Ring args={[sphereRadius * 1.5, sphereRadius * 1.6, 64]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color={god.color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </Ring>
      )}

      {/* 선택 링 */}
      {isSelected && !isSpeaking && (
        <Ring args={[sphereRadius * 1.4, sphereRadius * 1.48, 64]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color={god.color} transparent opacity={0.35} side={THREE.DoubleSide} />
        </Ring>
      )}

      {/* 이름 라벨 */}
      {(hovered || isSelected || isSpeaking) && (
        <Html position={[0, sphereRadius + 28, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(3, 3, 16, 0.92)',
            border: `1px solid ${god.color}88`,
            borderRadius: '4px',
            padding: '5px 12px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 14px ${god.color}33`,
          }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '11px', fontWeight: 700, color: god.color, letterSpacing: '0.12em' }}>
              {god.symbol} {god.name}
            </div>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '1px' }}>
              {isSpeaking ? '⚡ 발언 중...' : `${god.role} · ${god.title}`}
            </div>
          </div>
        </Html>
      )}

      {/* 항상 표시 - 역할 텍스트 */}
      <Html position={[0, -(sphereRadius + 16), 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'Orbitron, sans-serif', fontSize: '9px',
          color: god.color,
          opacity: hovered || isSelected || isSpeaking ? 0.9 : 0.4,
          letterSpacing: '0.1em',
          transition: 'opacity 0.3s',
          textShadow: `0 0 6px ${god.color}`,
        }}>
          {god.role}
        </div>
      </Html>
    </group>
  )
}
