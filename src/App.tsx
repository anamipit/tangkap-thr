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

const MAX_THR = 20000;
const BASKET_WIDTH = 110;
const BASKET_HEIGHT = 85;

const SFX = {
  CATCH: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  BOMB: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  QUESTION: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3',
  LOSE: 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3',
};

class SoundManager {
  sounds: Record<string, HTMLAudioElement> = {};
  enabled: boolean = true;

  constructor() {
    Object.entries(SFX).forEach(([key, url]) => {
      this.sounds[key] = new Audio(url);
      this.sounds[key].preload = 'auto';
    });
  }

  play(key: keyof typeof SFX) {
    if (!this.enabled) return;
    const sound = this.sounds[key];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {}); // Ignore autoplay blocks
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

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
  
  basket = { 
    x: 0, y: 0, vx: 0, w: BASKET_WIDTH, h: BASKET_HEIGHT, speed: 1200,
    scaleX: 1, scaleY: 1
  };
  items: any[] = [];
  particles: any[] = [];
  
  lastTime: number = 0;
  spawnTimer: number = 0;
  reqId: number = 0;
  isPaused: boolean = false;
  isActive: boolean = false;
  
  targetX: number = 0;
  keys = { left: false, right: false };
  
  callbacks: {
    onScore: (val: number) => void;
    onBomb: () => void;
    onQuestion: () => void;
  };

  soundManager: SoundManager;

