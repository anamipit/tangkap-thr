import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coins, 
  Bomb, 
  User, 
  Play, 
  RotateCcw, 
  Share2, 
  Trophy, 
  Skull,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { domToPng } from 'modern-screenshot';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from '@google/genai';

// --- Constants & Types ---

const MAX_THR = 10000;
const BASKET_WIDTH = 100;
const BASKET_HEIGHT = 80;

interface Question {
  text: string;
  options: string[];
  correctIndex: number;
}

const ISLAMIC_QUESTIONS: Question[] = [
  { text: "Apa arti puasa secara bahasa?", options: ["Menahan", "Makan sahur", "Menunggu maghrib", "Tidur seharian"], correctIndex: 0 },
  { text: "Malam Lailatul Qadar lebih baik dari...", options: ["1000 bintang", "1000 bulan", "1000 purnama", "1000 alasan mantan"], correctIndex: 1 },
  { text: "Makanan khas yang wajib ada saat Idul Fitri di Indonesia adalah...", options: ["Pizza", "Sushi", "Ketupat", "Nasi Padang"], correctIndex: 2 },
  { text: "Malaikat yang bertugas mencatat amal baik adalah...", options: ["Raqib", "Atid", "Jibril", "Izrail"], correctIndex: 0 },
  { text: "Hal yang paling membatalkan puasa di siang hari bolong adalah...", options: ["Menangis", "Ngupil", "Scroll TikTok", "Minum es teh manis"], correctIndex: 3 },
  { text: "Rukun Islam yang ke-3 adalah...", options: ["Zakat", "Puasa", "Haji", "Menikah"], correctIndex: 0 },
  { text: "Kapan biasanya malam Lailatul Qadar turun?", options: ["Malam minggu", "10 malam terakhir ganjil", "Malam 1 Suro", "Pas lagi hujan"], correctIndex: 1 },
  { text: "Nabi yang ditelan ikan paus adalah...", options: ["Nabi Nuh AS", "Nabi Musa AS", "Nabi Yunus AS", "Nabi Khidir AS"], correctIndex: 2 },
  { text: "Waktu mulai menahan diri dari makan dan minum saat puasa disebut...", options: ["Buka", "Sahur", "Imsak/Subuh", "Maghrib"], correctIndex: 2 }
];

// --- Pure Vanilla JS Game Engine ---

