import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import GodSphere from './components/GodSphere'
import ConnectionLines from './components/ConnectionLines'
import OrbitalRings from './components/OrbitalRings'
import CenterHologram from './components/CenterHologram'
import QuestionPanel from './components/UI/QuestionPanel'
import RightPanel from './components/ui/RightPanel'
import BottomBar from './components/ui/BottomBar'
import { AI_GODS } from './config/aiGods'
import { useDiscussionStore } from './store/discussionStore'
import { useDebateStats } from './hooks/useDebateStats'

export default function App() {
  const [selectedGod, setSelectedGod] = useState(null)
  const { isDiscussing, topic, messages, activeGodId } = useDiscussionStore()
  const { refresh: refreshStats } = useDebateStats()

  const handleGodClick = (god) => {
    setSelectedGod(selectedGod?.id === god.id ? null : god)
  }

  return (
    <div className="relative w-full h-full bg-black">
      {/* 3D 캔버스 - 우주 공간 */}
      <Canvas
        camera={{ position: [0, 300, 1200], fov: 60, near: 1, far: 8000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'radial-gradient(ellipse at center, #0a0a2e 0%, #000000 70%)' }}
      >
        {/* 조명 */}
        <ambientLight intensity={0.1} />
        <pointLight position={[0, 0, 0]} intensity={0.5} color="#4488ff" />

        {/* 우주 별 배경 */}
        <Stars
          radius={2000}
          depth={500}
          count={6000}
          factor={4}
          saturation={0.5}
          fade
          speed={0.3}
        />

        {/* 8개 AI 신 구체 */}
        {AI_GODS.map((god) => (
          <GodSphere
            key={god.id}
            god={god}
            isSelected={selectedGod?.id === god.id}
            onClick={() => handleGodClick(god)}
          />
        ))}

        {/* 궤도 링 */}
        <OrbitalRings isDebating={isDiscussing} />

        {/* 발언 중 에너지 빔 */}
        <ConnectionLines gods={AI_GODS} />

        {/* 중앙 홀로그램 */}
        <CenterHologram topic={topic} isActive={isDiscussing} />

        {/* 카메라 컨트롤 */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={300}
          maxDistance={2500}
          autoRotate={!isDiscussing}
          autoRotateSpeed={0.3}
          dampingFactor={0.05}
          enableDamping
        />

        {/* 포스트 프로세싱 - 블룸 효과 */}
        <EffectComposer>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            height={300}
          />
        </EffectComposer>
      </Canvas>

      {/* 2D UI 오버레이 */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 상단 타이틀 */}
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-6 pointer-events-none">
          <div className="text-center">
            <h1 className="font-orbitron text-2xl font-black tracking-widest text-white text-glow"
                style={{ textShadow: '0 0 20px rgba(100,200,255,0.8), 0 0 40px rgba(100,200,255,0.4)' }}>
              AI GODS
            </h1>
            <p className="font-rajdhani text-xs tracking-[0.3em] text-blue-300 opacity-70 mt-1">
              8 DIVINE MINDS · COSMIC COUNCIL
            </p>
          </div>
        </div>

        {/* 좌측 패널 - 질문 입력 (QuestionPanel은 absolute 포지션 자체 포함) */}
        <div className="pointer-events-auto">
          <QuestionPanel />
        </div>

        {/* 우측 패널 - 실시간 로그 */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto">
          <RightPanel selectedGod={selectedGod} />
        </div>

        {/* 하단 통계 바 */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <BottomBar isDebating={isDiscussing} messageCount={messages.length} onDebateComplete={refreshStats} />
        </div>
      </div>
    </div>
  )
}