  constructor(canvas: HTMLCanvasElement, callbacks: any, soundManager: SoundManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    this.soundManager = soundManager;
    
    this.resize();
    window.addEventListener('resize', this.resize);
    
    this.targetX = this.width / 2 - this.basket.w / 2;
    this.basket.x = this.targetX;
    this.basket.y = this.height - this.basket.h - 40;
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
      this.basket.y = this.height - this.basket.h - 40;
    }
  }

  start() {
    this.isActive = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.isActive = false;
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
    let emoji = '💰';

    if (rand < 0.001) {
      // Rare 5000 (0.1%)
      type = 'money';
      value = 5000;
      emoji = '🧧';
      vyMult = 1.2;
    } else if (rand < 0.101) {
      // Bomb (10%)
      type = 'bomb';
      emoji = '💣';
    } else if (rand < 0.131) {
      // Question (3%)
      type = 'question';
      emoji = '❓';
    } else if (rand < 0.331) {
      // Gold/Bills (20%) - Fast & Zigzag
      type = 'money';
      value = [500, 1000][Math.floor(Math.random() * 2)];
      vx = (Math.random() > 0.5 ? 1 : -1) * (150 + Math.random() * 250);
      vyMult = 1.8;
      emoji = value === 1000 ? '💵' : '💰';
    } else if (rand < 0.631) {
      // Silver 100, 200 (30%)
      type = 'money';
      value = [100, 200][Math.floor(Math.random() * 2)];
      emoji = '🪙';
    } else {
      // Silver 50 (Approx 37%)
      type = 'money';
      value = 50;
      emoji = '🪙';
    }

    this.items.push({
      id: Math.random(),
      type,
      value,
      emoji,
      x: Math.random() * (this.width - 60),
      y: -80,
      w: 60,
      h: 60,
      vx,
      vyMult,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 8
    });
  }

  createParticles(x: number, y: number, color: string) {
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 400,
        vy: (Math.random() - 0.5) * 400,
        life: 1.0,
        size: 2 + Math.random() * 6,
        color
      });
    }
  }

  loop = (time: number) => {
    if (!this.isActive || this.isPaused) return;

    const dt = Math.min(time - this.lastTime, 50) / 1000;
    this.lastTime = time;

    this.update(dt);
    this.draw();

    this.reqId = requestAnimationFrame(this.loop);
  }

  update(dt: number) {
    // Springy movement for basket
    if (this.keys.left) this.targetX -= this.basket.speed * dt;
    if (this.keys.right) this.targetX += this.basket.speed * dt;
    
    this.targetX = Math.max(0, Math.min(this.width - this.basket.w, this.targetX));
    
    // Spring physics
    const springK = 250;
    const damping = 0.85;
    const ax = (this.targetX - this.basket.x) * springK;
    this.basket.vx = (this.basket.vx + ax * dt) * damping;
    this.basket.x += this.basket.vx * dt;

    // Recover basket scale
    this.basket.scaleX += (1 - this.basket.scaleX) * 12 * dt;
    this.basket.scaleY += (1 - this.basket.scaleY) * 12 * dt;

    // Spawn items
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.75) {
      this.spawnItem();
      this.spawnTimer = 0;
    }

    const baseSpeed = this.height / 2.8;

    // Update items
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.y += baseSpeed * item.vyMult * dt;
      item.x += item.vx * dt;
      item.rotation += item.rotSpeed * dt;

      if (item.x <= 0 || item.x >= this.width - item.w) {
        item.vx *= -1;
        item.x = Math.max(0, Math.min(this.width - item.w, item.x));
      }

      // Collision Detection
      if (
        item.y + item.h >= this.basket.y &&
        item.y <= this.basket.y + 20 &&
        item.x + item.w >= this.basket.x &&
        item.x <= this.basket.x + this.basket.w
      ) {
        // Juice: Squash basket
        this.basket.scaleX = 1.25;
        this.basket.scaleY = 0.75;

        if (item.type === 'money') {
          this.soundManager.play('CATCH');
          this.callbacks.onScore(item.value);
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#facc15');
        } else if (item.type === 'bomb') {
          this.soundManager.play('BOMB');
          this.callbacks.onBomb();
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#ef4444');
        } else if (item.type === 'question') {
          this.soundManager.play('QUESTION');
          this.callbacks.onQuestion();
          this.createParticles(item.x + item.w/2, item.y + item.h/2, '#a855f7');
        }
        this.items.splice(i, 1);
        continue;
      }

      if (item.y > this.height) {
        this.items.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt; // Gravity on particles
      p.life -= dt * 1.5;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw Basket (Better visual)
    const bx = this.basket.x;
    const by = this.basket.y;
    const bw = this.basket.w;
    const bh = this.basket.h;

    this.ctx.save();
    this.ctx.translate(bx + bw / 2, by + bh / 2);
    this.ctx.scale(this.basket.scaleX, this.basket.scaleY);
    this.ctx.translate(-(bx + bw / 2), -(by + bh / 2));

    // Basket Body
    const gradient = this.ctx.createLinearGradient(bx, by, bx, by + bh);
    gradient.addColorStop(0, '#ea580c');
    gradient.addColorStop(1, '#9a3412');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(bx, by, bw, bh, [10, 10, 30, 30]);
    } else {
      this.ctx.rect(bx, by, bw, bh);
    }
    this.ctx.fill();
    
    // Basket Rim
    this.ctx.fillStyle = '#7c2d12';
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(bx - 5, by - 5, bw + 10, 15, 8);
    } else {
      this.ctx.rect(bx - 5, by - 5, bw + 10, 15);
    }
    this.ctx.fill();

    // Basket Texture (Lines)
    this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    this.ctx.lineWidth = 2;
    for(let i = 1; i < 4; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(bx + (bw/4)*i, by + 15);
      this.ctx.lineTo(bx + (bw/4)*i, by + bh - 10);
      this.ctx.stroke();
    }

    this.ctx.restore();

    // Draw Items
    for (const item of this.items) {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;

      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(item.rotation);

      // Draw Shadow
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = 'rgba(0,0,0,0.2)';
      this.ctx.shadowOffsetY = 5;

      // Draw Emoji as Item
      this.ctx.font = '45px serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(item.emoji, 0, 0);

      // Draw Value Text for Money
      if (item.type === 'money') {
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.strokeText(`Rp${item.value}`, 0, 25);
        this.ctx.fillText(`Rp${item.value}`, 0, 25);
      }

      this.ctx.restore();
    }

    // Draw Particles
    for (const p of this.particles) {
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
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
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [gameOverReason, setGameOverReason] = useState<'win' | 'bomb' | 'wrong_answer' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const soundManagerRef = useRef<SoundManager>(new SoundManager());

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
          soundManagerRef.current.play('LOSE');
          setGameOverReason('bomb');
          setGameState('gameover');
          setIsWin(false);
          engineRef.current?.stop();
        },
        onQuestion: () => {
          generateQuestion();
        }
      }, soundManagerRef.current);
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
    setGameOverReason(null);
    setActiveQuestion(null);
    setGameState('playing');
  };

  const handleWin = () => {
    soundManagerRef.current.play('WIN');
    setGameOverReason('win');
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
      soundManagerRef.current.play('CATCH');
      setActiveQuestion(null);
      setGameState('playing');
      engineRef.current?.resume();
    } else {
      // Wrong
      soundManagerRef.current.play('LOSE');
      setGameOverReason('wrong_answer');
      setActiveQuestion(null);
      setGameState('gameover');
      setIsWin(false);
      engineRef.current?.stop();
    }
  };

  const toggleSound = () => {
    const newState = soundManagerRef.current.toggle();
    setIsSoundEnabled(newState);
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
                Tangkap THR sebanyak-banyaknya. <br/>
                Hindari bom. Dan jawab pertanyaan!
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
            <div className="flex flex-col gap-2">
              <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Pemain</div>
                <div className="text-sm font-bold truncate max-w-[100px]">{playerName}</div>
              </div>
              <button 
                onClick={toggleSound}
                className="pointer-events-auto bg-slate-900/80 p-2 rounded-xl border border-white/10 flex items-center justify-center w-fit"
              >
                {isSoundEnabled ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-[10px] ml-1 font-bold">{isSoundEnabled ? 'SOUND ON' : 'SOUND OFF'}</span>
              </button>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-2xl border border-white/10 text-right">
              <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Total THR</div>
              <div className="text-xl font-black text-yellow-400">
                Rp {score.toLocaleString('id-ID')}
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
                {gameOverReason === 'win' && 'Selamat!'}
                {gameOverReason === 'wrong_answer' && 'Yah, Salah Jawab!'}
                {gameOverReason === 'bomb' && 'Yah! Kena Bom!'}
              </h2>
              
              <div className="bg-slate-800 w-full rounded-2xl p-6 text-center mb-8 border border-slate-700">
                <p className="text-slate-400 text-sm mb-1">{playerName} dapat</p>
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