class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number = 0;
  height: number = 0;
  
  basket = { x: 0, y: 0, w: BASKET_WIDTH, h: BASKET_HEIGHT, speed: 800 };
  items: any[] = [];
  particles: any[] = [];
  
  lastTime: number = 0;
  spawnTimer: number = 0;
  reqId: number = 0;
  isPaused: boolean = false;
  
  targetX: number = 0;
  keys = { left: false, right: false };
  
  callbacks: {
    onScore: (val: number) => void;
    onBomb: () => void;
    onQuestion: () => void;
  };

  constructor(canvas: HTMLCanvasElement, callbacks: any) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    
    this.resize();
    window.addEventListener('resize', this.resize);
    
    this.targetX = this.width / 2 - this.basket.w / 2;
    this.basket.x = this.targetX;
    this.basket.y = this.height - this.basket.h - 20;
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.stop();
  }

  resize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.width = rect.width;
      this.height = rect.height;
      this.basket.y = this.height - this.basket.h - 20;
    }
  }

  start() {
    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.reqId);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame(this.loop);
  }

  setTargetX(x: number) {
    this.targetX = x - this.basket.w / 2;
  }

  setKeys(left: boolean, right: boolean) {
    this.keys.left = left;
    this.keys.right = right;
  }

  spawnItem() {
    const rand = Math.random();
    let type = 'money';
    let value = 0;
    let vx = 0;
    let vyMult = 1;

    if (rand < 0.15) {
      type = 'bomb';
    } else if (rand < 0.19) {
      type = 'question';
    } else if (rand < 0.34) {
      type = 'money';
      value = [500, 1000][Math.floor(Math.random() * 2)];
      vx = (Math.random() > 0.5 ? 1 : -1) * (100 + Math.random() * 200);
      vyMult = 1.6;
    } else {
      type = 'money';
      value = [100, 200][Math.floor(Math.random() * 2)];
    }

    this.items.push({
      id: Math.random(),
      type,
      value,
      x: Math.random() * (this.width - 60),
      y: -60,
      w: 60,
      h: 60,
      vx,
      vyMult,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 5
    });
  }

  createParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 300,
        vy: (Math.random() - 0.5) * 300,
        life: 1.0,
        color
      });
    }
  }

  loop = (time: number) => {
    if (this.isPaused) return;

    const dt = Math.min(time - this.lastTime, 50) / 1000; // in seconds
    this.lastTime = time;

    this.update(dt);
    this.draw();

    this.reqId = requestAnimationFrame(this.loop);
  }

  update(dt: number) {
    // Move basket via keyboard
    if (this.keys.left) this.targetX -= this.basket.speed * dt;
    if (this.keys.right) this.targetX += this.basket.speed * dt;
    
    // Clamp target
    this.targetX = Math.max(0, Math.min(this.width - this.basket.w, this.targetX));
    
    // Smooth follow (lerp)
    this.basket.x += (this.targetX - this.basket.x) * 15 * dt;

    // Spawn items
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.8) {
      this.spawnItem();
      this.spawnTimer = 0;
    }

    const baseSpeed = this.height / 3; // Fall from top to bottom in 3 seconds

    // Update items
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.y += baseSpeed * item.vyMult * dt;
      item.x += item.vx * dt;
      item.rotation += item.rotSpeed * dt;

      // Bounce off walls
      if (item.x <= 0 || item.x >= this.width - item.w) {
        item.vx *= -1;
        item.x = Math.max(0, Math.min(this.width - item.w, item.x));
      }

      // Collision Detection (AABB)
      if (
        item.y + item.h >= this.basket.y &&
        item.y <= this.basket.y + this.basket.h &&
        item.x + item.w >= this.basket.x &&
        item.x <= this.basket.x + this.basket.w
      ) {
        // Caught
        if (item.type === 'money') {
          this.callbacks.onScore(item.value);
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#facc15');
        } else if (item.type === 'bomb') {
          this.callbacks.onBomb();
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#ef4444');
        } else if (item.type === 'question') {
          this.callbacks.onQuestion();
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#a855f7');
        }
        this.items.splice(i, 1);
        continue;
      }

      // Missed (out of bounds)
      if (item.y > this.height) {
        this.items.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 2;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw Basket
    this.ctx.fillStyle = '#c2410c'; // orange-700
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(this.basket.x, this.basket.y, this.basket.w, this.basket.h, [24, 24, 12, 12]);
    } else {
      this.ctx.rect(this.basket.x, this.basket.y, this.basket.w, this.basket.h);
    }
    this.ctx.fill();
    
    // Basket Top Rim
    this.ctx.fillStyle = '#9a3412'; // orange-800
    this.ctx.fillRect(this.basket.x, this.basket.y, this.basket.w, 8);

    // Basket Inner Detail
    this.ctx.fillStyle = 'rgba(234, 88, 12, 0.5)'; // orange-600/50
    this.ctx.beginPath();
    this.ctx.arc(this.basket.x + this.basket.w / 2, this.basket.y + this.basket.h / 2, 16, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw Items
    for (const item of this.items) {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const r = item.w / 2;

      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(item.rotation);

      if (item.type === 'money') {
        // Coin Base
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 2);
        this.ctx.fillStyle = '#facc15';
        this.ctx.fill();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#ca8a04';
        this.ctx.stroke();
        
        // Coin Text
        this.ctx.fillStyle = '#713f12';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`Rp${item.value}`, 0, 0);
      } else if (item.type === 'bomb') {
        // Bomb Base
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 2);
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fill();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#334155';
        this.ctx.stroke();

        // Bomb Fuse/Top
        this.ctx.fillStyle = '#ef4444';
        this.ctx.beginPath();
        this.ctx.arc(0, -r + 8, 6, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (item.type === 'question') {
        // Question Base
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 2);
        this.ctx.fillStyle = '#a855f7';
        this.ctx.fill();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#7e22ce';
        this.ctx.stroke();

        // Question Mark
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('?', 0, 2);
      }

      this.ctx.restore();
    }

    // Draw Particles
    for (const p of this.particles) {
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
  }
}

// --- React App Component ---

