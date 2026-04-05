import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, MeshDistortMaterial } from '@react-three/drei';
import { useDiscussionStore } from '../../store/discussionStore';

function AIGod({ god, onClick }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Store에서 상태 가져오기
  const { activeGodId, isDiscussing } = useDiscussionStore();
  const isActive = activeGodId === god.id;
  const isSpeaking = isDiscussing && isActive;

  // 부드러운 회전 애니메이션
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
      meshRef.current.rotation.y += 0.003;

      // 호버, 발언 중, 활성화 시 크기 변화
      const targetScale = (hovered || isActive || isSpeaking) ? 1.2 : 1;
      meshRef.current.scale.x += (targetScale - meshRef.current.scale.x) * 0.1;
      meshRef.current.scale.y += (targetScale - meshRef.current.scale.y) * 0.1;
      meshRef.current.scale.z += (targetScale - meshRef.current.scale.z) * 0.1;
    }
  });

  return (
    <group position={god.position}>
      {/* 메인 구체 */}
      <mesh
        ref={meshRef}
        onClick={() => onClick(god)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.8, 32, 32]} />
        <MeshDistortMaterial
          color={god.color}
          attach="material"
          distort={0.3}
          speed={isSpeaking ? 4 : 2}
          roughness={0.2}
          metalness={0.8}
          emissive={god.color}
          emissiveIntensity={isSpeaking ? 1.0 : (hovered || isActive ? 0.8 : 0.3)}
        />
      </mesh>

      {/* 외곽 링 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.02, 16, 100]} />
        <meshBasicMaterial
          color={god.color}
          transparent
          opacity={isSpeaking ? 0.6 : 0.3}
        />
      </mesh>

      {/* 이름 라벨 */}
      {(hovered || isActive || isSpeaking) && (
        <>
          <Text
            position={[0, 1.5, 0]}
            fontSize={0.3}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            {god.symbol} {god.name}
          </Text>
          <Text
            position={[0, 1.1, 0]}
            fontSize={0.15}
            color={isSpeaking ? '#00f2fe' : '#aaaaaa'}
            anchorX="center"
            anchorY="middle"
          >
            {isSpeaking ? '발언 중...' : god.role}
          </Text>
        </>
      )}

      {/* 파티클 효과 - 발언 중일 때만 */}
      {isSpeaking && <Particles count={100} color={god.color} />}
    </group>
  );
}

function Particles({ count, color }) {
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI;
      const r = 1.5 + Math.random() * 0.5;
      temp.push({
        position: [
          r * Math.sin(p) * Math.cos(t),
          r * Math.sin(p) * Math.sin(t),
          r * Math.cos(p)
        ]
      });
    }
    return temp;
  }, [count]);

  return (
    <group>
      {particles.map((particle, i) => (
        <mesh key={i} position={particle.position}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export default AIGod;
