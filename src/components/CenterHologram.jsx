import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Torus } from '@react-three/drei'

const MODE_LABELS = {
  home: 'COUNCIL CHAMBER',
  docs: 'DOCUMENT STUDIO',
  ppt: 'DECK STUDIO',
  debate: 'DEBATE LAB',
}

const MODE_COLORS = {
  home: '#334466',
  docs: '#22d3ee',
  ppt: '#60a5fa',
  debate: '#f59e0b',
}

export default function CenterHologram({ topic, isActive, mode = 'home', subtitle = '', outline = [] }) {
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

  const normalizedMode = MODE_LABELS[mode] ? mode : 'home'
  const opacity = isActive ? 0.6 : 0.15
  const color = isActive ? MODE_COLORS[normalizedMode] || '#00aaff' : '#334466'
  const titleLabel = normalizedMode === 'debate' ? 'DEBATE TOPIC' : MODE_LABELS[normalizedMode]
  const visibleOutline = Array.isArray(outline) ? outline.slice(0, 3) : []

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

      {isActive && (topic || subtitle || visibleOutline.length > 0) && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              textAlign: 'center',
              maxWidth: '360px',
              width: '360px',
            }}
          >
            <div
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '9px',
                color: 'rgba(191, 248, 255, 0.75)',
                letterSpacing: '0.2em',
                marginBottom: '6px',
              }}
            >
              {titleLabel}
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
              {topic || MODE_LABELS[normalizedMode]}
            </div>
            {subtitle && (
              <div
                style={{
                  marginTop: '8px',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '11px',
                  color: 'rgba(226, 232, 240, 0.72)',
                  lineHeight: 1.35,
                }}
              >
                {subtitle}
              </div>
            )}
            {visibleOutline.length > 0 && normalizedMode !== 'debate' && (
              <div
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  alignItems: 'center',
                }}
              >
                {visibleOutline.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    style={{
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: '8px',
                      color: 'rgba(191, 248, 255, 0.66)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {`${index + 1}. ${item}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Html>
      )}

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