export default function App() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [isWin, setIsWin] = useState(false);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);

  const generateQuestion = async () => {
    setGameState('paused');
    engineRef.current?.pause();
    setIsGeneratingQuestion(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: "Buatkan 1 pertanyaan pilihan ganda lucu dan menjebak seputar lebaran, puasa, atau budaya mudik di Indonesia. Berikan 4 pilihan jawaban dan tentukan index jawaban yang benar (0-3).",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: "Pertanyaan lucu/menjebak" },
              options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 pilihan jawaban" },
              correctIndex: { type: Type.INTEGER, description: "Index jawaban benar (0-3)" }
            },
            required: ["text", "options", "correctIndex"]
          }
        }
      });
      
      if (response.text) {
        const data = JSON.parse(response.text);
        setActiveQuestion(data);
      } else {
        throw new Error("Empty response");
      }
    } catch (error) {
      console.error("Failed to generate question:", error);
      const randomQ = ISLAMIC_QUESTIONS[Math.floor(Math.random() * ISLAMIC_QUESTIONS.length)];
      setActiveQuestion(randomQ);
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  // Initialize Game Engine
  useEffect(() => {
    if (gameState === 'playing' && canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current, {
        onScore: (val: number) => {
          setScore(prev => {
            const newScore = prev + val;
            if (newScore >= MAX_THR) {
              handleWin();
            }
            return newScore;
          });
        },
        onBomb: () => {
          setGameState('gameover');
          setIsWin(false);
          engineRef.current?.stop();
        },
        onQuestion: () => {
          generateQuestion();
        }
      });
      engineRef.current.start();
    }

    return () => {
      if (gameState !== 'playing' && gameState !== 'paused' && engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [gameState]);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') engineRef.current?.setKeys(true, engineRef.current.keys.right);
      if (e.key === 'ArrowRight') engineRef.current?.setKeys(engineRef.current.keys.left, true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') engineRef.current?.setKeys(false, engineRef.current.keys.right);
      if (e.key === 'ArrowRight') engineRef.current?.setKeys(engineRef.current.keys.left, false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (engineRef.current && gameAreaRef.current && gameState === 'playing') {
      const rect = gameAreaRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      engineRef.current.setTargetX(x);
    }
  };

  const startGame = () => {
    if (!playerName.trim()) {
      alert("Masukkan nama dulu ya!");
      return;
    }
    setScore(0);
    setIsWin(false);
    setActiveQuestion(null);
    setGameState('playing');
  };

  const handleWin = () => {
    setGameState('gameover');
    setIsWin(true);
    engineRef.current?.stop();
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#facc15', '#fb923c', '#4ade80']
    });
  };

  const handleAnswer = (idx: number) => {
    if (activeQuestion && idx === activeQuestion.correctIndex) {
      // Correct
      setActiveQuestion(null);
      setGameState('playing');
      engineRef.current?.resume();
    } else {
      // Wrong
      setActiveQuestion(null);
      setGameState('gameover');
      setIsWin(false);
      engineRef.current?.stop();
    }
  };

  const shareResult = async () => {
    if (gameAreaRef.current) {
      try {
        const image = await domToPng(gameAreaRef.current, {
          scale: 2,
          backgroundColor: '#0f172a'
        });
        const link = document.createElement('a');
        link.href = image;
        link.download = `THR-${playerName}.png`;
        link.click();
      } catch (error) {
        console.error('Failed to share result:', error);
      }
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-slate-900 text-white font-sans overflow-hidden flex flex-col items-center justify-center sm:p-4">
      {/* Game Container */}
      <div 
        id="game-area"
        ref={gameAreaRef}
        onPointerMove={handlePointerMove}
        className="relative w-full max-w-lg h-full bg-gradient-to-b from-sky-400 to-emerald-500 sm:rounded-3xl shadow-2xl overflow-hidden sm:border-8 border-slate-800 touch-none select-none"
      >
        {/* Background Elements (Static HTML) */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-10 left-10 w-20 h-20 bg-white rounded-full blur-xl" />
          <div className="absolute top-40 right-10 w-32 h-32 bg-yellow-200 rounded-full blur-2xl" />
          <div className="absolute top-1/4 left-1/4 w-40 h-40 border border-white/20 rotate-45" />
          <div className="absolute top-1/2 right-1/4 w-60 h-60 border border-white/10 rotate-12" />
          <div className="absolute bottom-1/4 left-1/2 w-32 h-32 border border-white/20 -rotate-12" />
        </div>

        {/* The Canvas Engine */}
        {(gameState === 'playing' || gameState === 'paused' || gameState === 'gameover') && (
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          />
        )}

        {/* Start Screen */}
        <AnimatePresence>
          {gameState === 'start' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-slate-900/80 backdrop-blur-md"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 4 }}
                className="mb-8"
              >
                <div className="relative">
                  <Coins className="w-24 h-24 text-yellow-400" />
                  <div className="absolute -top-2 -right-2 bg-red-500 text-xs font-bold px-2 py-1 rounded-full animate-bounce">
                    THR
                  </div>
                </div>
              </motion.div>
              
              <h1 className="text-4xl font-black text-center mb-2 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                TANGKAP THR
              </h1>
              <p className="text-slate-400 text-center mb-8 text-sm">
                Kumpulkan Rp 10.000 untuk menang! <br/>
                Hati-hati bom & pertanyaan maut keluarga.
              </p>

              <div className="w-full space-y-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Masukkan Nama Kamu"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-lg font-bold focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <button 
                  onClick={startGame}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-yellow-950 font-black text-xl py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-transform flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20"
                >
                  <Play className="w-6 h-6 fill-current" />
                  MAIN SEKARANG
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD Overlay */}
        {gameState !== 'start' && (
          <div className="absolute top-6 left-0 right-0 px-6 z-40 flex justify-between items-start pointer-events-none">
            <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Pemain</div>
              <div className="text-sm font-bold truncate max-w-[100px]">{playerName}</div>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/10 text-right">
              <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Total THR</div>
              <div className="text-xl font-black text-yellow-400">
                Rp {score.toLocaleString('id-ID')}
              </div>
              <div className="w-full h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                <motion.div 
                  className="h-full bg-yellow-400"
                  animate={{ width: `${(score / MAX_THR) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Question Modal */}
        <AnimatePresence>
          {gameState === 'paused' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-lg pointer-events-auto"
            >
              {isGeneratingQuestion ? (
                <div className="flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Keluarga Sedang Berkumpul...</h3>
                  <p className="text-slate-400 text-sm">Mencari pertanyaan jebakan yang pas buat kamu!</p>
                </div>
              ) : activeQuestion ? (
                <div className="w-full bg-slate-800 rounded-3xl p-6 border-2 border-purple-500 shadow-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center">
                      <HelpCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-purple-400 text-sm uppercase tracking-wider">Pertanyaan Keluarga</h3>
                      <p className="text-xs text-slate-400 italic">Jawab dengan benar atau game berakhir!</p>
                    </div>
                  </div>

                  <h2 className="text-xl font-bold mb-6 leading-tight">
                    "{activeQuestion.text}"
                  </h2>

                  <div className="grid grid-cols-1 gap-3">
                    {activeQuestion.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-left p-4 rounded-xl text-sm font-medium transition-colors border border-slate-600 active:scale-95"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over Screen */}
        <AnimatePresence>
          {gameState === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-[70] flex flex-col items-center justify-center p-8 bg-slate-900/95 backdrop-blur-md pointer-events-auto"
            >
              {isWin ? (
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6 border-4 border-green-500">
                  <Trophy className="w-12 h-12 text-green-400" />
                </div>
              ) : (
                <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border-4 border-red-500">
                  <Skull className="w-12 h-12 text-red-400" />
                </div>
              )}

              <h2 className={`text-3xl font-black mb-2 ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                {isWin ? 'MENANG BANYAK!' : 'YAH KETAHUAN!'}
              </h2>
              
              <div className="bg-slate-800 w-full rounded-2xl p-6 text-center mb-8 border border-slate-700">
                <p className="text-slate-400 text-sm mb-1">Total THR {playerName}</p>
                <p className="text-4xl font-black text-yellow-400">Rp {score.toLocaleString('id-ID')}</p>
              </div>

              <div className="w-full space-y-3">
                <button 
                  onClick={startGame}
                  className="w-full bg-white text-slate-900 font-bold py-4 rounded-xl hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  MAIN LAGI
                </button>
                <button 
                  onClick={shareResult}
                  className="w-full bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  <Share2 className="w-5 h-5" />
                  PAMER KE GRUP KELUARGA
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
