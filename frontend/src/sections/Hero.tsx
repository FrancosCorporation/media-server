// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutGrid, ChevronDown } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

// ─── 3D Components ───────────────────────────────────────────────────────────

function AnimatedSphere({ position, color, speed = 1, distort = 0.4 }: { position: [number, number, number]; color: string; speed?: number; distort?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.getElapsedTime() * 0.1 * speed;
      mesh.current.rotation.y = state.clock.getElapsedTime() * 0.15 * speed;
    }
  });

  return (
    <Float speed={2 * speed} rotationIntensity={0.5} floatIntensity={1}>
      <Sphere ref={mesh} args={[1, 64, 64]} position={position} scale={0.8}>
        <MeshDistortMaterial
          color={color}
          attach="material"
          distort={distort}
          speed={3}
          roughness={0.2}
          metalness={0.8}
          emissive={color}
          emissiveIntensity={0.15}
        />
      </Sphere>
    </Float>
  );
}

function ParticleField({ count = 200 }) {
  const points = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.getElapsedTime() * 0.02;
      points.current.rotation.x = state.clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#8b5cf6"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#8b5cf6" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#06b6d4" />
      <pointLight position={[0, 5, 5]} intensity={0.8} color="#ffffff" />
      
      <AnimatedSphere position={[-3, 1, -2]} color="#8b5cf6" speed={0.8} distort={0.3} />
      <AnimatedSphere position={[3, -1, -3]} color="#06b6d4" speed={1.2} distort={0.4} />
      <AnimatedSphere position={[0, 2, -4]} color="#a855f7" speed={0.6} distort={0.5} />
      
      <ParticleField count={150} />
      
      <Environment preset="city" />
    </>
  );
}

// ─── Hero Component ──────────────────────────────────────────────────────────

const Hero = () => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaded(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const metrics = [
    { label: 'Uptime', value: '99,98%' },
    { label: 'Respostas/seg', value: '1.8k' },
    { label: 'Conexões Ativas', value: '420' },
  ];

  const partners = ['Apex', 'Synapse', 'NovaCore', 'Helix', 'Pulse', 'Zenith'];

  return (
    <section
      id="hero"
      className="relative min-h-screen w-full overflow-hidden bg-[#08090a]"
      aria-labelledby="hero-title"
    >
      {/* ===== 3D CANVAS ===== */}
      <div className="absolute inset-0 z-0">
        <Canvas gl={{ antialias: true, alpha: true }}>
          <Scene />
        </Canvas>
      </div>

      {/* ===== GRADIENT OVERLAYS ===== */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[128px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#08090a]/50 to-[#08090a]" />
      </div>

      {/* ===== GRID PATTERN ===== */}
      <div 
        className="absolute inset-0 z-1 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      />

      {/* ===== CONTENT ===== */}
      <div className="relative z-20 min-h-screen flex flex-col justify-center px-6 md:px-10 lg:px-16 pt-24 pb-12">
        <div className="max-w-[1400px] mx-auto w-full">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12 lg:gap-16 items-center">
            
            {/* LEFT: Copy */}
            <div className="space-y-8 text-center lg:text-left">
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium uppercase tracking-widest border border-violet-500/30 text-violet-300 bg-violet-500/10 backdrop-blur-sm"
                style={{ opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}
              >
                <LayoutGrid size={14} />
                Plataforma de IA Avançada
              </div>

              <h1
                id="hero-title"
                className="font-[Manrope] text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-white leading-[1.05]"
                style={{ 
                  opacity: loaded ? 1 : 0, 
                  transform: loaded ? 'translateY(0)' : 'translateY(30px)', 
                  transition: 'all 0.8s ease 0.1s' 
                }}
              >
                Inteligência artificial que{' '}
                <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  eleva sua operação
                </span>
                {' '}em tempo real.
              </h1>

              <p 
                className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-[300]"
                style={{ 
                  opacity: loaded ? 1 : 0, 
                  transform: loaded ? 'translateY(0)' : 'translateY(30px)', 
                  transition: 'all 0.8s ease 0.2s' 
                }}
              >
                Automatize fluxos, gere mídia e transforme insights em ações com um ecossistema de IA de alta performance construído para empresas modernas.
              </p>

              <div 
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
                style={{ 
                  opacity: loaded ? 1 : 0, 
                  transform: loaded ? 'translateY(0)' : 'translateY(30px)', 
                  transition: 'all 0.8s ease 0.3s' 
                }}
              >
                <button
                  onClick={() => navigate('/register')}
                  className="group inline-flex items-center justify-center gap-2 bg-white text-black font-semibold px-8 py-4 rounded-full transition-all duration-300 hover:bg-gray-100 hover:scale-105 active:scale-95"
                >
                  Criar conta gratuita
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center justify-center gap-2 rounded-full font-semibold px-8 py-4 text-white border border-white/20 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/40 transition-all duration-300"
                >
                  Fazer login
                </button>
              </div>

              {/* Trust indicators */}
              <div 
                className="pt-4"
                style={{ 
                  opacity: loaded ? 1 : 0, 
                  transition: 'all 0.8s ease 0.4s' 
                }}
              >
                <p className="uppercase tracking-[0.3em] text-gray-500 text-xs mb-4">Empresas que confiam</p>
                <div className="flex flex-wrap justify-center lg:justify-start gap-3">
                  {partners.map((name, i) => (
                    <div
                      key={name}
                      className="px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-medium text-gray-400 hover:text-white hover:border-violet-500/50 transition-all duration-300"
                      style={{ transitionDelay: `${i * 50}ms` }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: 3D Visual */}
            <div 
              className="relative hidden lg:block"
              style={{ 
                opacity: loaded ? 1 : 0, 
                transform: loaded ? 'translateX(0)' : 'translateX(50px)', 
                transition: 'all 1s ease 0.3s' 
              }}
            >
              <div className="relative w-full aspect-square max-w-[500px] mx-auto">
                {/* Glass Card */}
                <div className="absolute inset-0 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/10" />
                  
                  {/* Header */}
                  <div className="relative p-6 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Inteligência corporativa</p>
                        <h2 className="mt-1 font-[Manrope] text-lg font-medium text-white">Suite de automação</h2>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                        <LayoutGrid size={18} className="text-violet-400" />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="relative p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Visão 360°', value: 'Insights contínuos' },
                        { label: 'Mídia sob demanda', value: 'Streaming + downloads' },
                        { label: 'Automação IA', value: 'Processos inteligentes' },
                        { label: 'Segurança', value: 'Dados sob controle' },
                      ].map((item) => (
                        <div key={item.label} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                          <p className="text-xs text-gray-500">{item.label}</p>
                          <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Live Metrics */}
                    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-3">Métricas em tempo real</p>
                      <div className="grid grid-cols-3 gap-3">
                        {metrics.map((metric) => (
                          <div key={metric.label} className="text-center">
                            <p className="text-xs text-gray-500">{metric.label}</p>
                            <p className="mt-1 font-[Manrope] text-xl font-medium bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                              {metric.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-violet-500/30 blur-2xl" />
                <div className="absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-cyan-500/20 blur-3xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <a
            href="#funcionalidades"
            className="flex flex-col items-center gap-2 text-gray-500 hover:text-white transition-colors"
          >
            <span className="text-xs uppercase tracking-[0.3em]">Deslize para explorar</span>
            <ChevronDown size={20} />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
