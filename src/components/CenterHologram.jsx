import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Ring, Torus } from '@react-three/drei'
import * as THREE from 'three'

export default function CenterHologram({ topic, isActive }) {
  const ringRef1 = useRef()
  const ringRef2 = useRef()
  const ringRef3 = useRef()
  const coreRef = useRef()

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    if (ringRef1.current) {
      ringRef1.current.rotation.x = t * 0.3
      ringRef1.current.rotation.y = t * 0.5
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.x = -t * 0.4
      ringRef2.current.rotation.z = t * 0.2
    }
    if (ringRef3.current) {
      ringRef3.current.rotation.y = t * 0.6
      ringRef3.current.rotation.z = -t * 0.3
    }
    if (coreRef.current) {
      const scale = isActive
        ? 1 + Math.sin(t * 2) * 0.15
        : 0.6 + Math.sin(t * 1) * 0.05
      coreRef.current.scale.setScalar(scale)
    }
  })

  const opacity = isActive ? 0.6 : 0.15
  const color = isActive ? '#00aaff' : '#334466'

  return (
    <group position={[0, 0, 0]}>
      {/* 중앙 코어 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[20, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.5} />
      </mesh>

      {/* 회전 링 1 */}
      <Torus ref={ringRef1} args={[80, 1.5, 8, 64]}>
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </Torus>

      {/* 회전 링 2 */}
      <Torus ref={ringRef2} args={[110, 1, 8, 64]}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.7} />
      </Torus>

      {/* 회전 링 3 */}
      <Torus ref={ringRef3} args={[140, 0.8, 8, 64]}>
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.5} />
      </Torus>

      {/* 토론 주제 텍스트 (활성 상태) */}
      {isActive && topic && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              textAlign: 'center',
              maxWidth: '320px',
              width: '320px',
            }}
          >
            <div
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '9px',
                color: 'rgba(100, 200, 255, 0.6)',
                letterSpacing: '0.2em',
                marginBottom: '6px',
              }}
            >
              DEBATE TOPIC
            </div>
            <div
              style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '13px',
                fontWeight: 600,
                color: '#ffffff',
                textShadow: '0 0 10px rgba(100,200,255,0.8)',
                lineHeight: 1.4,
                wordBreak: 'keep-all',
                overflowWrap: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {topic}
            </div>
          </div>
        </Html>
      )}

      {/* 비활성 상태 - 대기 텍스트 */}
      {!isActive && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '8px',
              color: 'rgba(100, 200, 255, 0.2)',
              letterSpacing: '0.25em',
              textAlign: 'center',
            }}
          >
            COUNCIL
            <br />
            CHAMBER
          </div>
        </Html>
      )}
    </group>
  )
}
