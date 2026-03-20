/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
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
  XCircle
} from 'lucide-react';
import { domToPng } from 'modern-screenshot';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from '@google/genai';

// --- Constants & Types ---

const MAX_THR = 10000;
const ITEM_SIZE = 60;
const BASKET_WIDTH = 100;
const BASKET_HEIGHT = 80;
const SPAWN_INTERVAL = 800;
const FALL_DURATION = 3; // seconds

type ItemType = 'money' | 'bomb' | 'question';

interface FallingItem {
  id: number;
  type: ItemType;
  value?: number;
  x: number;
  y: number;
  vx?: number;
  vyMultiplier?: number;
  question?: Question;
  isSuperFast?: boolean;
}

interface Question {
  text: string;
  options: string[];
  correctIndex: number;
}

const ISLAMIC_QUESTIONS: Question[] = [
  {
    text: "Apa arti puasa secara bahasa?",
    options: ["Menahan", "Makan sahur", "Menunggu maghrib", "Tidur seharian"],
    correctIndex: 0
  },
  {
    text: "Malam Lailatul Qadar lebih baik dari...",
    options: ["1000 bintang", "1000 bulan", "1000 purnama", "1000 alasan mantan"],
    correctIndex: 1
  },
  {
    text: "Makanan khas yang wajib ada saat Idul Fitri di Indonesia adalah...",
    options: ["Pizza", "Sushi", "Ketupat", "Nasi Padang"],
    correctIndex: 2
  },
  {
    text: "Malaikat yang bertugas mencatat amal baik adalah...",
    options: ["Raqib", "Atid", "Jibril", "Izrail"],
    correctIndex: 0
  },
  {
    text: "Hal yang paling membatalkan puasa di siang hari bolong adalah...",
    options: ["Menangis", "Ngupil", "Scroll TikTok", "Minum es teh manis"],
    correctIndex: 3
  },
  {
    text: "Rukun Islam yang ke-3 adalah...",
    options: ["Zakat", "Puasa", "Haji", "Menikah"],
    correctIndex: 0
  },
  {
    text: "Kapan biasanya malam Lailatul Qadar turun?",
    options: ["Malam minggu", "10 malam terakhir ganjil", "Malam 1 Suro", "Pas lagi hujan"],
    correctIndex: 1
  },
  {
    text: "Nabi yang ditelan ikan paus adalah...",
    options: ["Nabi Nuh AS", "Nabi Musa AS", "Nabi Yunus AS", "Nabi Khidir AS"],
    correctIndex: 2
  },
  {
    text: "Waktu mulai menahan diri dari makan dan minum saat puasa disebut...",
    options: ["Buka", "Sahur", "Imsak/Subuh", "Maghrib"],
    correctIndex: 2
  },
  {
    text: "Takbir keliling biasanya dilakukan pada saat...",
    options: ["Malam jumat kliwon", "Malam tahun baru", "Malam takbiran", "Malam minggu"],
    correctIndex: 2
  }
];

const STANDARD_MONEY_VALUES = [5, 10, 50, 100];
const ZIGZAG_MONEY_VALUES = [1000, 2000];
const SUPER_FAST_MONEY_VALUES = [5000];

const SOUNDS = {
  COIN: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  BOMB: 'https://assets.mixkit.co/active_storage/sfx/170/170-preview.mp3',
  WIN: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
  FAIL: 'https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3',
  QUESTION: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3'
};

const audioElements: Record<string, HTMLAudioElement> = {};
if (typeof window !== 'undefined') {
  Object.entries(SOUNDS).forEach(([key, url]) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audioElements[key] = audio;
  });
}

const playSound = (key: keyof typeof SOUNDS) => {
  try {
    const audio = audioElements[key];
    if (audio) {
      const clone = audio.cloneNode() as HTMLAudioElement;
      clone.volume = 0.5;
      clone.play().catch(e => console.log("Audio play failed:", e));
    }
  } catch (e) {
    console.error("Error playing sound:", e);
  }
};

// --- Components ---

export default function App() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'win' | 'gameover'>('start');
  const [playerName, setPlayerName] = useState('');
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [waitingForQuestion, setWaitingForQuestion] = useState(false);
  const basketXRef = useRef(0);
  const [gameAreaWidth, setGameAreaWidth] = useState(0);
  const [gameAreaHeight, setGameAreaHeight] = useState(0);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const basketRef = useRef<HTMLDivElement>(null);
  const nextItemId = useRef(0);
  const gameLoopRef = useRef<number | null>(null);
  const lastSpawnTime = useRef(0);
  const itemsRef = useRef<FallingItem[]>([]);
  const isFetchingBackground = useRef(false);
  const superFastSpawned = useRef(false);
  const keysRef = useRef({ ArrowLeft: false, ArrowRight: false });

  // Initialize game area dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (gameAreaRef.current) {
        setGameAreaWidth(gameAreaRef.current.offsetWidth);
        setGameAreaHeight(gameAreaRef.current.offsetHeight);
        basketXRef.current = gameAreaRef.current.offsetWidth / 2 - BASKET_WIDTH / 2;
        if (basketRef.current) {
          basketRef.current.style.transform = `translate3d(${basketXRef.current}px, 0, 0)`;
        }
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Keyboard Controls for Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keysRef.current.ArrowLeft = true;
      if (e.key === 'ArrowRight') keysRef.current.ArrowRight = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keysRef.current.ArrowLeft = false;
      if (e.key === 'ArrowRight') keysRef.current.ArrowRight = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      return;
    }

    const loop = (time: number) => {
      // Handle smooth keyboard movement
      if (keysRef.current.ArrowLeft || keysRef.current.ArrowRight) {
        const MOVE_SPEED = 12; // pixels per frame
        let newX = basketXRef.current;
        if (keysRef.current.ArrowLeft) newX = Math.max(0, newX - MOVE_SPEED);
        if (keysRef.current.ArrowRight) newX = Math.min(gameAreaWidth - BASKET_WIDTH, newX + MOVE_SPEED);
        basketXRef.current = newX;
        if (basketRef.current) {
          basketRef.current.style.transform = `translate3d(${newX}px, 0, 0)`;
        }
      }

      // Spawn items
      if (time - lastSpawnTime.current > SPAWN_INTERVAL) {
        spawnItem();
        lastSpawnTime.current = time;
      }

      let caughtItem: FallingItem | null = null;
      let itemsChanged = false;

      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const item = itemsRef.current[i];
        const speedMult = item.vyMultiplier || 1;
        item.y += (gameAreaHeight / (FALL_DURATION * 60)) * speedMult;
        
        if (item.isSuperFast && Math.random() < 0.05) {
          item.vx = -(item.vx || 0); // Randomly change direction
        }
        
        if (item.vx !== 0 && item.vx !== undefined) {
          item.x += item.vx;
          // Bounce off walls
          if (item.x <= 0) {
            item.x = 0;
            item.vx = Math.abs(item.vx);
          } else if (item.x >= gameAreaWidth - ITEM_SIZE) {
            item.x = gameAreaWidth - ITEM_SIZE;
            item.vx = -Math.abs(item.vx);
          }
        }
        
        // Check if item is caught
        const tolerance = item.type === 'bomb' ? 25 : 5; 
        
        const isCaught = 
          item.y + ITEM_SIZE - tolerance >= gameAreaHeight - BASKET_HEIGHT &&
          item.y + tolerance <= gameAreaHeight &&
          item.x + ITEM_SIZE - tolerance >= basketXRef.current &&
          item.x + tolerance <= basketXRef.current + BASKET_WIDTH;

        if (isCaught) {
          caughtItem = item;
          itemsRef.current.splice(i, 1);
          itemsChanged = true;
          continue; // Item removed
        }

        // Check if item missed
        if (item.y >= gameAreaHeight) {
          itemsRef.current.splice(i, 1);
          itemsChanged = true;
          continue;
        }

        // Direct DOM update for performance
        const el = document.getElementById(`item-${item.id}`);
        if (el) {
          el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
        }
      }
      
      if (itemsChanged) {
        setItems([...itemsRef.current]);
      }

      if (caughtItem) {
        handleCatch(caughtItem);
      }

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, gameAreaHeight, gameAreaWidth]);

  const spawnItem = () => {
    const rand = Math.random();
    let type: ItemType = 'money';
    let value: number | undefined;
    let vx = 0;
    let vyMultiplier = 1;
    let isSuperFast = false;

    if (rand < 0.15) {
      // 15% chance: Bomb
      type = 'bomb';
    } else if (rand < 0.19) {
      // 4% chance: Question (dikurangi dari 10% agar lebih jarang)
      type = 'question';
    } else if (!superFastSpawned.current && scoreRef.current >= 2000 && Math.random() < 0.05) {
      // Super Fast Coin (Exactly once per game, mid-game)
      type = 'money';
      value = SUPER_FAST_MONEY_VALUES[0];
      vx = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 4); // Very fast horizontal
      vyMultiplier = 2.0 + Math.random() * 1.0; // Fall 2x to 3x faster
      isSuperFast = true;
      superFastSpawned.current = true;
    } else if (rand < 0.34) {
      // 15% chance: Zigzag Coin (Rare, High Value)
      type = 'money';
      value = ZIGZAG_MONEY_VALUES[Math.floor(Math.random() * ZIGZAG_MONEY_VALUES.length)];
      // Zigzag movement: random horizontal velocity and faster fall
      vx = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 5); // Speed between 3 and 8
      vyMultiplier = 1.4 + Math.random() * 0.8; // Fall 1.4x to 2.2x faster
    } else {
      // 66% chance: Standard Coin (Frequent, Low Value)
      type = 'money';
      value = STANDARD_MONEY_VALUES[Math.floor(Math.random() * STANDARD_MONEY_VALUES.length)];
      vx = 0; // Straight down
      vyMultiplier = 1; // Normal speed
    }

    const x = Math.random() * (gameAreaWidth - ITEM_SIZE);
    const newItem: FallingItem = {
      id: nextItemId.current++,
      type,
      value,
      x,
      y: -ITEM_SIZE,
      vx,
      vyMultiplier,
      isSuperFast
    };

    itemsRef.current.push(newItem);
    setItems([...itemsRef.current]); // Trigger render to create DOM node
  };

  const fetchQuestionsBatch = async (count: number = 5) => {
    if (isFetchingBackground.current) return;
    isFetchingBackground.current = true;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Buat ${count} pertanyaan pilihan ganda seputar Ramadhan, Idul Fitri, Lailatul Qadar, atau pengetahuan dasar Islam. Pertanyaan dan opsi jawaban boleh menjebak, mengecoh, atau lucu, tapi harus ada 1 jawaban yang benar secara fakta/logika. PASTIKAN pertanyaan dan jawaban benar, shahih, dan tidak mengada-ada. Berikan 4 opsi jawaban untuk masing-masing pertanyaan.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Teks pertanyaan" },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "4 opsi jawaban"
                },
                correctIndex: { type: Type.INTEGER, description: "Index jawaban benar (0-3)" }
              },
              required: ["text", "options", "correctIndex"]
            }
          }
        }
      });
      const data = JSON.parse(response.text || "[]");
      if (Array.isArray(data)) {
        setQuestionBank(prev => [...prev, ...data]);
      }
    } catch (error) {
      console.error("Failed to fetch questions batch", error);
      // Fallback to prevent infinite loops and unblock the game using ISLAMIC_QUESTIONS
      const shuffled = [...ISLAMIC_QUESTIONS].sort(() => 0.5 - Math.random());
      const fallbackQuestions = shuffled.slice(0, count);
      setQuestionBank(prev => [...prev, ...fallbackQuestions]);
    } finally {
      isFetchingBackground.current = false;
    }
  };

  // Effect to keep the bank populated
  useEffect(() => {
    if (questionBank.length < 3 && !isFetchingBackground.current) {
      fetchQuestionsBatch(5);
    }
  }, [questionBank.length]);

  // Effect to handle waiting state
  useEffect(() => {
    if (waitingForQuestion && questionBank.length > 0) {
      const nextQ = questionBank[0];
      setQuestionBank(prev => prev.slice(1));
      setActiveQuestion(nextQ);
      setWaitingForQuestion(false);
    }
  }, [questionBank, waitingForQuestion]);

  const handleCatch = (item: FallingItem) => {
    if (item.type === 'money') {
      playSound('COIN');
      scoreRef.current += (item.value || 0);
      setScore(scoreRef.current);
      if (scoreRef.current >= MAX_THR) {
        playSound('WIN');
        setGameState('win');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } else if (item.type === 'bomb') {
      playSound('BOMB');
      setTimeout(() => playSound('FAIL'), 800);
      setGameState('gameover');
    } else if (item.type === 'question') {
      playSound('QUESTION');
      setGameState('paused');
      if (questionBank.length > 0) {
        const nextQ = questionBank[0];
        setQuestionBank(prev => prev.slice(1));
        setActiveQuestion(nextQ);
      } else {
        setWaitingForQuestion(true);
      }
    }
  };

  const handleAnswer = (index: number) => {
    if (activeQuestion && index === activeQuestion.correctIndex) {
      playSound('COIN');
      scoreRef.current += 1000;
      setScore(scoreRef.current);
      if (scoreRef.current >= MAX_THR) {
        playSound('WIN');
        setGameState('win');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        setGameState('playing');
      }
      setActiveQuestion(null);
    } else {
      playSound('FAIL');
      setGameState('gameover');
    }
  };

  const startGame = () => {
    if (!playerName.trim()) return;
    scoreRef.current = 0;
    setScore(0);
    superFastSpawned.current = false;
    itemsRef.current = [];
    setItems([]);
    setGameState('playing');
    lastSpawnTime.current = performance.now();
  };

  const restartGame = () => {
    scoreRef.current = 0;
    setScore(0);
    superFastSpawned.current = false;
    itemsRef.current = [];
    setItems([]);
    setGameState('playing');
    lastSpawnTime.current = performance.now();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameState !== 'playing' || !gameAreaRef.current) return;
    if (e.pointerType === 'mouse' && e.buttons !== 1) return; // Only drag if mouse button is pressed
    
    const rect = gameAreaRef.current.getBoundingClientRect();
    let newX = e.clientX - rect.left - BASKET_WIDTH / 2;
    newX = Math.max(0, Math.min(newX, gameAreaWidth - BASKET_WIDTH));
    basketXRef.current = newX;
    if (basketRef.current) {
      basketRef.current.style.transform = `translate3d(${newX}px, 0, 0)`;
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
        {/* Background Elements */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-10 left-10 w-20 h-20 bg-white rounded-full blur-xl" />
          <div className="absolute top-40 right-10 w-32 h-32 bg-yellow-200 rounded-full blur-2xl" />
          
          {/* Decorative Ketupat-like patterns */}
          <div className="absolute top-1/4 left-1/4 w-40 h-40 border border-white/20 rotate-45" />
          <div className="absolute top-1/2 right-1/4 w-60 h-60 border border-white/10 rotate-12" />
          <div className="absolute bottom-1/4 left-1/2 w-32 h-32 border border-white/20 -rotate-12" />
        </div>

        {/* Festive Header for Game Area */}
        {gameState !== 'start' && (
          <div className="absolute top-0 left-0 right-0 h-2 bg-yellow-400 z-50 shadow-sm" />
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
                    className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl py-4 pl-12 pr-4 focus:border-yellow-400 outline-none transition-colors"
                  />
                </div>
                <button 
                  onClick={startGame}
                  disabled={!playerName.trim()}
                  className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-yellow-400/20"
                >
                  <Play className="w-5 h-5 fill-current" />
                  MULAI GAME
                </button>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-2 w-full">
                <div className="bg-slate-800/50 p-2 rounded-lg text-center">
                  <Coins className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <span className="text-[8px] block text-slate-400">Tangkap Uang</span>
                </div>
                <div className="bg-slate-800/50 p-2 rounded-lg text-center">
                  <Bomb className="w-4 h-4 text-red-500 mx-auto mb-1" />
                  <span className="text-[8px] block text-slate-400">Hindari Bom</span>
                </div>
                <div className="bg-slate-800/50 p-2 rounded-lg text-center">
                  <HelpCircle className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                  <span className="text-[8px] block text-slate-400">Jawab Tanya</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD */}
        {gameState !== 'start' && (
          <div className="absolute top-6 left-0 right-0 px-6 z-40 flex justify-between items-start pointer-events-none">
            <div className="bg-slate-900/40 backdrop-blur-sm p-3 rounded-2xl border border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Pemain</div>
              <div className="text-sm font-bold truncate max-w-[100px]">{playerName}</div>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-sm p-3 rounded-2xl border border-white/10 text-right">
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

        {/* Falling Items */}
        {items.map(item => (
          <div 
            key={item.id}
            id={`item-${item.id}`}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ 
              transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
              width: ITEM_SIZE, 
              height: ITEM_SIZE,
              willChange: 'transform'
            }}
          >
            {item.type === 'money' && (
              <div className={`w-full h-full bg-yellow-400 rounded-full border-4 ${item.isSuperFast ? 'border-red-500 animate-spin shadow-red-500/50' : 'border-yellow-600 transform rotate-12'} flex items-center justify-center shadow-lg`}>
                <span className="text-[10px] font-black text-yellow-900">Rp{item.value}</span>
              </div>
            )}
            {item.type === 'bomb' && (
              <div className="w-full h-full bg-slate-900 rounded-full border-4 border-slate-700 flex items-center justify-center shadow-lg">
                <Bomb className="w-8 h-8 text-red-500" />
              </div>
            )}
            {item.type === 'question' && (
              <div className="w-full h-full bg-purple-500 rounded-full border-4 border-purple-700 flex items-center justify-center shadow-lg animate-pulse">
                <HelpCircle className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Basket */}
        {gameState !== 'start' && (
          <div
            ref={basketRef}
            className="absolute bottom-4 left-0 z-30"
            style={{ 
              width: BASKET_WIDTH, 
              height: BASKET_HEIGHT,
              transform: `translate3d(${basketXRef.current}px, 0, 0)`,
              willChange: 'transform'
            }}
          >
            <div className="w-full h-full relative pointer-events-none">
              {/* Basket Visual */}
              <div className="absolute bottom-0 w-full h-12 bg-orange-800 rounded-b-xl border-t-4 border-orange-900 shadow-xl overflow-hidden">
                {/* Woven pattern */}
                <div className="absolute inset-0 opacity-20 grid grid-cols-4 grid-rows-2">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="border border-white" />
                  ))}
                </div>
              </div>
              <div className="absolute bottom-4 w-full h-16 bg-orange-700 rounded-t-3xl border-x-4 border-orange-900 flex items-center justify-center">
                <div className="w-12 h-12 bg-orange-600/50 rounded-full flex items-center justify-center border-2 border-orange-800">
                  <Coins className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-orange-600 rounded-full opacity-50" />
              
              {/* Catch Effect */}
              <AnimatePresence>
                {score > 0 && (
                  <motion.div 
                    key={score}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{ y: -40, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute -top-10 left-1/2 -translate-x-1/2 text-yellow-300 font-bold text-sm"
                  >
                    +Rp
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Question Modal */}
        <AnimatePresence>
          {gameState === 'paused' && (waitingForQuestion || activeQuestion) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-lg"
            >
              <div className="w-full bg-slate-800 rounded-3xl p-6 border-2 border-purple-500 shadow-2xl">
                {waitingForQuestion ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-purple-400 font-bold animate-pulse text-center">Ustadz Gemini sedang meracik pertanyaan...</p>
                  </div>
                ) : activeQuestion ? (
                  <>
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
                  </>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Win Screen */}
        <AnimatePresence>
          {gameState === 'win' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-[70] flex flex-col items-center justify-center p-8 bg-emerald-600/95 backdrop-blur-md text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                transition={{ type: 'spring', damping: 12 }}
                className="mb-6"
              >
                <Trophy className="w-32 h-32 text-yellow-300" />
              </motion.div>
              
              <h1 className="text-4xl font-black mb-2 tracking-tight">SELAMAT!</h1>
              <p className="text-emerald-100 mb-8">
                Wah hebat, <span className="font-bold text-white">{playerName}</span> berhasil mengumpulkan THR maksimal Rp 10.000!
              </p>

              <div className="w-full space-y-3">
                <button 
                  onClick={shareResult}
                  className="w-full bg-white text-emerald-600 font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                >
                  <Share2 className="w-5 h-5" />
                  SIMPAN HASIL (PNG)
                </button>
                <button 
                  onClick={restartGame}
                  className="w-full bg-emerald-800 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <RotateCcw className="w-5 h-5" />
                  MAIN LAGI
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over Screen */}
        <AnimatePresence>
          {gameState === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-[70] flex flex-col items-center justify-center p-8 bg-red-600/95 backdrop-blur-md text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mb-6"
              >
                <Skull className="w-32 h-32 text-red-200" />
              </motion.div>
              
              <h1 className="text-4xl font-black mb-2 tracking-tight">GAME OVER!</h1>
              <p className="text-red-100 mb-2">
                Sayang sekali, <span className="font-bold text-white">{playerName}</span> gagal mengumpulkan THR.
              </p>
              <div className="bg-red-800/50 px-4 py-2 rounded-full text-sm font-bold mb-8">
                Total Didapat: Rp {score.toLocaleString('id-ID')}
              </div>

              <div className="w-full space-y-3">
                <button 
                  onClick={shareResult}
                  className="w-full bg-white text-red-600 font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                >
                  <Share2 className="w-5 h-5" />
                  SIMPAN HASIL (PNG)
                </button>
                <button 
                  onClick={restartGame}
                  className="w-full bg-red-800 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <RotateCcw className="w-5 h-5" />
                  COBA LAGI
                </button>
                <button 
                  onClick={() => setGameState('start')}
                  className="w-full bg-red-900 text-white/60 font-medium py-2 rounded-xl active:scale-95 transition-transform text-xs"
                >
                  MENU UTAMA
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Instructions for Desktop */}
      <div className="absolute bottom-4 left-4 text-slate-500 text-xs max-w-[200px] hidden md:block">
        <p>Gunakan <strong>Panah Kiri / Kanan</strong> di keyboard atau drag mouse untuk menggeser keranjang.</p>
      </div>
    </div>
  );
}
