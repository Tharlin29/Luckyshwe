import React, { useState, useEffect, useRef } from 'react';
import { 
  Coins, 
  Clock, 
  Sparkles, 
  Flame, 
  Trophy, 
  AlertCircle, 
  TrendingUp, 
  Zap, 
  User, 
  Key, 
  RefreshCw,
  Play,
  Pause,
  Bot,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Target,
  X,
  Hourglass,
  Activity,
  Settings,
  HelpCircle,
  Cpu,
  Crosshair,
  Sliders
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { WingoDraw, PredictionResult, ShweAccount, AlgorithmType, AllMethodsStats, AutoSwitchEvent, AutoMonitoringState, AiFormula, BettingEngineMode } from '../types/lottery';
import { playWinSound, playYouWinVoice, playTickSound, playMyanmarTargetProfitVoice, playRadarLockSound, playSniperStrikeSound, playStartBettingVoice } from '../utils/audio';
import { evaluateAllMethodsLossStreaks } from '../utils/sniper6LossEngine';
import { calculateAllPredictions, getHighestWinRateAlgo, getHighestLoseRateAlgo, getHighestConsecutiveLossAlgo } from '../utils/predictionEngine';

interface PlayableGameStationProps {
  currentPeriod: string;
  secondsLeft: number;
  history: WingoDraw[];
  prediction: PredictionResult | null;
  account: ShweAccount;
  selectedTypeId: number;
  onChangeTypeId: (id: number) => void;
  onRefreshSession: () => void;
  onApplyAiGuess?: () => void;
  onRefreshLogin?: (phone: string, pass: string) => Promise<{ success: boolean; message: string }>;
  aiAlgorithm?: AlgorithmType;
  onChangeAiAlgorithm?: (algo: AlgorithmType) => void;
  methodStats?: AllMethodsStats;
  isAutoSwitchEnabled?: boolean;
  onToggleAutoSwitch?: () => void;
  autoSwitchEvent?: AutoSwitchEvent | null;
  methodPredictions?: Record<AlgorithmType, PredictionResult> | null;
  onAutoMonitoringChange?: (state: AutoMonitoringState) => void;
  onAutoBetActiveChange?: (active: boolean) => void;
  activeFormula?: AiFormula | null;
  pendingFormula?: AiFormula | null;
  onFormulaConsumed?: () => void;
  onApplyFormula?: (formula: AiFormula) => void;
  bettingEngineMode?: BettingEngineMode;
  onSelectMode?: (mode: BettingEngineMode) => void;
  autoBetTrigger?: { id: number; mode: BettingEngineMode; threshold?: 4 | 5 | 6 } | null;
  sniperLockedAlgo?: AlgorithmType | null;
  onSniperLockedAlgoChange?: (algo: AlgorithmType | null) => void;
  sevenMethodLockedAlgo?: AlgorithmType | null;
  onSevenMethodLockedAlgoChange?: (algo: AlgorithmType | null) => void;
  soundEnabled?: boolean;
}

export interface ActiveBet {
  id: string;
  period: string;
  type: 'SIZE' | 'COLOR' | 'NUMBER';
  selection: string | number;
  amount: number;
  multiplier: number;
  total: number;
  status: 'PENDING' | 'WON' | 'LOST';
  payout?: number;
  isAuto: boolean;
}

// ShweLottery denomination normalizer
export function normalizeShweBetAmount(rawAmount: number, rawBetCount: number = 1): { amount: number; betCount: number; total: number } {
  const total = Math.max(10, Math.round((Number(rawAmount) || 10) * (Number(rawBetCount) || 1)));
  if (total >= 10000 && total % 10000 === 0) {
    return { amount: 10000, betCount: Math.max(1, Math.floor(total / 10000)), total };
  } else if (total >= 1000 && total % 1000 === 0) {
    return { amount: 1000, betCount: Math.max(1, Math.floor(total / 1000)), total };
  } else if (total >= 100 && total % 100 === 0) {
    return { amount: 100, betCount: Math.max(1, Math.floor(total / 100)), total };
  } else {
    const count = Math.max(1, Math.round(total / 10));
    return { amount: 10, betCount: count, total: count * 10 };
  }
}

// Calculate step stake supporting both Martingale multiplier and Custom Sequence (e.g. 20, 40, 60, 80, 160, 320, 640, 1280)
export function calculateStepStake(
  lossCount: number,
  mode: 'MARTINGALE' | 'CUSTOM_SEQUENCE',
  baseAmount: number,
  multiplier: number,
  sequence: number[]
): number {
  if (mode === 'CUSTOM_SEQUENCE' && Array.isArray(sequence) && sequence.length > 0) {
    if (lossCount < sequence.length) {
      return sequence[lossCount];
    }
    const last = sequence[sequence.length - 1];
    const overflow = lossCount - (sequence.length - 1);
    return Math.round(last * Math.pow(2, overflow));
  }
  if (lossCount === 0) return baseAmount;
  return Math.round(baseAmount * Math.pow(multiplier, lossCount));
}

// Streak detector for Wait Bot (Dragon Hunter)
export function getConsecutiveStreak(draws: WingoDraw[]): {
  count: number;
  size: 'BIG' | 'SMALL' | null;
  opposite: 'BIG' | 'SMALL' | null;
} {
  if (!draws || draws.length === 0) {
    return { count: 0, size: null, opposite: null };
  }
  const firstSize = draws[0].size;
  if (firstSize !== 'BIG' && firstSize !== 'SMALL') {
    return { count: 0, size: null, opposite: null };
  }
  let count = 0;
  for (const draw of draws) {
    if (draw.size === firstSize) {
      count++;
    } else {
      break;
    }
  }
  const opposite: 'BIG' | 'SMALL' = firstSize === 'BIG' ? 'SMALL' : 'BIG';
  return { count, size: firstSize, opposite };
}

// Duration formatting (HH:MM:SS or MM:SS)
function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export const PlayableGameStation: React.FC<PlayableGameStationProps> = ({
  currentPeriod,
  secondsLeft,
  history,
  prediction,
  account,
  selectedTypeId,
  onChangeTypeId,
  onRefreshSession,
  onRefreshLogin,
  aiAlgorithm = 'HMM',
  onChangeAiAlgorithm,
  methodStats,
  isAutoSwitchEnabled = true,
  onToggleAutoSwitch,
  autoSwitchEvent,
  methodPredictions,
  onAutoMonitoringChange,
  onAutoBetActiveChange,
  activeFormula,
  pendingFormula,
  onFormulaConsumed,
  onApplyFormula: externalApplyFormula,
  bettingEngineMode = 'METHODS_7_MODE',
  onSelectMode,
  autoBetTrigger,
  sniperLockedAlgo: externalSniperLockedAlgo,
  onSniperLockedAlgoChange,
  sevenMethodLockedAlgo: externalSevenMethodLockedAlgo,
  onSevenMethodLockedAlgoChange,
  soundEnabled = true,
}) => {
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // User Balance (synchronized with ShweLottery account)
  const initialBalance = parseFloat(account.amount?.replace(/,/g, '') || '1000') || 1000;
  const [userBalance, setUserBalance] = useState<number>(initialBalance);

  // Sync balance with account updates
  useEffect(() => {
    if (account.amount) {
      const parsed = parseFloat(account.amount.replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        setUserBalance(parsed);
      }
    }
  }, [account.amount]);

  // Fetch real live balance directly from backend gateway
  const fetchRealLiveBalance = async () => {
    try {
      const res = await fetch('/api/shwelottery/balance');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.realBalance === 'number') {
          setUserBalance(data.realBalance);
        }
      }
    } catch (err) {
      // Graceful retry on transient network glitch or dev server restart
      console.warn('Real balance sync retry:', err);
    }
  };

  useEffect(() => {
    fetchRealLiveBalance();
    const balInterval = setInterval(fetchRealLiveBalance, 6000);
    return () => clearInterval(balInterval);
  }, []);

  // ==========================================
  // AUTO BET ONLY STATE & PROGRESSION (MARTINGALE & CUSTOM SEQUENCE)
  // ==========================================
  const [isAutoBetActive, setIsAutoBetActive] = useState<boolean>(false);

  // Progression Mode: 'CUSTOM_SEQUENCE' (User's custom steps e.g. 20, 40, 60, 80, 160, 320, 640, 1280) vs 'MARTINGALE' (Multiplier)
  const [progressionMode, setProgressionMode] = useState<'MARTINGALE' | 'CUSTOM_SEQUENCE'>(() => {
    try {
      const saved = localStorage.getItem('shwe_progression_mode');
      if (saved === 'MARTINGALE' || saved === 'CUSTOM_SEQUENCE') return saved;
    } catch {}
    return 'CUSTOM_SEQUENCE';
  });

  // User-defined custom step sequence (e.g. 20, 40, 60, 80, 160, 320, 640, 1280)
  const [customSequence, setCustomSequence] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('shwe_custom_bet_sequence');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [20, 40, 60, 80, 160, 320, 640, 1280];
  });

  const [customSequenceInput, setCustomSequenceInput] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('shwe_custom_bet_sequence');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.join(', ');
      }
    } catch {}
    return '20, 40, 60, 80, 160, 320, 640, 1280';
  });

  const [autoMultiplierMode, setAutoMultiplierMode] = useState<number>(2); // 2X, 3X, custom
  const [isCustomMultiplier, setIsCustomMultiplier] = useState<boolean>(false);
  const [customMultiplierInput, setCustomMultiplierInput] = useState<string>('2.5');

  const [autoBaseAmount, setAutoBaseAmount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('shwe_custom_bet_sequence');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      }
    } catch {}
    return 20;
  });
  const [isCustomBaseAmount, setIsCustomBaseAmount] = useState<boolean>(false);
  const [customBaseAmountInput, setCustomBaseAmountInput] = useState<string>('20');

  const [consecutiveLosses, setConsecutiveLosses] = useState<number>(0);
  const [currentAutoStake, setCurrentAutoStake] = useState<number>(20);
  const [autoStrategy, setAutoStrategy] = useState<'AI_GUESS' | 'WAIT_BOT' | 'SNIPER_4LOSS' | 'SNIPER_5LOSS' | 'SNIPER_6LOSS'>('AI_GUESS');
  const [autoWins, setAutoWins] = useState<number>(0);
  const [autoLosses, setAutoLosses] = useState<number>(0);
  const [autoProfit, setAutoProfit] = useState<number>(0);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);

  // ==========================================
  // LIVE TIMER: AUTO BOT START TO TARGET PROFIT
  // ==========================================
  const [botStartTime, setBotStartTime] = useState<number | null>(null);
  const [botElapsedSeconds, setBotElapsedSeconds] = useState<number>(0);
  const [targetProfitDuration, setTargetProfitDuration] = useState<number | null>(null);

  // Wait Bot Streak Settings
  const [waitStreakThreshold, setWaitStreakThreshold] = useState<number>(5);
  const [waitBotStatus, setWaitBotStatus] = useState<'WAITING' | 'BETTING'>('WAITING');
  const [waitBotTarget, setWaitBotTarget] = useState<'BIG' | 'SMALL' | null>(null);

  // 6-Loss Sniper Wait & Strike Bot Settings
  const [sniperBotStatus, setSniperBotStatus] = useState<'WAITING' | 'STRIKING'>('WAITING');
  const [sniperLockedAlgo, setSniperLockedAlgo] = useState<AlgorithmType | null>(null);

  // 7-Method 1-Loss Highest Lose Rate Lock Bot Setting (Locks onto highest lose rate method on 1 loss until win)
  const [sevenMethodLockedAlgo, setSevenMethodLockedAlgo] = useState<AlgorithmType | null>(externalSevenMethodLockedAlgo || null);

  // Win Stop & Lose Stop Configuration
  const [winStopEnabled, setWinStopEnabled] = useState<boolean>(true);
  const [winStopAmount, setWinStopAmount] = useState<number>(1000);
  const [winStopInput, setWinStopInput] = useState<string>('1000');

  const [loseStopEnabled, setLoseStopEnabled] = useState<boolean>(true);
  const [loseStopAmount, setLoseStopAmount] = useState<number>(1000);
  const [loseStopInput, setLoseStopInput] = useState<string>('1000');

  const [stopReason, setStopReason] = useState<'WIN_STOP' | 'LOSE_STOP' | 'INSUFFICIENT_BALANCE' | null>(null);

  // Nan Stop Auto Bet (Custom Auto Restart after Win Profit, default 1m 35s = 95s)
  const [nonStopAutoBet, setNonStopAutoBet] = useState<boolean>(false);
  const [nonStopCountdown, setNonStopCountdown] = useState<number | null>(null);
  const [nonStopWaitSeconds, setNonStopWaitSeconds] = useState<number>(95);
  const [customWaitInput, setCustomWaitInput] = useState<string>('95');

  // Synchronize internal autoStrategy when bettingEngineMode changes from parent / outside
  useEffect(() => {
    if (bettingEngineMode === 'SNIPER_4LOSS_MODE') {
      setAutoStrategy('SNIPER_4LOSS');
    } else if (bettingEngineMode === 'SNIPER_5LOSS_MODE') {
      setAutoStrategy('SNIPER_5LOSS');
    } else if (bettingEngineMode === 'SNIPER_6LOSS_MODE') {
      setAutoStrategy('SNIPER_6LOSS');
    } else if (bettingEngineMode === 'METHODS_7_MODE') {
      if (autoStrategy === 'SNIPER_4LOSS' || autoStrategy === 'SNIPER_5LOSS' || autoStrategy === 'SNIPER_6LOSS') {
        setAutoStrategy('AI_GUESS');
      }
    }
  }, [bettingEngineMode]);

  // Synchronize external sniper locked algo if provided
  useEffect(() => {
    if (externalSniperLockedAlgo && (bettingEngineMode === 'SNIPER_4LOSS_MODE' || bettingEngineMode === 'SNIPER_5LOSS_MODE' || bettingEngineMode === 'SNIPER_6LOSS_MODE')) {
      setSniperLockedAlgo(externalSniperLockedAlgo);
      sniperLockedAlgoRef.current = externalSniperLockedAlgo;
      setSniperBotStatus('STRIKING');
      sniperBotStatusRef.current = 'STRIKING';
    }
  }, [externalSniperLockedAlgo, bettingEngineMode]);

  // Synchronize external 7-method locked algo
  useEffect(() => {
    if (externalSevenMethodLockedAlgo !== undefined) {
      setSevenMethodLockedAlgo(externalSevenMethodLockedAlgo);
      sevenMethodLockedAlgoRef.current = externalSevenMethodLockedAlgo;
    }
  }, [externalSevenMethodLockedAlgo]);

  // Handle external Auto Bet Start Trigger (from Sniper Panel, Floating Predator, or Alarm Banners)
  useEffect(() => {
    if (autoBetTrigger) {
      const mode = autoBetTrigger.mode;
      const threshold: 4 | 5 | 6 = autoBetTrigger.threshold || (mode === 'SNIPER_4LOSS_MODE' ? 4 : mode === 'SNIPER_6LOSS_MODE' ? 6 : 5);
      
      onSelectMode?.(mode);
      if (mode === 'SNIPER_4LOSS_MODE') {
        setAutoStrategy('SNIPER_4LOSS');
      } else if (mode === 'SNIPER_6LOSS_MODE') {
        setAutoStrategy('SNIPER_6LOSS');
      } else if (mode === 'SNIPER_5LOSS_MODE') {
        setAutoStrategy('SNIPER_5LOSS');
      }

      setStopReason(null);
      setNonStopCountdown(null);
      lastAutoBetPeriodRef.current = '';
      setIsAutoBetActive(true);

      const now = Date.now();
      setBotStartTime(now);
      botStartTimeRef.current = now;
      setBotElapsedSeconds(0);
      setTargetProfitDuration(null);

      // User requirement: Win ဖြစ်ခဲ့လျှင် နောက်ထပ် Method အရ ချက်ချင်းထပ်ပြန် bet ခဲ့ရလျှင်လည်း user သတ်မှတ်ပေးထားသော base bet အတိုင်း step 1(base stake)မှသာလျှင်ပြန် bet စေပါ
      consecutiveLossesRef.current = 0;
      setConsecutiveLosses(0);
      setCurrentAutoStake(autoBaseAmount);

      const evalResult = methodStats ? evaluateAllMethodsLossStreaks(methodStats, threshold) : null;
      const readyList = threshold === 4 ? evalResult?.readyMethods4 : threshold === 6 ? evalResult?.readyMethods6 : evalResult?.readyMethods5;

      if (readyList && readyList.length > 0) {
        const target = readyList[0];
        const multiNote = readyList.length > 1
          ? ` (Method ${readyList.length} မျိုးအနက် Lose Rate ${target.loseRate}% အများဆုံးဖြစ်သဖြင့် Main အဖြစ် Lock)`
          : ` (Lose Rate: ${target.loseRate}%)`;
        setSniperBotStatus('STRIKING');
        sniperBotStatusRef.current = 'STRIKING';
        setSniperLockedAlgo(target.algorithm);
        sniperLockedAlgoRef.current = target.algorithm;
        onSniperLockedAlgoChange?.(target.algorithm);
        if (threshold === 4) {
          try { playStartBettingVoice(); } catch {}
          setAutoFeedback(`🚨 [START BET ACTIVE] "HEY! NOW I AM START BETTING" Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win မဖြစ်မချင်း Step 1 (K ${autoBaseAmount.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`);
        } else {
          try { playSniperStrikeSound(); } catch {}
          setAutoFeedback(`🎯 [${threshold}-LOSS SNIPER STRIKE ACTIVE] Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win မဖြစ်မချင်း Step 1 (K ${autoBaseAmount.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`);
        }
      } else {
        setSniperBotStatus('WAITING');
        sniperBotStatusRef.current = 'WAITING';
        setSniperLockedAlgo(null);
        sniperLockedAlgoRef.current = null;
        onSniperLockedAlgoChange?.(null);
        const maxLoss = evalResult?.highestLossCount || 0;
        const maxAlgo = evalResult?.highestLossAlgo;
        setAutoFeedback(`🎯 [${threshold}-Loss Sniper စောင့်ဆိုင်းနေပါသည်] ${threshold} ကြိမ် ဆက်တိုက်ရှုံးသော Method ကို စောင့်နေပါသည်... (လက်ရှိ အများဆုံးရှုံး: [${maxAlgo || 'Scanning'}] ${maxLoss}/${threshold} ကြိမ်) • ${threshold} ကြိမ် ပြည့်ပါက Step 1 မူလငွေဖြင့် အလိုအလျောက် စတင်လောင်းပါမည်။`);
      }
    }
  }, [autoBetTrigger]);

  // Modal Dialog states for Settings & Risk Management
  const [isBetSettingsModalOpen, setIsBetSettingsModalOpen] = useState<boolean>(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Synchronous refs
  const nonStopAutoBetRef = useRef(nonStopAutoBet);
  const nonStopWaitSecondsRef = useRef(nonStopWaitSeconds);
  const winStopEnabledRef = useRef(winStopEnabled);
  const winStopAmountRef = useRef(winStopAmount);
  const loseStopEnabledRef = useRef(loseStopEnabled);
  const loseStopAmountRef = useRef(loseStopAmount);
  const autoBaseAmountRef = useRef(autoBaseAmount);
  const autoMultiplierModeRef = useRef(autoMultiplierMode);
  const consecutiveLossesRef = useRef<number>(consecutiveLosses);
  const autoStrategyRef = useRef(autoStrategy);
  const waitStreakThresholdRef = useRef(waitStreakThreshold);
  const waitBotStatusRef = useRef(waitBotStatus);
  const waitBotTargetRef = useRef(waitBotTarget);
  const sniperBotStatusRef = useRef<'WAITING' | 'STRIKING'>(sniperBotStatus);
  const sniperLockedAlgoRef = useRef<AlgorithmType | null>(sniperLockedAlgo);
  const sevenMethodLockedAlgoRef = useRef<AlgorithmType | null>(sevenMethodLockedAlgo);
  const botStartTimeRef = useRef(botStartTime);
  const lastAutoBetPeriodRef = useRef<string>('');
  const prevHistoryPeriodRef = useRef<string>('');

  const autoProfitRef = useRef(autoProfit);
  const prevIsAutoBetActiveRef = useRef<boolean>(isAutoBetActive);
  const activeBetsRef = useRef<ActiveBet[]>(activeBets);

  useEffect(() => {
    activeBetsRef.current = activeBets;
  }, [activeBets]);

  useEffect(() => {
    autoProfitRef.current = autoProfit;
  }, [autoProfit]);

  useEffect(() => {
    if (prevIsAutoBetActiveRef.current !== isAutoBetActive) {
      prevIsAutoBetActiveRef.current = isAutoBetActive;
      onAutoBetActiveChange?.(isAutoBetActive);
    }
  }, [isAutoBetActive, onAutoBetActiveChange]);

  const progressionModeRef = useRef<'MARTINGALE' | 'CUSTOM_SEQUENCE'>(progressionMode);
  const customSequenceRef = useRef<number[]>(customSequence);

  useEffect(() => {
    progressionModeRef.current = progressionMode;
  }, [progressionMode]);

  useEffect(() => {
    customSequenceRef.current = customSequence;
  }, [customSequence]);

  useEffect(() => {
    winStopEnabledRef.current = winStopEnabled;
    winStopAmountRef.current = winStopAmount;
    loseStopEnabledRef.current = loseStopEnabled;
    loseStopAmountRef.current = loseStopAmount;
    autoBaseAmountRef.current = autoBaseAmount;
    autoMultiplierModeRef.current = autoMultiplierMode;
    autoStrategyRef.current = autoStrategy;
    waitStreakThresholdRef.current = waitStreakThreshold;
    waitBotStatusRef.current = waitBotStatus;
    waitBotTargetRef.current = waitBotTarget;
    sniperBotStatusRef.current = sniperBotStatus;
    sniperLockedAlgoRef.current = sniperLockedAlgo;
    sevenMethodLockedAlgoRef.current = sevenMethodLockedAlgo;
    botStartTimeRef.current = botStartTime;
    progressionModeRef.current = progressionMode;
    customSequenceRef.current = customSequence;
  }, [winStopEnabled, winStopAmount, loseStopEnabled, loseStopAmount, autoBaseAmount, autoMultiplierMode, autoStrategy, waitStreakThreshold, waitBotStatus, waitBotTarget, sniperBotStatus, sniperLockedAlgo, sevenMethodLockedAlgo, botStartTime, progressionMode, customSequence]);

  useEffect(() => {
    nonStopAutoBetRef.current = nonStopAutoBet;
  }, [nonStopAutoBet]);

  useEffect(() => {
    nonStopWaitSecondsRef.current = nonStopWaitSeconds;
  }, [nonStopWaitSeconds]);

  // Synchronize state with parent
  useEffect(() => {
    onAutoMonitoringChange?.({
      isActive: isAutoBetActive,
      autoProfit,
      autoWins,
      autoLosses,
      currentAutoStake,
      autoBaseAmount,
      consecutiveLosses,
      autoMultiplierMode,
      winStopEnabled,
      winStopAmount,
      loseStopEnabled,
      loseStopAmount,
      stopReason,
      autoStrategy,
      startTime: botStartTime,
      elapsedSeconds: botElapsedSeconds,
      targetReachedDuration: targetProfitDuration,
      nonStopAutoBet,
      nonStopCountdown,
      nonStopWaitSeconds,
      progressionMode,
      customSequence
    });
  }, [isAutoBetActive, autoProfit, autoWins, autoLosses, currentAutoStake, autoBaseAmount, consecutiveLosses, autoMultiplierMode, winStopEnabled, winStopAmount, loseStopEnabled, loseStopAmount, stopReason, autoStrategy, botStartTime, botElapsedSeconds, targetProfitDuration, nonStopAutoBet, nonStopCountdown, nonStopWaitSeconds, progressionMode, customSequence]);

  // Live timer tick for Auto Bot
  useEffect(() => {
    let timer: any = null;
    if (isAutoBetActive && botStartTime && stopReason !== 'WIN_STOP') {
      timer = setInterval(() => {
        setBotElapsedSeconds(Math.floor((Date.now() - botStartTime) / 1000));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAutoBetActive, botStartTime, stopReason]);

  // Nan Stop Auto Bet countdown tick: uses custom user-configured wait time (default 95 seconds)
  useEffect(() => {
    let timer: any = null;
    if (nonStopAutoBet && stopReason === 'WIN_STOP' && nonStopCountdown !== null && nonStopCountdown > 0) {
      timer = setInterval(() => {
        setNonStopCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timer);
            setTimeout(() => {
              handleRestartAutoBot();
              const waitSec = nonStopWaitSecondsRef.current || 95;
              const m = Math.floor(waitSec / 60);
              const s = waitSec % 60;
              const formatted = m > 0 ? `${m} မိနစ် ${s > 0 ? `${s} စက္ကန့်` : ''}` : `${s} စက္ကန့်`;
              setAutoFeedback(`⚡ [Nan Stop Auto Bet] သတ်မှတ်စောင့်ဆိုင်းချိန် ${formatted} (${waitSec}s) ပြည့်ပါသဖြင့် Auto Bet စနစ် အလိုအလျောက် ပြန်လည်စတင်လိုက်ပါပြီ!`);
            }, 0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [nonStopAutoBet, stopReason, nonStopCountdown]);

  // Recalculate current auto stake when base amount, multiplier, progression mode, or custom sequence changes
  useEffect(() => {
    const nextStake = calculateStepStake(
      consecutiveLosses,
      progressionMode,
      autoBaseAmount,
      autoMultiplierMode,
      customSequence
    );
    setCurrentAutoStake(nextStake);
  }, [autoBaseAmount, autoMultiplierMode, consecutiveLosses, progressionMode, customSequence]);

  // Custom Sequence Handlers
  const handleUpdateCustomSequence = (rawText: string) => {
    setCustomSequenceInput(rawText);
    const parsed = rawText
      .split(/[\s,;]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      setCustomSequence(parsed);
      setAutoBaseAmount(parsed[0]);
      if (consecutiveLosses === 0) {
        setCurrentAutoStake(parsed[0]);
      }
      try {
        localStorage.setItem('shwe_custom_bet_sequence', JSON.stringify(parsed));
      } catch {}
    }
  };

  const handleSelectProgressionMode = (mode: 'MARTINGALE' | 'CUSTOM_SEQUENCE') => {
    setProgressionMode(mode);
    try {
      localStorage.setItem('shwe_progression_mode', mode);
    } catch {}
    const newStake = calculateStepStake(
      consecutiveLosses,
      mode,
      autoBaseAmount,
      autoMultiplierMode,
      customSequence
    );
    setCurrentAutoStake(newStake);
  };

  // Reset Session
  const handleResetAutoSession = () => {
    setAutoWins(0);
    setAutoLosses(0);
    setAutoProfit(0);
    consecutiveLossesRef.current = 0;
    setConsecutiveLosses(0);
    const resetStake = calculateStepStake(
      0,
      progressionMode,
      autoBaseAmount,
      autoMultiplierMode,
      customSequence
    );
    setCurrentAutoStake(resetStake);
    setStopReason(null);
    setWaitBotStatus('WAITING');
    waitBotStatusRef.current = 'WAITING';
    setWaitBotTarget(null);
    waitBotTargetRef.current = null;
    setSniperBotStatus('WAITING');
    sniperBotStatusRef.current = 'WAITING';
    setSniperLockedAlgo(null);
    sniperLockedAlgoRef.current = null;
    setSevenMethodLockedAlgo(null);
    sevenMethodLockedAlgoRef.current = null;
    onSevenMethodLockedAlgoChange?.(null);
    setBotStartTime(null);
    setBotElapsedSeconds(0);
    setTargetProfitDuration(null);
    setNonStopCountdown(null);
    setAutoFeedback('Auto Bot စာရင်းနှင့် Timer ကို အသစ်ပြန်လည်စတင်လိုက်ပါပြီ။');
  };

  // Restart Auto Bot
  const handleRestartAutoBot = () => {
    setAutoProfit(0);
    consecutiveLossesRef.current = 0;
    setConsecutiveLosses(0);
    setCurrentAutoStake(autoBaseAmount);
    setStopReason(null);
    setNonStopCountdown(null);
    setWaitBotStatus('WAITING');
    waitBotStatusRef.current = 'WAITING';
    setWaitBotTarget(null);
    waitBotTargetRef.current = null;
    setSniperBotStatus('WAITING');
    sniperBotStatusRef.current = 'WAITING';
    setSniperLockedAlgo(null);
    sniperLockedAlgoRef.current = null;
    setSevenMethodLockedAlgo(null);
    sevenMethodLockedAlgoRef.current = null;
    onSevenMethodLockedAlgoChange?.(null);
    
    const now = Date.now();
    setBotStartTime(now);
    botStartTimeRef.current = now;
    setBotElapsedSeconds(0);
    setTargetProfitDuration(null);
    setIsAutoBetActive(true);

    if (autoStrategyRef.current === 'WAIT_BOT') {
      setAutoFeedback(`🔄 Wait Bot စတင်ပါပြီ! ကြီး/ငယ် ${waitStreakThresholdRef.current} ကြိမ် ပြည့်လျှင် ဆန့်ကျင်ဘက်ကို win ဖြစ်သည်အထိ စတင်လောင်းပါမည်။`);
    } else if (
      autoStrategyRef.current === 'SNIPER_4LOSS' ||
      bettingEngineMode === 'SNIPER_4LOSS_MODE'
    ) {
      setAutoFeedback(`🎯 [4-Loss Sniper Bot စတင်ပါပြီ!] Method ၇ မျိုးထဲမှ ၄ ကြိမ်ဆက်တိုက်ရှုံးသော Method ကို စတင်စောင့်ဆိုင်းနေပါသည် (၄ ကြိမ်ရှုံးပါက "HEY! NOW I AM START BETTING" အချက်ပြကာ စတင်လောင်းပါမည်)...`);
    } else if (
      autoStrategyRef.current === 'SNIPER_5LOSS' ||
      bettingEngineMode === 'SNIPER_5LOSS_MODE'
    ) {
      setAutoFeedback(`🎯 [5-Loss Sniper Bot စတင်ပါပြီ!] Method ၇ မျိုးထဲမှ ၅ ကြိမ်ဆက်တိုက်ရှုံးသော Method ကို စတင်စောင့်ဆိုင်းနေပါသည် (၃ ကြိမ်ရှုံးလျှင် "I found 3 lose method" အသံမြည်ပါမည်)...`);
    } else if (
      autoStrategyRef.current === 'SNIPER_6LOSS' ||
      bettingEngineMode === 'SNIPER_6LOSS_MODE'
    ) {
      setAutoFeedback(`🎯 [6-Loss Sniper Bot စတင်ပါပြီ!] Method ၇ မျိုးထဲမှ ၆ ကြိမ်ဆက်တိုက်ရှုံးသော Method ကို စတင်စောင့်ဆိုင်းနေပါသည်...`);
    } else {
      setAutoFeedback(`🔄 Auto Bot အသစ်စတင်ပါပြီ! စတင်လောင်းကြေး K ${autoBaseAmount.toLocaleString()} MMK (${autoMultiplierMode}× ဆတိုး) ဖြင့် Timer စတင်ပါပြီ။`);
    }
  };

  // Function to apply AI Formula and start Auto Bet
  const applyFormulaToAutoBet = (targetFormula: AiFormula) => {
    setAutoBaseAmount(targetFormula.recommendedBaseStake);
    setAutoMultiplierMode(targetFormula.recommendedMultiplier);
    setAutoStrategy(targetFormula.recommendedStrategy);
    setWinStopAmount(targetFormula.recommendedWinStop);
    setWinStopInput(String(targetFormula.recommendedWinStop));
    if (targetFormula.winStopEnabled !== undefined) {
      setWinStopEnabled(targetFormula.winStopEnabled);
    }
    setLoseStopAmount(targetFormula.recommendedLoseStop);
    setLoseStopInput(String(targetFormula.recommendedLoseStop));
    if (targetFormula.loseStopEnabled !== undefined) {
      setLoseStopEnabled(targetFormula.loseStopEnabled);
    }
    onChangeAiAlgorithm?.(targetFormula.recommendedMethod);
    onSelectMode?.('FORMULA_MODE');

    // Reset loss counters and start auto bot
    consecutiveLossesRef.current = 0;
    setConsecutiveLosses(0);
    setCurrentAutoStake(targetFormula.recommendedBaseStake);
    setStopReason(null);
    setNonStopCountdown(null);

    const now = Date.now();
    setBotStartTime(now);
    botStartTimeRef.current = now;
    setBotElapsedSeconds(0);
    setTargetProfitDuration(null);
    setIsAutoBetActive(true);

    try {
      playRadarLockSound();
    } catch {}

    const winTxt = targetFormula.winStopEnabled === false ? 'OFF' : `+K ${targetFormula.recommendedWinStop.toLocaleString()}`;
    const loseTxt = targetFormula.loseStopEnabled === false ? 'OFF' : `-K ${targetFormula.recommendedLoseStop.toLocaleString()}`;

    setAutoFeedback(
      `🎮 [10-MIN FORMULA အတိုင်း ကစားခြင်း] ${targetFormula.burmeseTitle} စနစ်ဖြင့် ${targetFormula.recommendedMethod} (စတင်ကြေး: K ${targetFormula.recommendedBaseStake.toLocaleString()} • ${targetFormula.recommendedMultiplier}× ဆတိုး • Win Stop: ${winTxt} • Lose Stop: ${loseTxt}) Auto Bot စတင်လောင်းပါပြီ!`
    );
  };

  // Listen for pendingFormula passed from parent
  useEffect(() => {
    if (pendingFormula) {
      applyFormulaToAutoBet(pendingFormula);
      onFormulaConsumed?.();
    }
  }, [pendingFormula]);

  // Master Toggle Button for Auto Bet
  const handleToggleAutoBet = () => {
    const nextState = !isAutoBetActive;
    if (nextState) {
      if (
        stopReason === 'LOSE_STOP' || 
        stopReason === 'WIN_STOP' ||
        (winStopEnabled && winStopAmount > 0 && autoProfit >= winStopAmount) ||
        (loseStopEnabled && loseStopAmount > 0 && autoProfit <= -loseStopAmount)
      ) {
        handleRestartAutoBot();
        return;
      }

      setStopReason(null);
      setNonStopCountdown(null);
      lastAutoBetPeriodRef.current = '';
      setIsAutoBetActive(true);

      const now = Date.now();
      setBotStartTime(now);
      botStartTimeRef.current = now;
      setBotElapsedSeconds(0);
      setTargetProfitDuration(null);

      // User requirement: Win ဖြစ်ခဲ့လျှင် နောက်ထပ် Method အရ ချက်ချင်းထပ်ပြန် bet ခဲ့ရလျှင်လည်း user သတ်မှတ်ပေးထားသော base bet အတိုင်း step 1(base stake)မှသာလျှင်ပြန် bet စေပါ
      consecutiveLossesRef.current = 0;
      setConsecutiveLosses(0);
      setCurrentAutoStake(autoBaseAmount);

      const isSniperActive = 
        bettingEngineMode === 'SNIPER_4LOSS_MODE' || 
        bettingEngineMode === 'SNIPER_5LOSS_MODE' || 
        bettingEngineMode === 'SNIPER_6LOSS_MODE' || 
        autoStrategy === 'SNIPER_4LOSS' || 
        autoStrategy === 'SNIPER_6LOSS' || 
        autoStrategy === 'SNIPER_5LOSS';

      if (isSniperActive) {
        const threshold: 4 | 5 | 6 = (bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS')
          ? 4
          : (bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS')
          ? 6
          : 5;
        const evalResult = methodStats ? evaluateAllMethodsLossStreaks(methodStats, threshold) : null;
        const readyList = threshold === 4 ? evalResult?.readyMethods4 : threshold === 6 ? evalResult?.readyMethods6 : evalResult?.readyMethods5;

        if (readyList && readyList.length > 0) {
          const target = readyList[0];
          const multiNote = readyList.length > 1
            ? ` (Method ${readyList.length} မျိုးအနက် Lose Rate ${target.loseRate}% အများဆုံးဖြစ်သဖြင့် Main အဖြစ် Lock)`
            : ` (Lose Rate: ${target.loseRate}%)`;
          setSniperBotStatus('STRIKING');
          sniperBotStatusRef.current = 'STRIKING';
          setSniperLockedAlgo(target.algorithm);
          sniperLockedAlgoRef.current = target.algorithm;
          onSniperLockedAlgoChange?.(target.algorithm);
          if (threshold === 4) {
            try { playStartBettingVoice(); } catch {}
            setAutoFeedback(`🚨 [START BET ACTIVE] "HEY! NOW I AM START BETTING" Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win မဖြစ်မချင်း Step 1 (K ${autoBaseAmount.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`);
          } else {
            try { playSniperStrikeSound(); } catch {}
            setAutoFeedback(`🎯 [${threshold}-LOSS SNIPER STRIKE ACTIVE] Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win မဖြစ်မချင်း Step 1 (K ${autoBaseAmount.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`);
          }
        } else {
          setSniperBotStatus('WAITING');
          sniperBotStatusRef.current = 'WAITING';
          setSniperLockedAlgo(null);
          sniperLockedAlgoRef.current = null;
          onSniperLockedAlgoChange?.(null);
          const maxLoss = evalResult?.highestLossCount || 0;
          const maxAlgo = evalResult?.highestLossAlgo;
          setAutoFeedback(`🎯 [${threshold}-Loss Sniper စောင့်ဆိုင်းနေပါသည်] ${threshold} ကြိမ် ဆက်တိုက်ရှုံးသော Method ကို စောင့်နေပါသည်... (လက်ရှိ အများဆုံးရှုံး: [${maxAlgo || 'Scanning'}] ${maxLoss}/${threshold} ကြိမ်) • ${threshold} ကြိမ် ပြည့်ပါက Step 1 မူလငွေဖြင့် အလိုအလျောက် စတင်လောင်းပါမည်။`);
        }
      } else {
        setAutoFeedback(`⚡ Auto Bet စတင်ဖွင့်လှစ်လိုက်ပါပြီ! စတင်ငွေ K ${autoBaseAmount.toLocaleString()} MMK၊ ${autoMultiplierMode}× ဆတိုး၊ Target Profit Timer စတင်ရေတွက်ပါပြီ။`);
      }
    } else {
      setIsAutoBetActive(false);
      setNonStopCountdown(null);
      setSevenMethodLockedAlgo(null);
      sevenMethodLockedAlgoRef.current = null;
      onSevenMethodLockedAlgoChange?.(null);
      setAutoFeedback('Auto Bet ကို ခေတ္တရပ်တန့်လိုက်ပါပြီ။');
    }
  };

  // ==========================================
  // 1. DRAW EVALUATION ENGINE (RUNS FIRST SYNCHRONOUSLY ON EVERY DRAW)
  // ==========================================
  useEffect(() => {
    const latestDraw = history[0];
    if (!latestDraw) return;

    // Settle any pending bets whose target draw has arrived in history
    const pendingBets = activeBetsRef.current.filter(
      (b) => b.status === 'PENDING' && history.some((d) => d.period === b.period)
    );

    if (pendingBets.length === 0 && latestDraw.period === prevHistoryPeriodRef.current) {
      return;
    }

    prevHistoryPeriodRef.current = latestDraw.period;
    fetchRealLiveBalance();

    if (pendingBets.length === 0) return;

    let runningProfit = autoProfitRef.current;
    let anyWon = false;
    let anyLost = false;
    let lastNetGain = 0;
    let lastBetPeriod = '';

    // Synchronously map active bets
    const updatedBets = activeBetsRef.current.map((bet) => {
      if (bet.status === 'PENDING') {
        const matchedDraw = history.find((d) => d.period === bet.period);
        if (matchedDraw) {
          const won = bet.selection === matchedDraw.size;
          const payoutRate = 1.98;
          const payout = won ? Math.round(bet.total * payoutRate) : 0;
          lastBetPeriod = bet.period;

          if (won) {
            anyWon = true;
            const netGain = payout - bet.total;
            lastNetGain = netGain;
            runningProfit += netGain;
            setUserBalance((b) => b + payout);
            setAutoWins((w) => w + 1);
          } else {
            anyLost = true;
            const lossAmount = bet.total;
            runningProfit -= lossAmount;
            setAutoLosses((l) => l + 1);
          }

          return { ...bet, status: won ? ('WON' as const) : ('LOST' as const), payout };
        }
      }
      return bet;
    });

    // Commit updated bets to ref and state immediately
    activeBetsRef.current = updatedBets;
    setActiveBets(updatedBets);
    autoProfitRef.current = runningProfit;
    setAutoProfit(runningProfit);

    // ==========================================
    // WIN EVALUATION: STRICT STEP 1 RESET GUARANTEE
    // ==========================================
    if (anyWon) {
      if (soundEnabledRef.current) {
        try { playYouWinVoice(); } catch {}
      }

      // CRITICAL FIX FOR SCREENSHOT BUG:
      // "user win ဖြစ်ပြီးတာနဲ့ နောက်တစ်ကြိမ် bet တဲ့ အခါ step 1 ( base stake) သို့ပြန်လည်သတ်မှတ် bet ရပါမည်"
      consecutiveLossesRef.current = 0;
      setConsecutiveLosses(0);
      const resetStake = calculateStepStake(
        0,
        progressionModeRef.current,
        autoBaseAmountRef.current,
        autoMultiplierModeRef.current,
        customSequenceRef.current
      );
      setCurrentAutoStake(resetStake);

      const wasSevenMethodLocked = sevenMethodLockedAlgoRef.current !== null;
      const prevSevenMethodLocked = sevenMethodLockedAlgoRef.current;
      if (sevenMethodLockedAlgoRef.current) {
        sevenMethodLockedAlgoRef.current = null;
        setSevenMethodLockedAlgo(null);
        onSevenMethodLockedAlgoChange?.(null);
      }

      // In 7-Method mode: "win ဖြစ်တာနှင့်win rate အမြင့်ဆုံးသို့ Auto ပြန်ချိန်း သော စနစ်သို့ ပြောင်းပါ"
      let switchedToHighestWinAlgo: AlgorithmType | null = null;
      const isSniperActiveOnWin =
        autoStrategyRef.current === 'SNIPER_4LOSS' ||
        autoStrategyRef.current === 'SNIPER_5LOSS' ||
        autoStrategyRef.current === 'SNIPER_6LOSS' ||
        bettingEngineMode === 'SNIPER_4LOSS_MODE' ||
        bettingEngineMode === 'SNIPER_5LOSS_MODE' ||
        bettingEngineMode === 'SNIPER_6LOSS_MODE';

      if (!isSniperActiveOnWin && methodStats) {
        const highestWinAlgo = getHighestWinRateAlgo(methodStats);
        switchedToHighestWinAlgo = highestWinAlgo;
        if (onChangeAiAlgorithm && highestWinAlgo !== aiAlgorithm) {
          onChangeAiAlgorithm(highestWinAlgo);
        }
      }

      if (autoStrategyRef.current === 'WAIT_BOT') {
        setWaitBotStatus('WAITING');
        waitBotStatusRef.current = 'WAITING';
        setWaitBotTarget(null);
        waitBotTargetRef.current = null;
      } else if (isSniperActiveOnWin) {
        setSniperBotStatus('WAITING');
        sniperBotStatusRef.current = 'WAITING';
        setSniperLockedAlgo(null);
        sniperLockedAlgoRef.current = null;
        onSniperLockedAlgoChange?.(null);
      }

      // Target Profit Check
      if (winStopEnabledRef.current && winStopAmountRef.current > 0 && runningProfit >= winStopAmountRef.current) {
        setIsAutoBetActive(false);
        setStopReason('WIN_STOP');

        const durationSecs = botStartTimeRef.current 
          ? Math.floor((Date.now() - botStartTimeRef.current) / 1000)
          : botElapsedSeconds;
        setTargetProfitDuration(durationSecs);
        setBotElapsedSeconds(durationSecs);

        if (soundEnabledRef.current) {
          try { playMyanmarTargetProfitVoice(); } catch {}
        }

        if (nonStopAutoBetRef.current) {
          const waitTime = nonStopWaitSecondsRef.current || 95;
          setNonStopCountdown(waitTime);
          const m = Math.floor(waitTime / 60);
          const s = waitTime % 60;
          const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          const waitDesc = m > 0 ? `${m} မိနစ် ${s > 0 ? `${s} စက္ကန့်` : ''}` : `${s} စက္ကန့်`;
          setAutoFeedback(`🏆 [TARGET PROFIT ပြည့်မီပါပြီ!] သတ်မှတ်အနိုင်ငွေ (+K ${runningProfit.toLocaleString()} MMK) ရရှိပါပြီ! ကြာချိန်: ${formatDuration(durationSecs)} • Nan Stop Auto Bet ဖွင့်ထားသဖြင့် ${waitDesc} (${waitTime}s) အကြာတွင် အလိုအလျောက် ပြန်လည်စတင်ပါမည် (${timeStr})...`);
        } else {
          setAutoFeedback(`🏆 [TARGET PROFIT ပြည့်မီပါပြီ!] သတ်မှတ်အနိုင်ငွေ (+K ${runningProfit.toLocaleString()} MMK / Target: K ${winStopAmountRef.current.toLocaleString()}) ရရှိပါပြီ! ကြာချိန်: ${formatDuration(durationSecs)}`);
        }
        confetti({
          particleCount: 140,
          spread: 90,
          origin: { y: 0.5 }
        });
      } else {
        if (autoStrategyRef.current === 'WAIT_BOT') {
          setAutoFeedback(`🎉 [Wait Bot Win!] ဆန့်ကျင်ဘက် နိုင်ပါသဖြင့် (+K ${lastNetGain.toLocaleString()} MMK) Step 1 မူလစတင်ငွေ K ${resetStake.toLocaleString()} MMK သို့ ပြန်သတ်မှတ်ကာ streak ပြန်လည်စောင့်ဆိုင်းပါမည်!`);
        } else if (isSniperActiveOnWin) {
          setAutoFeedback(`🏆 [SNIPER WIN & PROFIT BANKED!] Locked Method ဖြင့် အနိုင်ရရှိပါသဖြင့် (+K ${lastNetGain.toLocaleString()} MMK) Bet တာချက်ချင်းရပ်တန့်ပြီး အမြတ်သိမ်းဆည်းလိုက်ပါပြီ! နောက်ထပ် Method အရ ထပ်လောင်းလျှင်လည်း Step 1 မူလငွေ (K ${resetStake.toLocaleString()} MMK) မှသာ စတင်လောင်းပါမည်!`);
        } else if (wasSevenMethodLocked && switchedToHighestWinAlgo) {
          const topLabel = methodStats?.[switchedToHighestWinAlgo]?.label || switchedToHighestWinAlgo;
          const topWinRate = methodStats?.[switchedToHighestWinAlgo]?.winRate ?? 50;
          setAutoFeedback(`🏆 [7-METHOD LOCKED WIN & AUTO-SWITCH] Lock Method [${prevSevenMethodLocked}] ဖြင့် အနိုင်ရရှိပါသဖြင့် (+K ${lastNetGain.toLocaleString()} MMK) Lock ကို ဖြုတ်လိုက်ပြီး Win Rate (${topWinRate}%) အမြင့်ဆုံး [${topLabel}] သို့ Auto ပြန်လည်ပြောင်းလဲကာ Step 1 (K ${resetStake.toLocaleString()} MMK) သို့ ပြန်သတ်မှတ်ပါသည်!`);
        } else {
          setAutoFeedback(`🎉 [Auto Bet #${lastBetPeriod ? lastBetPeriod.slice(-5) : 'LIVE'} WIN!] နိုင်ပါသဖြင့် (+K ${lastNetGain.toLocaleString()} MMK) Step 1 မူလစတင်ငွေ K ${resetStake.toLocaleString()} MMK သို့ ချက်ချင်း ပြန်သတ်မှတ်ပြီးပါပြီ!`);
        }
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } else if (anyLost) {
      if (loseStopEnabledRef.current && loseStopAmountRef.current > 0 && runningProfit <= -loseStopAmountRef.current) {
        setIsAutoBetActive(false);
        setStopReason('LOSE_STOP');
        setAutoFeedback(`🛑 [LOSE STOP သတ်မှတ်ချက်!] သတ်မှတ်အရှုံးငွေ (-K ${Math.abs(runningProfit).toLocaleString()} MMK) ရောက်ရှိသဖြင့် Auto Bot ကို ဘေးကင်းစွာ ရပ်တန့်လိုက်ပါပြီ!`);
      } else {
        const nextLosses = consecutiveLossesRef.current + 1;
        consecutiveLossesRef.current = nextLosses;
        setConsecutiveLosses(nextLosses);
        const mult = autoMultiplierModeRef.current;
        const nextStake = calculateStepStake(
          nextLosses,
          progressionModeRef.current,
          autoBaseAmountRef.current,
          mult,
          customSequenceRef.current
        );
        setCurrentAutoStake(nextStake);

        const isSniperActive =
          autoStrategyRef.current === 'SNIPER_4LOSS' ||
          autoStrategyRef.current === 'SNIPER_5LOSS' ||
          autoStrategyRef.current === 'SNIPER_6LOSS' ||
          bettingEngineMode === 'SNIPER_4LOSS_MODE' ||
          bettingEngineMode === 'SNIPER_5LOSS_MODE' ||
          bettingEngineMode === 'SNIPER_6LOSS_MODE';

        const stepText = progressionModeRef.current === 'CUSTOM_SEQUENCE'
          ? `Custom အဆင့်: Step ${nextLosses + 1}/${customSequenceRef.current.length} (K ${nextStake.toLocaleString()} MMK)`
          : `${mult}× ဆတိုး: K ${nextStake.toLocaleString()} MMK (အဆင့်: ${nextLosses + 1})`;

        if (!isSniperActive && methodStats) {
          if (!sevenMethodLockedAlgoRef.current) {
            const targetAlgo = getHighestConsecutiveLossAlgo(methodStats);
            sevenMethodLockedAlgoRef.current = targetAlgo;
            setSevenMethodLockedAlgo(targetAlgo);
            onSevenMethodLockedAlgoChange?.(targetAlgo);
            if (onChangeAiAlgorithm && targetAlgo !== aiAlgorithm) {
              onChangeAiAlgorithm(targetAlgo);
            }
            if (soundEnabledRef.current && bettingEngineMode === 'METHODS_7_MODE') {
              try { playRadarLockSound(); } catch {}
            }
            const targetStats = methodStats[targetAlgo];
            const targetStreak = targetStats?.streak < 0 ? Math.abs(targetStats.streak) : 0;
            const totalT = targetStats ? (targetStats.total || (targetStats.wins + targetStats.losses)) : 0;
            const targetLoseRate = targetStats 
              ? (totalT > 0 ? ((targetStats.losses / totalT) * 100).toFixed(1) : (100 - targetStats.winRate).toFixed(1))
              : '0';
            setAutoFeedback(`⚡ [7-METHOD 1-LOSS AUTO-SWITCH] ၁ ကြိမ် ရှုံးသွားပါသဖြင့် Method ၇ မျိုးထဲမှ လတ်တလော ဆက်တိုက်အကြိမ်ရေ အများဆုံးရှုံးနေသော (${targetStreak} ကြိမ်ဆက်တိုက်ရှုံး • Lose Rate ${targetLoseRate}%) [${targetStats?.label || targetAlgo}] သို့ Auto Switch ပေးပြီး Win မဖြစ်မချင်း Lock ထားပါသည်! (${stepText})`);
          } else {
            const lockedAlgo = sevenMethodLockedAlgoRef.current;
            const targetStats = methodStats[lockedAlgo];
            const targetStreak = targetStats?.streak < 0 ? Math.abs(targetStats.streak) : 0;
            setAutoFeedback(`🔒 [7-METHOD LOCKED HOLD] ဆက်တိုက်ရှုံး Lock Method [${targetStats?.label || lockedAlgo}] (${targetStreak} ကြိမ်ရှုံး) ဖြင့် Win မဖြစ်မချင်း ${stepText} ဆက်လက်လောင်းပါမည်!`);
          }
        } else if (isSniperActive) {
          setAutoFeedback(`⚠️ [SNIPER STRIKE HOLD] Locked Method [${sniperLockedAlgoRef.current || 'Sniper'}] ဖြင့် Win မဖြစ်မချင်း ${stepText} ဆက်လက်လောင်းပါမည်!`);
        } else {
          setAutoFeedback(`⚠️ [Auto Bet #${lastBetPeriod ? lastBetPeriod.slice(-5) : 'LIVE'}] ရှုံးသဖြင့် ${stepText} သတ်မှတ်လိုက်ပါပြီ!`);
        }
      }
    }
  }, [
    history,
    methodStats,
    aiAlgorithm,
    bettingEngineMode,
    onChangeAiAlgorithm,
    onSevenMethodLockedAlgoChange,
    onSniperLockedAlgoChange,
    botElapsedSeconds
  ]);

  // ==========================================
  // 2. AUTO BET ONLY AUTOMATIC REAL EXECUTION ENGINE (RUNS AFTER DRAW EVALUATION)
  // ==========================================
  useEffect(() => {
    if (!isAutoBetActive) return;

    if (winStopEnabled && winStopAmount > 0 && autoProfit >= winStopAmount) {
      setIsAutoBetActive(false);
      setStopReason('WIN_STOP');
      const finalSecs = botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : botElapsedSeconds;
      setTargetProfitDuration(finalSecs);
      setAutoFeedback(`🏆 [Win Stop အောင်မြင်ပါပြီ!] သတ်မှတ်ထားသော အနိုင်ငွေ (+K ${autoProfit.toLocaleString()} MMK) ပြည့်မီသဖြင့် Auto Bet ကို ရပ်တန့်လိုက်ပါပြီ!`);
      return;
    }

    if (loseStopEnabled && loseStopAmount > 0 && autoProfit <= -loseStopAmount) {
      setIsAutoBetActive(false);
      setStopReason('LOSE_STOP');
      setAutoFeedback(`🛑 [Lose Stop သတ်မှတ်ချက်!] သတ်မှတ်ထားသော အရှုံးငွေ (-K ${Math.abs(autoProfit).toLocaleString()} MMK) သို့ ရောက်ရှိသဖြင့် Auto Bet ကို ရပ်တန့်လိုက်ပါပြီ!`);
      return;
    }

    if (secondsLeft > 5 && currentPeriod && currentPeriod !== lastAutoBetPeriodRef.current) {
      // 1. STRICT GUARD: Check if there is ANY pending auto bet from an earlier round
      const hasPendingPreviousAutoBet = activeBetsRef.current.some(
        (b) => b.isAuto && b.status === 'PENDING' && b.period !== currentPeriod
      );
      if (hasPendingPreviousAutoBet) {
        // Wait until previous round is drawn and evaluated!
        return;
      }

      // Check if we already placed a bet for the current period
      const alreadyBetCurrentPeriod = activeBetsRef.current.some(
        (b) => b.isAuto && b.period === currentPeriod
      );
      if (alreadyBetCurrentPeriod) {
        return;
      }

      // 2. SELF-HEALING WIN GUARD:
      // Look at the latest completed auto bet
      const completedAutoBets = activeBetsRef.current
        .filter((b) => b.isAuto && (b.status === 'WON' || b.status === 'LOST'))
        .sort((a, b) => b.period.localeCompare(a.period));

      const lastCompletedAutoBet = completedAutoBets[0];

      // If the last completed auto bet was a WIN, we MUST be at Step 1 (0 consecutive losses)!
      if (lastCompletedAutoBet && lastCompletedAutoBet.status === 'WON') {
        consecutiveLossesRef.current = 0;
        setConsecutiveLosses(0);
      }

      let currentLosses = (lastCompletedAutoBet && lastCompletedAutoBet.status === 'WON') 
        ? 0 
        : consecutiveLossesRef.current;

      let requiredStake = calculateStepStake(
        currentLosses,
        progressionModeRef.current,
        autoBaseAmountRef.current,
        autoMultiplierModeRef.current,
        customSequenceRef.current
      );

      if (userBalance < requiredStake) {
        setIsAutoBetActive(false);
        setStopReason('INSUFFICIENT_BALANCE');
        setAutoFeedback(`လက်ကျန်ငွေ မလုံလောက်တော့ပါ (လက်ကျန်: K ${userBalance.toLocaleString()} MMK၊ လိုအပ်ချက်: K ${requiredStake.toLocaleString()} MMK)။ Auto Bet ရပ်တန့်ပါပြီ။`);
        return;
      }

      let betType: 'SIZE' = 'SIZE';
      let betChoice: 'BIG' | 'SMALL' = prediction?.size || 'BIG';

      const isSniperActive = 
        bettingEngineMode === 'SNIPER_4LOSS_MODE' || 
        bettingEngineMode === 'SNIPER_5LOSS_MODE' || 
        bettingEngineMode === 'SNIPER_6LOSS_MODE' || 
        autoStrategy === 'SNIPER_4LOSS' || 
        autoStrategy === 'SNIPER_6LOSS' || 
        autoStrategy === 'SNIPER_5LOSS';

      if (autoStrategy === 'AI_GUESS' && !isSniperActive) {
        if (sevenMethodLockedAlgoRef.current && methodPredictions && methodPredictions[sevenMethodLockedAlgoRef.current]) {
          betChoice = methodPredictions[sevenMethodLockedAlgoRef.current].size;
        } else {
          betChoice = prediction?.size || 'BIG';
        }
      } else if (autoStrategy === 'WAIT_BOT' && !isSniperActive) {
        const streak = getConsecutiveStreak(history);

        if (waitBotStatusRef.current === 'WAITING') {
          if (streak.count >= waitStreakThresholdRef.current && streak.opposite) {
            const target = streak.opposite;
            setWaitBotStatus('BETTING');
            waitBotStatusRef.current = 'BETTING';
            setWaitBotTarget(target);
            waitBotTargetRef.current = target;
            betChoice = target;
            setAutoFeedback(`🔥 [Wait Bot စတင်လောင်းပါပြီ!] ${streak.size === 'BIG' ? 'ကြီး' : 'ငယ်'} ${streak.count} ကြိမ် ဆက်တိုက်ထွက်ပြီးဖြစ်၍ ဆန့်ကျင်ဘက် [${target === 'BIG' ? 'ကြီး (BIG)' : 'ငယ် (SMALL)'}] ကို စတင်လောင်းပါမည်!`);
          } else {
            setAutoFeedback(`⏳ [Wait Bot စောင့်ဆိုင်းနေသည်] လက်ရှိ streak: ${streak.size === 'BIG' ? 'ကြီး' : 'ငယ်'} (${streak.count}/${waitStreakThresholdRef.current} ကြိမ်) • ${waitStreakThresholdRef.current} ကြိမ် ပြည့်လျှင် ဆန့်ကျင်ဘက်ကို win ဖြစ်သည်အထိ စတင်လောင်းပါမည်။`);
            return;
          }
        } else {
          betChoice = waitBotTargetRef.current || streak.opposite || 'BIG';
        }
      } else if (isSniperActive) {
        const targetThreshold: 4 | 5 | 6 = (bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS')
          ? 4
          : (bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS')
          ? 6
          : 5;
        // 4-LOSS, 5-LOSS OR 6-LOSS SNIPER WAIT & STRIKE STRATEGY
        if (sniperBotStatusRef.current === 'STRIKING' && sniperLockedAlgoRef.current) {
          // Already locked onto a method: continue betting ONLY with this method until win!
          const lockedAlgo = sniperLockedAlgoRef.current;
          const lockedPred = methodPredictions?.[lockedAlgo] || (history.length > 0 ? calculateAllPredictions(history, currentPeriod)[lockedAlgo] : null);
          betChoice = lockedPred?.size || prediction?.size || 'BIG';
          setAutoFeedback(
            `🎯 [${targetThreshold}-Loss Sniper Strike လောင်းနေပါသည်] ${targetThreshold} ကြိမ်ရှုံးထားသော [${lockedAlgo}] အား Win ဖြစ်သည်အထိ K ${requiredStake.toLocaleString()} MMK [${betChoice === 'BIG' ? 'ကြီး (BIG)' : 'ငယ် (SMALL)'}] ဆက်တိုက်လောင်းနေပါသည်! (Strike အဆင့် ${currentLosses + 1})`
          );
        } else {
          // In WAITING status: scan all 7 methods to find if any reached target consecutive losses
          const evalResult = methodStats ? evaluateAllMethodsLossStreaks(methodStats, targetThreshold) : null;
          const readyList = targetThreshold === 4 ? evalResult?.readyMethods4 : targetThreshold === 6 ? evalResult?.readyMethods6 : evalResult?.readyMethods5;

          if (readyList && readyList.length > 0) {
            // Target found! Lock onto the highest lose rate method!
            const target = readyList[0];
            const multiNote = readyList.length > 1
              ? ` (Method ${readyList.length} မျိုးအနက် Lose Rate ${target.loseRate}% အများဆုံးဖြစ်သဖြင့် Main အဖြစ် Lock)`
              : ` (Lose Rate: ${target.loseRate}%)`;

            setSniperBotStatus('STRIKING');
            sniperBotStatusRef.current = 'STRIKING';
            setSniperLockedAlgo(target.algorithm);
            sniperLockedAlgoRef.current = target.algorithm;
            onSniperLockedAlgoChange?.(target.algorithm);

            // User requirement: Win ဖြစ်ခဲ့လျှင် နောက်ထပ် Method အရ ချက်ချင်းထပ်ပြန် bet ခဲ့ရလျှင်လည်း user သတ်မှတ်ပေးထားသော base bet အတိုင်း step 1(base stake)မှသာလျှင်ပြန် bet စေပါ
            consecutiveLossesRef.current = 0;
            setConsecutiveLosses(0);
            currentLosses = 0;
            requiredStake = autoBaseAmountRef.current;
            setCurrentAutoStake(autoBaseAmountRef.current);

            const lockedPred = methodPredictions?.[target.algorithm] || (history.length > 0 ? calculateAllPredictions(history, currentPeriod)[target.algorithm] : null);
            betChoice = lockedPred?.size || prediction?.size || 'BIG';

            if (targetThreshold === 4) {
              if (soundEnabledRef.current && (bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS')) {
                try {
                  playStartBettingVoice();
                } catch {}
              }
              setAutoFeedback(
                `🚨 [START BET ACTIVE] "HEY! NOW I AM START BETTING" Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win ဖြစ်သည်အထိ Step 1 (K ${requiredStake.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`
              );
            } else {
              if (soundEnabledRef.current && (bettingEngineMode === 'SNIPER_5LOSS_MODE' || bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS' || autoStrategy === 'SNIPER_6LOSS')) {
                try {
                  playSniperStrikeSound();
                } catch {}
              }
              setAutoFeedback(
                `🎯 [${targetThreshold}-LOSS SNIPER LOCK!] Method [${target.label}] သည် ${target.consecutiveLosses} ကြိမ် ဆက်တိုက် ရှုံးထားပြီး${multiNote} Win ဖြစ်သည်အထိ Step 1 (K ${requiredStake.toLocaleString()} MMK) ဖြင့် ဤ Method တမျိုးတည်း စတင်လောင်းပါပြီ!`
              );
            }
          } else {
            // No method has reached target losses yet: wait quietly!
            const maxLoss = evalResult?.highestLossCount || 0;
            const maxAlgo = evalResult?.highestLossAlgo;
            setAutoFeedback(
              `🎯 [${targetThreshold}-Loss Sniper စောင့်ဆိုင်းနေပါသည်] ${targetThreshold} ကြိမ် ဆက်တိုက်ရှုံးသော Method ကို စောင့်နေပါသည်... (လက်ရှိ အများဆုံးရှုံး: [${maxAlgo || 'Scanning'}] ${maxLoss}/${targetThreshold} ကြိမ်) • ${targetThreshold} ကြိမ် ပြည့်ပါက Step 1 မူလငွေဖြင့် အလိုအလျောက် စတင်လောင်းပါမည်။`
            );
            return; // DO NOT BET! Wait for target consecutive losses!
          }
        }
      }

      lastAutoBetPeriodRef.current = currentPeriod;
      const normalized = normalizeShweBetAmount(requiredStake, 1);
      const effectiveStake = normalized.total;

      setUserBalance((prev) => Math.max(0, prev - effectiveStake));

      const newAutoBet: ActiveBet = {
        id: `AUTO-${Date.now().toString().slice(-6)}`,
        period: currentPeriod,
        type: betType,
        selection: betChoice,
        amount: normalized.amount,
        multiplier: normalized.betCount,
        total: effectiveStake,
        status: 'PENDING',
        isAuto: true,
      };

      const nextActiveBets = [newAutoBet, ...activeBetsRef.current.slice(0, 19)];
      activeBetsRef.current = nextActiveBets;
      setActiveBets(nextActiveBets);
      const stepDesc = progressionModeRef.current === 'CUSTOM_SEQUENCE'
        ? `Custom Step ${currentLosses + 1}/${customSequenceRef.current.length}`
        : (currentLosses > 0 ? `${autoMultiplierModeRef.current}× အဆင့် ${currentLosses + 1}` : 'မူလစတင်ငွေ (Step 1)');
      setAutoFeedback(`⚡ [Auto Bet #${currentPeriod.slice(-5)}] ShweLottery game website သို့ K ${effectiveStake.toLocaleString()} MMK (${normalized.amount} × ${normalized.betCount}) [${stepDesc}] လောင်းနေပါသည်...`);
      playTickSound();

      // EXECUTE REAL BET ON SHWELOTTERY OFFICIAL SERVER
      fetch('/api/shwelottery/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeId: selectedTypeId,
          issueNumber: currentPeriod,
          type: betType,
          selection: betChoice,
          amount: normalized.amount,
          multiplier: normalized.betCount
        })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && typeof data.realBalance === 'number') {
            setUserBalance(data.realBalance);
          }
          if (data.success) {
            setAutoFeedback(`✅ [Auto Bet #${currentPeriod.slice(-5)}] ShweLottery တွင် K ${effectiveStake.toLocaleString()} MMK [${betChoice === 'BIG' ? 'ကြီး (BIG)' : 'ငယ် (SMALL)'}] အမှန်တကယ် လောင်းပြီးပါပြီ! (လက်ကျန်: K ${data.realBalance?.toLocaleString()} MMK)`);
          } else {
            if (data.msgCode === 1003 || data.msg?.includes('recharge')) {
              setAutoFeedback(`⚡ [Auto Bet #${currentPeriod.slice(-5)}] Station Mode ဖြင့် K ${effectiveStake.toLocaleString()} MMK [${betChoice === 'BIG' ? 'ကြီး' : 'ငယ်'}] လောင်းပြီးပါပြီ (ဝဘ်ဆိုက်အကောင့် recharge လိုအပ်ပါသည်)`);
            } else {
              setAutoFeedback(`⚡ [Auto Bet #${currentPeriod.slice(-5)}] Website: ${data.msg || 'ဂိမ်းဝဘ်ဆိုက်မှ အတည်ပြုချက်'}`);
            }
          }
        })
        .catch((err) => {
          console.error('Auto bet network error:', err);
        });
    }
  }, [
    isAutoBetActive,
    secondsLeft,
    currentPeriod,
    autoBaseAmount,
    autoMultiplierMode,
    consecutiveLosses,
    userBalance,
    autoStrategy,
    prediction,
    selectedTypeId,
    winStopEnabled,
    winStopAmount,
    loseStopEnabled,
    loseStopAmount,
    autoProfit,
    activeBets,
    history,
    waitStreakThreshold,
    waitBotStatus,
    waitBotTarget,
    sniperBotStatus,
    sniperLockedAlgo,
    bettingEngineMode,
    methodStats,
    methodPredictions,
    botStartTime,
    botElapsedSeconds
  ]);

  // Account login modal state
  const [inputPhone, setInputPhone] = useState<string>(account.phone || '9798023829');
  const [inputPassword, setInputPassword] = useState<string>(account.password || '166061kp');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginFeedback, setLoginFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const handleAccountLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRefreshLogin) return;

    setIsLoggingIn(true);
    setLoginFeedback(null);
    try {
      const result = await onRefreshLogin(inputPhone.trim(), inputPassword.trim());
      setLoginFeedback(result);
      if (result.success) {
        await fetchRealLiveBalance();
        setTimeout(() => {
          setIsLoginModalOpen(false);
          setLoginFeedback(null);
        }, 1500);
      }
    } catch (err: any) {
      setLoginFeedback({ success: false, message: err.message || 'Login error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER TOOLBAR: PROFILE, AUTO BOT ONLY BADGE & GAME SELECTOR       */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5">
        {/* User Account Info */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-black font-black shadow-lg shrink-0">
            <User className="w-6 h-6 text-black stroke-[2.5]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">
                {account.nickName || 'MemberNNG0XDE5'}
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ONLINE
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-extrabold px-2 py-0.5 rounded-full border border-amber-500/40">
                🤖 AUTO BOT ONLY
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5 flex-wrap">
              <span>Ph: <strong className="text-white">09××××××××</strong></span>
              <span>•</span>
              <span className="text-amber-400 font-bold">
                Balance: K {userBalance.toLocaleString()} MMK
              </span>
              <button
                type="button"
                onClick={() => {
                  setUserBalance((b) => b + 10000);
                  setAutoFeedback('+10,000 MMK Station Balance ဖြည့်သွင်းပြီးပါပြီ!');
                  setTimeout(() => setAutoFeedback(null), 2500);
                }}
                className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-[10px] text-amber-300 font-bold border border-amber-500/40 transition-colors"
                title="Station Balance ပြန်လည်ဖြည့်သွင်းရန်"
              >
                +10,000 MMK
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls: Game Mode, Settings, Refresh */}
        <div className="flex items-center gap-2 flex-wrap self-stretch md:self-auto justify-between md:justify-end">
          {/* Game Type Selector */}
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeTypeId(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                selectedTypeId === 1
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Win Go 60s
            </button>
            <button
              type="button"
              onClick={() => onChangeTypeId(30)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                selectedTypeId === 30
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Win Go 30s
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Login / Account change"
          >
            <Key className="w-4 h-4 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={onRefreshSession}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh Account Balance"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE HERO: LIVE AUTO MONITORING DASHBOARD (100% AUTO BET ONLY)           */}
      {/* ========================================================================= */}
      <div className={`p-5 sm:p-6 rounded-2xl border-2 transition-all shadow-2xl relative overflow-hidden ${
        isAutoBetActive 
          ? 'bg-slate-900/95 border-emerald-500/80 shadow-[0_0_35px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/50' 
          : stopReason === 'WIN_STOP'
          ? 'bg-slate-900/95 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/50'
          : stopReason === 'LOSE_STOP'
          ? 'bg-slate-900/95 border-rose-500/80 shadow-[0_0_35px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/50'
          : 'bg-slate-950 border-slate-800'
      }`}>
        {/* Glow ambient accent */}
        <div className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
          isAutoBetActive ? 'bg-emerald-500/10' : stopReason === 'WIN_STOP' ? 'bg-amber-500/10' : 'bg-slate-800/10'
        }`} />

        {/* DASHBOARD HEADER WITH AUTO BETTING MASTER BUTTON */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 relative z-10">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isAutoBetActive 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-inner' 
                : stopReason === 'WIN_STOP'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'bg-slate-800 text-slate-400'
            }`}>
              <Bot className={`w-7 h-7 ${isAutoBetActive ? 'animate-bounce text-emerald-400' : ''}`} />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-tech text-base sm:text-lg font-black text-white tracking-wider flex items-center gap-2">
                  LIVE AUTO MONITORING DASHBOARD
                </h3>

                {isAutoBetActive && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase font-mono animate-pulse flex items-center gap-1 shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                    RUNNING ACTIVE
                  </span>
                )}

                {stopReason === 'WIN_STOP' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase font-mono flex items-center gap-1 shadow">
                    <Trophy className="w-3 h-3 fill-current" />
                    TARGET ACHIEVED
                  </span>
                )}

                {stopReason === 'LOSE_STOP' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase font-mono flex items-center gap-1 shadow">
                    <ShieldAlert className="w-3 h-3 fill-current" />
                    LOSE STOPPED
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-0.5 font-sans">
                100% Autonomous Trading • Martingale Progression ({autoMultiplierMode}×) • Loss-Guard Protection
              </p>
            </div>
          </div>

          {/* AUTO BETTING BUTTON INSIDE THE DASHBOARD */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              type="button"
              onClick={handleToggleAutoBet}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${
                isAutoBetActive
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-950/60 ring-2 ring-red-500/50'
                  : stopReason === 'LOSE_STOP'
                  ? 'bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 hover:from-rose-400 hover:to-emerald-400 text-black shadow-rose-950/60 ring-2 ring-rose-400 animate-pulse'
                  : stopReason === 'WIN_STOP'
                  ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400 text-black shadow-emerald-950/60 ring-2 ring-emerald-400'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black shadow-emerald-950/60 ring-2 ring-emerald-400/50'
              }`}
            >
              {isAutoBetActive ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>STOP AUTO BET (ရပ်မည်)</span>
                </>
              ) : stopReason === 'LOSE_STOP' ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>RESTART AUTO BOT (ပြန်လည်စတင်မည်)</span>
                </>
              ) : stopReason === 'WIN_STOP' ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>START NEW CYCLE (Session အသစ်စမည်)</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>START AUTO BET (စတင်မည်)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* MULTI-MODE BETTING ENGINE EXPLICIT STATUS BANNER (Formula mode vs Method 7 မျိုး vs 4-Loss, 5-Loss & 6-Loss Sniper) */}
        <div className={`p-3.5 sm:p-4 rounded-xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg ${
          bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
            ? 'bg-gradient-to-r from-rose-600/30 via-slate-950 to-amber-950/30 border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
            : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
            ? 'bg-gradient-to-r from-red-600/25 via-slate-950 to-orange-950/30 border-red-400/90 shadow-[0_0_25px_rgba(239,68,68,0.35)]'
            : bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
            ? 'bg-gradient-to-r from-purple-500/20 via-slate-950 to-rose-950/30 border-purple-400/80 shadow-[0_0_20px_rgba(168,85,247,0.25)]'
            : bettingEngineMode === 'FORMULA_MODE'
            ? 'bg-gradient-to-r from-amber-500/20 via-slate-950 to-amber-950/30 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
            : 'bg-gradient-to-r from-cyan-500/20 via-slate-950 to-cyan-950/30 border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${
              bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
                ? 'bg-rose-500/25 border-rose-500/50 text-rose-300'
                : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                : bettingEngineMode === 'FORMULA_MODE'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
            }`}>
              {bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS' || bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS' || bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS' ? (
                <Crosshair className="w-5 h-5 text-rose-400 animate-pulse" />
              ) : bettingEngineMode === 'FORMULA_MODE' ? (
                <Sparkles className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
              ) : (
                <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full ${
                  bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
                    ? 'bg-rose-500 text-white shadow ring-2 ring-rose-300 animate-pulse'
                    : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
                    ? 'bg-red-500 text-white shadow ring-1 ring-red-300'
                    : bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                    ? 'bg-purple-500 text-white shadow'
                    : bettingEngineMode === 'FORMULA_MODE'
                    ? 'bg-amber-500 text-black shadow'
                    : 'bg-cyan-500 text-black shadow'
                }`}>
                  {bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
                    ? '🎯 4-LOSS SNIPER MODE ACTIVE'
                    : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
                    ? '🎯 5-LOSS SNIPER MODE ACTIVE'
                    : bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                    ? '🎯 6-LOSS SNIPER MODE ACTIVE'
                    : bettingEngineMode === 'FORMULA_MODE'
                    ? '🧬 10-MIN FORMULA MODE ACTIVE'
                    : '⚡ 7-METHOD MULTI-AI MODE ACTIVE'}
                </span>
                <span className="text-xs font-tech font-bold text-white">
                  {bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
                    ? `[၄ ကြိမ်ရှုံး စောင့်ဆိုင်း SNIPER စနစ် ("HEY! NOW I AM START BETTING" အချက်ပြသံ)]`
                    : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
                    ? `[၅ ကြိမ်ရှုံး စောင့်ဆိုင်း SNIPER စနစ် (၃ ကြိမ်ရှုံး "I found 3 lose method" အသံ)]`
                    : bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                    ? `[၆ ကြိမ်ရှုံး စောင့်ဆိုင်း SNIPER စနစ် (၄ ကြိမ်ရှုံး Scatter အသံ)]`
                    : bettingEngineMode === 'FORMULA_MODE'
                    ? `[10-MINUTES AI FORMULA စနစ်ဖြင့် လောင်းနေပါသည်]`
                    : `[နည်းပညာ ၇ မျိုး MULTI-AI စနစ်ဖြင့် လောင်းနေပါသည်]`}
                </span>
              </div>

              <span className="text-[11px] text-slate-300 font-sans block mt-1">
                {bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS' || bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS' || bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                  ? `Sniper Status: ${
                      sniperBotStatus === 'STRIKING'
                        ? `🔥 STRIKING ON [${sniperLockedAlgo}] (Win မဖြစ်မချင်း ဤ Method တမျိုးတည်း လောင်းမည်)`
                        : `⏳ WAITING FOR ${bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS' ? '4-LOSS' : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS' ? '5-LOSS' : '6-LOSS'} METHOD (${bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS' ? '၄' : bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS' ? '၅' : '၆'} ကြိမ်ရှုံး Method စောင့်နေပါသည်)`
                    }`
                  : bettingEngineMode === 'FORMULA_MODE'
                  ? `Formula: ${activeFormula?.code || 'Active'} • ${activeFormula?.burmeseTitle || ''} • (Base: K ${autoBaseAmount.toLocaleString()} • Win Stop: ${winStopEnabled ? '+' + winStopAmount.toLocaleString() : 'OFF'} • Lose Stop: ${loseStopEnabled ? '-' + loseStopAmount.toLocaleString() : 'OFF'} • ${autoMultiplierMode}× Mult)`
                  : sevenMethodLockedAlgo
                  ? `Method: [${sevenMethodLockedAlgo}] • 🔒 ၁ ကြိမ်ရှုံးသဖြင့် ဆက်တိုက်အကြိမ်ရေ အများဆုံးရှုံးနေသော Method ကို Lock ထားပြီး Win မဖြစ်မချင်း ဤ Method ဖြင့်သာ လောင်းပါမည်`
                  : `Method: [${aiAlgorithm}] • တိုက်ရိုက်ရွေးချယ်ထားသော စနစ်ဖြင့် လောင်းနေပါသည် (၁ ကြိမ်ရှုံးလျှင် ဆက်တိုက်အများဆုံးရှုံး Method သို့ Auto-Switch & Lock ၍ Win လျှင် Win Rate အမြင့်ဆုံးသို့ Auto ပြန်ချိန်း)`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end flex-wrap">
            <button
              type="button"
              onClick={() => {
                onSelectMode?.('SNIPER_4LOSS_MODE');
                setAutoStrategy('SNIPER_4LOSS');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow ${
                bettingEngineMode === 'SNIPER_4LOSS_MODE' || autoStrategy === 'SNIPER_4LOSS'
                  ? 'bg-rose-500 text-white ring-2 ring-rose-300 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>⭐ 4-Loss (Active)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode?.('SNIPER_5LOSS_MODE');
                setAutoStrategy('SNIPER_5LOSS');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow ${
                bettingEngineMode === 'SNIPER_5LOSS_MODE' || autoStrategy === 'SNIPER_5LOSS'
                  ? 'bg-red-500 text-white ring-2 ring-red-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-red-300 border border-slate-700'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>🎯 5-Loss</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode?.('SNIPER_6LOSS_MODE');
                setAutoStrategy('SNIPER_6LOSS');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow ${
                bettingEngineMode === 'SNIPER_6LOSS_MODE' || autoStrategy === 'SNIPER_6LOSS'
                  ? 'bg-purple-500 text-white ring-1 ring-purple-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>🎯 6-Loss</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode?.('METHODS_7_MODE');
                setAutoStrategy('AI_GUESS');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow ${
                bettingEngineMode === 'METHODS_7_MODE' && autoStrategy !== 'SNIPER_6LOSS' && autoStrategy !== 'SNIPER_5LOSS'
                  ? 'bg-cyan-500 text-black ring-1 ring-cyan-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>⚡ နည်းပညာ ၇ မျိုး</span>
            </button>

            {activeFormula && (
              <button
                type="button"
                onClick={() => {
                  onSelectMode?.('FORMULA_MODE');
                  applyFormulaToAutoBet(activeFormula);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-tech font-black flex items-center gap-1.5 shadow transition-all ${
                  bettingEngineMode === 'FORMULA_MODE'
                    ? 'bg-amber-500 text-black ring-1 ring-amber-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>🧬 10-Min Formula</span>
              </button>
            )}
          </div>
        </div>

        {/* TIMER BAR: LIVE RUNNING TIMER & COUNTDOWN */}
        <div className="pt-4 pb-2 grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
          {/* Target Profit Duration Timer Box */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-amber-500/30 flex items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <Hourglass className={`w-6 h-6 ${isAutoBetActive ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                  {targetProfitDuration !== null ? 'TARGET PROFIT ရရှိသည့်ကြာချိန်:' : 'AUTO BOT START ချိန်မှ စတင်ကြာချိန်:'}
                </span>
                <div className="text-2xl sm:text-3xl font-tech font-black text-amber-400 font-mono tracking-wider flex items-center gap-2">
                  <span>{formatDuration(targetProfitDuration !== null ? targetProfitDuration : botElapsedSeconds)}</span>
                  {isAutoBetActive && (
                    <span className="text-[10px] font-sans font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 animate-pulse">
                      Live Ticking
                    </span>
                  )}
                  {targetProfitDuration !== null && (
                    <span className="text-[10px] font-sans font-bold text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
                      Completed 🏆
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-500 font-mono block">Win Target</span>
              <span className="text-sm font-mono font-bold text-emerald-400">
                +K {winStopAmount.toLocaleString()} MMK
              </span>
            </div>
          </div>

          {/* Current Target Period & Countdown */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3 shadow-inner">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">
                CURRENT DRAW & PREDICTION:
              </span>
              <div className="text-base sm:text-lg font-mono font-bold text-white flex items-center gap-2">
                <span className="text-amber-400">#{currentPeriod ? currentPeriod.slice(-5) : '...'}</span>
                {prediction && (
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    prediction.size === 'BIG' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  }`}>
                    {prediction.sizeBurmese} ({prediction.confidence}%)
                  </span>
                )}
              </div>
            </div>

            <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border font-tech font-black text-2xl font-mono ${
              secondsLeft <= 5
                ? 'bg-red-950/80 border-red-500 text-red-400 animate-pulse'
                : 'bg-slate-900 border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
            }`}>
              <Clock className="w-5 h-5 mr-1 text-slate-400" />
              <span>{String(secondsLeft).padStart(2, '0')}s</span>
            </div>
          </div>
        </div>

        {/* 4 CORE LIVE PERFORMANCE METRICS */}
        <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center relative z-10">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block font-bold">Next Auto Stake</span>
            <span className="text-lg sm:text-xl font-tech font-black text-amber-300 font-mono block">
              K {currentAutoStake.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block">
              {progressionMode === 'CUSTOM_SEQUENCE' ? `Step 1: K ${customSequence[0]?.toLocaleString()}` : `Base: K ${autoBaseAmount.toLocaleString()}`}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block font-bold">Progression Step</span>
            <span className="text-lg sm:text-xl font-tech font-bold text-white font-mono block">
              Step {consecutiveLosses + 1}
            </span>
            <span className="text-[10px] text-amber-400/90 font-mono block truncate">
              {progressionMode === 'CUSTOM_SEQUENCE'
                ? `Custom (${customSequence.length} Steps)`
                : (consecutiveLosses > 0 ? `${autoMultiplierMode}× Multiplier` : 'Base Stake')}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block font-bold">Loss Streak</span>
            <span className={`text-lg sm:text-xl font-tech font-bold font-mono block ${consecutiveLosses > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {consecutiveLosses} ဆက်တိုက်
            </span>
            <span className="text-[10px] text-slate-500 font-mono block">
              Score: {autoWins}W - {autoLosses}L
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block font-bold">Session Profit</span>
            <span className={`text-lg sm:text-xl font-tech font-black font-mono block ${autoProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {autoProfit >= 0 ? `+K ${autoProfit.toLocaleString()}` : `-K ${Math.abs(autoProfit).toLocaleString()}`}
            </span>
            <span className="text-[10px] text-slate-500 font-mono block">
              Total {autoWins + autoLosses} Rounds
            </span>
          </div>
        </div>

        {/* WIN STOP & LOSE STOP PROGRESS GAUGES */}
        <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
          {/* Win Stop Progress Bar */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                Win Stop Target:
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {winStopEnabled
                  ? `+K ${Math.max(0, autoProfit).toLocaleString()} / ${winStopAmount.toLocaleString()} MMK (${Math.min(100, Math.max(0, Math.round((autoProfit / winStopAmount) * 100)))}%)`
                  : 'OFF'}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{
                  width: winStopEnabled && winStopAmount > 0
                    ? `${Math.min(100, Math.max(0, (autoProfit / winStopAmount) * 100))}%`
                    : '0%'
                }}
              />
            </div>
          </div>

          {/* Lose Stop Progress Bar */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-rose-500/30 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Lose Stop Limit:
              </span>
              <span className="font-mono font-bold text-rose-400">
                {loseStopEnabled
                  ? `K ${Math.abs(Math.min(0, autoProfit)).toLocaleString()} / ${loseStopAmount.toLocaleString()} MMK (${Math.min(100, Math.round((Math.abs(Math.min(0, autoProfit)) / loseStopAmount) * 100))}% used)`
                  : 'OFF'}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-500"
                style={{
                  width: loseStopEnabled && loseStopAmount > 0
                    ? `${Math.min(100, Math.round((Math.abs(Math.min(0, autoProfit)) / loseStopAmount) * 100))}%`
                    : '0%'
                }}
              />
            </div>
          </div>
        </div>

        {/* WIN STOP ACHIEVED SPECIAL BANNER */}
        {stopReason === 'WIN_STOP' && (
          <div className="mt-3.5 p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-slate-900 to-amber-950 border-2 border-emerald-400 text-emerald-300 text-xs flex flex-col gap-3 shadow-[0_0_25px_rgba(16,185,129,0.35)] relative z-10 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shrink-0">
                  <Trophy className="w-7 h-7 text-amber-300 animate-bounce" />
                </div>
                <div>
                  <strong className="text-sm font-bold text-white block">
                    🎉 TARGET PROFIT ရရှိပါပြီ! (Win Stop Achieved)
                  </strong>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    သတ်မှတ်ထားသောအမြတ်ငွေ <strong>+K {autoProfit.toLocaleString()} MMK</strong> ရရှိခဲ့ပါပြီ! 
                    ကြာချိန်: <strong className="text-amber-300 font-mono text-sm">{formatDuration(targetProfitDuration || botElapsedSeconds)}</strong>
                  </p>
                  <p className="text-[11px] text-amber-300/90 italic mt-0.5">
                    "ဂုဏ်ယူပါတယ် မင်းသတ်မှတ်ထားသောအမြတ်ငွေကိုရရှိပါပြီ"
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRestartAutoBot}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-amber-400 text-black font-black text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Session အသစ်စမည်</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAutoSession}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Nan Stop Auto Bet Countdown Strip if enabled */}
            {nonStopAutoBet && nonStopCountdown !== null && (
              <div className="pt-2.5 border-t border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-black/40 p-2.5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
                  <div>
                    <span className="font-tech text-xs font-bold text-amber-300 block">
                      ⚡ Nan Stop Auto Bet Activated:
                    </span>
                    <span className="text-[11px] text-emerald-200">
                      နောက်တစ်ကျော့ Auto Bet အလိုအလျောက် စတင်ရန်{' '}
                      <strong className="text-white font-mono text-sm font-black px-1.5 py-0.5 rounded bg-black border border-amber-500/40">
                        {Math.floor(nonStopCountdown / 60).toString().padStart(2, '0')}:{(nonStopCountdown % 60).toString().padStart(2, '0')}
                      </strong>{' '}
                      ကျန်ရှိပါသည် (1m 35s Auto Restart)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setNonStopCountdown(null);
                      handleRestartAutoBot();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs shadow active:scale-95"
                  >
                    ချက်ချင်းစတင်မည် (Start Now)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNonStopCountdown(null);
                      setAutoFeedback('Nan Stop Auto Bet အလိုအလျောက် စတင်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                  >
                    ပယ်ဖျက်မည်
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOSE STOP REACHED ALERT BANNER */}
        {stopReason === 'LOSE_STOP' && (
          <div className="mt-3.5 p-4 rounded-xl bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 border-2 border-rose-500 text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_25px_rgba(239,68,68,0.35)] relative z-10 animate-in fade-in">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />
              <div>
                <strong className="text-sm font-bold text-white block">
                  🛑 LOSE STOP REACHED (အရှုံးကာကွယ် ရပ်တန့်ပါပြီ)
                </strong>
                <p className="text-xs text-rose-200 mt-0.5">
                  အရှုံးငွေ <strong>-K {Math.abs(autoProfit).toLocaleString()} MMK</strong> ရောက်ရှိသဖြင့် Auto Bot ကို ဘေးကင်းစွာ ရပ်တန့်လိုက်ပါသည်။
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRestartAutoBot}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-amber-500 text-black font-black text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all animate-pulse"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>ချက်ချင်းပြန်စမည် (Restart)</span>
              </button>
              <button
                type="button"
                onClick={handleResetAutoSession}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* In-Dashboard Feedback Strip */}
        {autoFeedback && (
          <div className="mt-3.5 p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-amber-300 flex items-center gap-2.5 relative z-10">
            <Bot className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-sans leading-relaxed">{autoFeedback}</span>
          </div>
        )}

        {/* MEDIUM BUTTONS FOR SETTINGS & RISK DETAILS */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2.5 flex-wrap relative z-10">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBetSettingsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-mono font-bold flex items-center gap-2 border border-slate-700/80 transition-all shadow active:scale-95"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>
                Auto Bet Settings ({progressionMode === 'CUSTOM_SEQUENCE' ? `${customSequence.length} Steps Custom (K ${customSequence[0]} MMK)` : `${autoBaseAmount} MMK • ${autoMultiplierMode}×`})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsRiskModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-mono font-bold flex items-center gap-2 border border-slate-700/80 transition-all shadow active:scale-95"
            >
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Win/Lose Stop (+{winStopAmount} / -{loseStopAmount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAutoSession}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-mono flex items-center gap-1.5 border border-slate-800 transition-colors"
              title="Reset session statistics"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset စာရင်း</span>
            </button>
          </div>
        </div>

        {/* NAN STOP AUTO BET ON/OFF CONTROL BAR (Under Win/Lose Stop button) */}
        <div className="mt-3.5 p-3 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3 relative z-10 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border transition-all ${
                nonStopAutoBet
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                <Zap className={`w-4 h-4 ${nonStopAutoBet ? 'animate-bounce text-amber-400 fill-amber-400' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-tech text-xs sm:text-sm font-bold text-white tracking-wider">
                    Nan Stop Auto Bet
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    nonStopAutoBet
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    {nonStopAutoBet ? 'ACTIVATED (ON)' : 'OFF'}
                  </span>
                  {nonStopAutoBet && nonStopCountdown !== null && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold animate-pulse flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Auto-Start: {Math.floor(nonStopCountdown / 60).toString().padStart(2, '0')}:{(nonStopCountdown % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Win Profit ရရှိပြီး Auto Bet ရပ်တန့်သွားပါက သတ်မှတ်ထားသော <strong className="text-amber-300 font-mono">{Math.floor(nonStopWaitSeconds / 60) > 0 ? `${Math.floor(nonStopWaitSeconds / 60)}m ` : ''}{nonStopWaitSeconds % 60}s ({nonStopWaitSeconds}s)</strong> အကြာတွင် auto bet စနစ် အလိုအလျောက် Auto start ဖြစ်စေပါမည်။
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  const nextVal = !nonStopAutoBet;
                  setNonStopAutoBet(nextVal);
                  nonStopAutoBetRef.current = nextVal;
                  if (!nextVal) {
                    setNonStopCountdown(null);
                  }
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                  nonStopAutoBet ? 'bg-amber-500' : 'bg-slate-800'
                }`}
                title="Toggle Nan Stop Auto Bet"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    nonStopAutoBet ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs font-mono font-bold ${nonStopAutoBet ? 'text-amber-400' : 'text-slate-500'}`}>
                {nonStopAutoBet ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Custom Wait Time Selector */}
          <div className="pt-2.5 border-t border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-mono text-slate-300 font-bold">
                Auto Restart စောင့်ဆိုင်းချိန် (Wait Time):
              </span>
              <span className="text-xs font-mono font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                {Math.floor(nonStopWaitSeconds / 60) > 0 ? `${Math.floor(nonStopWaitSeconds / 60)} min ` : ''}{nonStopWaitSeconds % 60} sec ({nonStopWaitSeconds}s)
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: '30s', val: 30 },
                { label: '60s (1m)', val: 60 },
                { label: '95s (1m 35s)', val: 95 },
                { label: '120s (2m)', val: 120 },
                { label: '180s (3m)', val: 180 },
                { label: '300s (5m)', val: 300 }
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => {
                    setNonStopWaitSeconds(preset.val);
                    setCustomWaitInput(String(preset.val));
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                    nonStopWaitSeconds === preset.val
                      ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={customWaitInput}
                  onChange={(e) => {
                    setCustomWaitInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 5) {
                      setNonStopWaitSeconds(val);
                    }
                  }}
                  className="w-12 bg-transparent text-amber-300 font-mono text-xs font-bold outline-none text-center"
                  placeholder="95"
                />
                <span className="text-[10px] font-mono text-slate-400">sec</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. RECENT AUTO BETS LOG                                                   */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-amber-400" />
            RECENT AUTO BETS (အော်တိုလောင်းထားသော မှတ်တမ်း):
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {activeBets.length} Rounds Tracked
          </span>
        </div>

        {activeBets.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-mono">
            Auto Bet မစတင်ရသေးပါ။ အပေါ်ရှိ "START AUTO BET (စတင်မည်)" ခလုတ်ကို နှိပ်၍ စတင်လိုက်ပါ။
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {activeBets.map((bet) => (
              <div
                key={bet.id}
                className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">#{bet.period.slice(-5)}</span>
                  <span className="text-white font-bold">
                    {bet.selection === 'BIG' ? 'ကြီး (BIG)' : 'ငယ် (SMALL)'}
                  </span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-extrabold">
                    AUTO
                  </span>
                  <span className="text-slate-500">
                    (K {bet.amount} x {bet.multiplier}X)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-300">K {bet.total.toLocaleString()}</span>
                  {bet.status === 'PENDING' && (
                    <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-bold">
                      PENDING
                    </span>
                  )}
                  {bet.status === 'WON' && (
                    <span className="text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded font-bold">
                      +K {bet.payout?.toLocaleString()} WON!
                    </span>
                  )}
                  {bet.status === 'LOST' && (
                    <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded font-bold">
                      LOST
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL 1: AUTO BET SETTINGS & MULTIPLIER MODAL                          */}
      {/* ========================================================================= */}
      {isBetSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-amber-500/30">
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-amber-500/30">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h3 className="font-tech text-base font-bold text-white">
                  AUTO BET SETTINGS & PROGRESSION METHOD
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBetSettingsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* 1. Base Amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-slate-300 uppercase block">
                    1. စတင်လောင်းကြေးငွေ (BASE STAKE AMOUNT):
                  </label>
                  <span className="text-xs font-mono font-black text-amber-400">
                    K {autoBaseAmount.toLocaleString()} MMK
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[10, 20, 50, 100, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setAutoBaseAmount(amt);
                        setCustomBaseAmountInput(String(amt));
                        setIsCustomBaseAmount(false);
                        if (consecutiveLosses === 0) {
                          setCurrentAutoStake(amt);
                        }
                      }}
                      className={`py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                        !isCustomBaseAmount && autoBaseAmount === amt
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      K {amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomBaseAmount(true);
                      setCustomBaseAmountInput(String(autoBaseAmount));
                    }}
                    className={`py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                      isCustomBaseAmount
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md font-black'
                        : 'bg-slate-950 text-amber-400 border-amber-500/40 hover:border-amber-400'
                    }`}
                  >
                    Custom ✏️
                  </button>
                </div>

                {/* Custom Base Amount Input Box */}
                {isCustomBaseAmount && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-amber-400 font-bold">စိတ်ကြိုက်လောင်းကြေး ပမာဏ (Custom Base Stake):</span>
                      <span className="text-slate-400 font-bold">လက်ရှိ: K {autoBaseAmount.toLocaleString()} MMK</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm font-bold">K</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={customBaseAmountInput}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setCustomBaseAmountInput(raw);
                            const val = parseInt(raw, 10);
                            if (!isNaN(val) && val > 0) {
                              setAutoBaseAmount(val);
                              if (consecutiveLosses === 0) {
                                setCurrentAutoStake(val);
                              }
                            }
                          }}
                          className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-amber-500/50 text-white font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="ဥပမာ- 25, 250, 1500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const val = parseInt(customBaseAmountInput, 10);
                          if (!isNaN(val) && val > 0) {
                            setAutoBaseAmount(val);
                            if (consecutiveLosses === 0) setCurrentAutoStake(val);
                            setAutoFeedback(`စတင်လောင်းကြေးငွေ K ${val.toLocaleString()} MMK သတ်မှတ်ပြီးပါပြီ`);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs shadow active:scale-95"
                      >
                        သတ်မှတ်မည်
                      </button>
                    </div>

                    {/* Quick increment chips */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">အမြန်ပေါင်းထည့်ရန်:</span>
                      {[10, 50, 100, 500, 1000, 5000].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => {
                            const current = parseInt(customBaseAmountInput, 10) || autoBaseAmount || 10;
                            const updated = Math.max(1, current + inc);
                            setCustomBaseAmountInput(String(updated));
                            setAutoBaseAmount(updated);
                            if (consecutiveLosses === 0) setCurrentAutoStake(updated);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700 font-bold active:scale-95 transition-all"
                        >
                          +{inc.toLocaleString()}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomBaseAmountInput('10');
                          setAutoBaseAmount(10);
                          if (consecutiveLosses === 0) setCurrentAutoStake(10);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-800 ml-auto"
                      >
                        Reset (10)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Bet Amount Progression & Multiplier System (Dual-Mode: Custom Sequence vs Martingale) */}
              <div className="space-y-3.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-mono font-bold text-slate-300 uppercase block">
                    2. အဆင့်ဆင့် လောင်းကြေး သတ်မှတ်ခြင်းစနစ် (BET PROGRESSION SYSTEM):
                  </label>
                  <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    {progressionMode === 'CUSTOM_SEQUENCE' 
                      ? `🎯 Custom (${customSequence.length} Steps: K ${customSequence[0]} ~ K ${customSequence[customSequence.length - 1]})` 
                      : `⚡ ${autoMultiplierMode}× ဆတိုး (Martingale)`}
                  </span>
                </div>

                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleSelectProgressionMode('CUSTOM_SEQUENCE')}
                    className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      progressionMode === 'CUSTOM_SEQUENCE'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span>🎯 စိတ်ကြိုက်အဆင့်ဆင့်သတ်မှတ်ရန် (Custom)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectProgressionMode('MARTINGALE')}
                    className={`py-2 px-3 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      progressionMode === 'MARTINGALE'
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span>⚡ ဆတိုးစနစ် (Martingale Mult)</span>
                  </button>
                </div>

                {/* TAB 1: CUSTOM PROGRESSION SEQUENCE (User Request: 20, 40, 60, 80, 160, 320, 640, 1280) */}
                {progressionMode === 'CUSTOM_SEQUENCE' ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        စိတ်ကြိုက် အဆင့်ဆင့်လောင်းကြေးများ ထည့်သွင်းပါ:
                      </span>
                      <span className="text-slate-400 font-bold">
                        စုစုပေါင်း မတည်ငွေ: <strong className="text-white">K {customSequence.reduce((a, b) => a + b, 0).toLocaleString()} MMK</strong>
                      </span>
                    </div>

                    {/* Comma-separated input row */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={customSequenceInput}
                          onChange={(e) => setCustomSequenceInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateCustomSequence(customSequenceInput);
                              setAutoFeedback(`စိတ်ကြိုက် Bet Sequence (${customSequence.length} Steps) သတ်မှတ်ပြီးပါပြီ`);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-amber-500/50 text-amber-300 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="ဥပမာ: 20, 40, 60, 80, 160, 320, 640, 1280"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateCustomSequence(customSequenceInput);
                          setAutoFeedback(`စိတ်ကြိုက် Bet Sequence သတ်မှတ်ပြီးပါပြီ (Step 1: K ${customSequence[0]} MMK)`);
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black font-mono text-xs shadow active:scale-95 shrink-0"
                      >
                        သတ်မှတ်မည်
                      </button>
                    </div>

                    {/* Presets Chips */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-slate-400 font-mono font-bold block">
                        အသင့်သုံး အဆင့်ဆင့် Pattern များ ရွေးရန်:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          {
                            label: '⭐ 20, 40, 60, 80, 160, 320, 640, 1280 (8 Steps)',
                            seq: [20, 40, 60, 80, 160, 320, 640, 1280]
                          },
                          {
                            label: '10, 20, 30, 60, 120, 240, 480, 960 (Budget 8 Steps)',
                            seq: [10, 20, 30, 60, 120, 240, 480, 960]
                          },
                          {
                            label: '20, 50, 100, 200, 400, 800, 1600 (7 Steps)',
                            seq: [20, 50, 100, 200, 400, 800, 1600]
                          },
                          {
                            label: '10, 20, 40, 80, 160, 320, 640, 1280 (Double 8 Steps)',
                            seq: [10, 20, 40, 80, 160, 320, 640, 1280]
                          }
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const text = preset.seq.join(', ');
                              handleUpdateCustomSequence(text);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border font-bold transition-all active:scale-95 ${
                              customSequence.join(',') === preset.seq.join(',')
                                ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40'
                                : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Interactive Step-by-Step Preview Grid */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-300 font-bold">
                          လက်ရှိ သတ်မှတ်ထားသော အဆင့်ဆင့်လောင်းကြေးများ ({customSequence.length} Steps):
                        </span>
                        <span className="text-emerald-400 font-bold">
                          Step 1 Win Reset 100% Guaranteed
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 text-center">
                        {customSequence.map((amt, idx) => {
                          const isCurrent = consecutiveLosses === idx;
                          return (
                            <div
                              key={idx}
                              className={`p-2 rounded-xl border font-mono transition-all relative ${
                                isCurrent
                                  ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-2 ring-amber-400/60 shadow font-bold'
                                  : idx === 0
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                  : 'bg-slate-900/70 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="text-[9px] uppercase font-bold text-slate-400">
                                {idx === 0 ? 'Step 1 (Win Reset)' : `Step ${idx + 1} (${idx}L)`}
                              </div>
                              <div className="text-xs font-black text-white mt-1">
                                K {amt.toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Quick Add / Remove step controls */}
                      <div className="flex items-center justify-between text-xs font-mono pt-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const last = customSequence[customSequence.length - 1] || 1280;
                              const updated = [...customSequence, last * 2];
                              handleUpdateCustomSequence(updated.join(', '));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-bold"
                          >
                            + နောက်တစ်ဆင့် ထပ်တိုးမည် ({customSequence[customSequence.length - 1] * 2} MMK)
                          </button>

                          {customSequence.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = customSequence.slice(0, -1);
                                handleUpdateCustomSequence(updated.join(', '));
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-700 text-[10px] font-bold"
                            >
                              - နောက်ဆုံးအဆင့် လျှော့မည်
                            </button>
                          )}
                        </div>

                        <span className="text-[10px] text-slate-400">
                          အများဆုံးခံနိုင်ရည်: {customSequence.length - 1} ကြိမ်ဆက်တိုက်ရှုံး
                        </span>
                      </div>
                    </div>

                    {/* Step 1 Guarantee Callout */}
                    <div className="text-[10px] text-emerald-300 font-sans leading-relaxed bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/30">
                      🛡️ <strong>အနိုင်ရရှိပါက Step 1 သို့ မဖြစ်မနေ ပြန်စသည့်စနစ်:</strong> မည်သည့်အဆင့် (Step 1 မှ Step {customSequence.length}) တွင်မဆို အနိုင်ရရှိ (WIN) ဖြစ်သည်နှင့် နောက်တစ်ကြိမ် လောင်းကြေးကို Step 1 (မူလစတင်ငွေ <strong className="text-white font-mono">K {customSequence[0]?.toLocaleString()} MMK</strong>) သို့ ချက်ချင်း 100% ပြန်လည်သတ်မှတ်ပြီး လောင်းပါမည်။
                    </div>
                  </div>
                ) : (
                  /* TAB 2: CLASSIC MARTINGALE MULTIPLIER */
                  <div className="space-y-3 animate-in fade-in">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { mult: 2, label: '2X', desc: 'Classic Martingale' },
                        { mult: 3, label: '3X', desc: 'Aggressive' },
                        { mult: 4, label: '4X', desc: 'Super Fast' },
                        { mult: 5, label: '5X', desc: 'Ultra Max' },
                      ].map((item) => (
                        <button
                          key={item.mult}
                          type="button"
                          onClick={() => {
                            setAutoMultiplierMode(item.mult);
                            setIsCustomMultiplier(false);
                          }}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            !isCustomMultiplier && autoMultiplierMode === item.mult
                              ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-lg ring-1 ring-amber-400/50'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-base font-tech font-black block">{item.label}</span>
                          <span className="text-[9px] text-slate-400 font-mono block truncate">{item.desc}</span>
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomMultiplier(true);
                          const parsed = parseFloat(customMultiplierInput);
                          if (!isNaN(parsed) && parsed >= 1.1) {
                            setAutoMultiplierMode(parsed);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isCustomMultiplier
                            ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-lg ring-1 ring-amber-400/50'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="text-base font-tech font-black block">Custom</span>
                        <span className="text-[9px] text-slate-400 font-mono block">စိတ်ကြိုက်</span>
                      </button>
                    </div>

                    {isCustomMultiplier && (
                      <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-300">စိတ်ကြိုက် Multiplier ထည့်ပါ (၁.၁ မှ ၁၀ အထိ):</span>
                          <span className="font-mono font-bold text-amber-400">{autoMultiplierMode}× Active</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.1"
                              min="1.1"
                              max="10"
                              value={customMultiplierInput}
                              onChange={(e) => {
                                setCustomMultiplierInput(e.target.value);
                                const parsed = parseFloat(e.target.value);
                                if (!isNaN(parsed) && parsed >= 1.1 && parsed <= 10) {
                                  setAutoMultiplierMode(parsed);
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-amber-300 font-mono font-bold text-sm outline-none"
                              placeholder="ဥပမာ: 2.5"
                            />
                            <span className="absolute right-3 top-2 text-xs font-mono text-slate-400 font-bold">×</span>
                          </div>
                          {[1.5, 2.5, 3.5].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setCustomMultiplierInput(String(preset));
                                setAutoMultiplierMode(preset);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700 font-bold cursor-pointer"
                            >
                              {preset}×
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Stake Progression Preview Table */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400">ဆတိုးအဆင့်ဆင့် လောင်းကြေး တွက်ချက်မှု Preview:</span>
                        <span className="text-emerald-400 font-bold">✨ WIN ဖြစ်ပါက Step 1 သို့ အလိုအလျောက် ပြန်စမည်</span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center">
                        {[0, 1, 2, 3, 4, 5, 6].map((lossStep) => {
                          const stake = Math.round(autoBaseAmount * Math.pow(autoMultiplierMode, lossStep));
                          const isCurrentStep = consecutiveLosses === lossStep;
                          return (
                            <div
                              key={lossStep}
                              className={`p-1.5 rounded-lg border text-[10px] font-mono transition-all ${
                                isCurrentStep
                                  ? 'bg-amber-500/25 border-amber-400 text-amber-300 ring-1 ring-amber-400/50 shadow font-bold'
                                  : lossStep === 0
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-400'
                              }`}
                            >
                              <div className="font-bold text-[9px] text-slate-400">
                                {lossStep === 0 ? 'Step 1 (Base)' : `Step ${lossStep + 1} (${lossStep}L)`}
                              </div>
                              <div className="font-black text-[11px] text-slate-200 mt-0.5">
                                K {stake.toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-emerald-400/90 font-sans leading-relaxed bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                        🛡️ <strong>အာမခံစနစ်:</strong> မည်သည့် Step (အဆင့်) တွင်မဆို အနိုင်ရရှိ (WIN) ဖြစ်သည်နှင့် နောက်တစ်ကြိမ်တွင် Step 1 (မူလစတင်ငွေ K {autoBaseAmount.toLocaleString()} MMK) သို့ ချက်ချင်း 100% ပြန်လည်သတ်မှတ်ပြီး လောင်းပါမည်။
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Auto Strategy */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-mono font-bold text-slate-300 uppercase block">
                  3. AUTO BET STRATEGY (လောင်းမည့် အော်တိုနည်းလမ်း):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoStrategy('AI_GUESS');
                      onSelectMode?.('METHODS_7_MODE');
                    }}
                    className={`p-3 rounded-xl border text-xs font-mono font-bold transition-all text-left cursor-pointer ${
                      autoStrategy === 'AI_GUESS' && bettingEngineMode === 'METHODS_7_MODE'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-500/40 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold block mb-0.5 text-cyan-300">⚡ Follow AI (၇ မျိုး)</div>
                    <span className="text-[10px] text-slate-400 font-sans font-normal block leading-tight">Meta-Consensus AI နည်းပညာ (၇) မျိုးမှ အကောင်းဆုံး Method အတိုင်း လိုက်လောင်းသည် (၁ ကြိမ်ရှုံးလျှင် ဆက်တိုက်အကြိမ်ရေ အများဆုံးရှုံးနေသော Method သို့ Auto-Switch & Lock ၍ Win လျှင် Win Rate အမြင့်ဆုံးသို့ Auto ပြန်ချိန်း)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAutoStrategy('SNIPER_4LOSS');
                      onSelectMode?.('SNIPER_4LOSS_MODE');
                    }}
                    className={`p-3 rounded-xl border text-xs font-mono font-bold transition-all text-left cursor-pointer ${
                      autoStrategy === 'SNIPER_4LOSS' || bettingEngineMode === 'SNIPER_4LOSS_MODE'
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200 ring-2 ring-rose-500/60 shadow-lg animate-pulse'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold block mb-0.5 text-rose-300">⭐ 4-Loss Sniper Mode ("Start Betting" Voice)</div>
                    <span className="text-[10px] text-slate-400 font-sans font-normal block leading-tight">၄ ကြိမ်ရှုံးသော Method ကို စောင့်ပြီး "HEY! NOW I AM START BETTING" အချက်ပြကာ Win မဖြစ်မချင်း ထို Method တမျိုးတည်း လောင်းသည်</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAutoStrategy('SNIPER_5LOSS');
                      onSelectMode?.('SNIPER_5LOSS_MODE');
                    }}
                    className={`p-3 rounded-xl border text-xs font-mono font-bold transition-all text-left cursor-pointer ${
                      autoStrategy === 'SNIPER_5LOSS' || bettingEngineMode === 'SNIPER_5LOSS_MODE'
                        ? 'bg-red-500/25 border-red-400 text-red-200 ring-1 ring-red-500/50 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold block mb-0.5 text-red-300">🎯 5-Loss Sniper Mode</div>
                    <span className="text-[10px] text-slate-400 font-sans font-normal block leading-tight">၃ ကြိမ်ရှုံး Voice Alarm မြည်မည်။ ၅ ကြိမ်ရှုံးသော Method ကို စောင့်ပြီး Win မဖြစ်မချင်း ထို Method ဖြင့် လောင်းသည်</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAutoStrategy('SNIPER_6LOSS');
                      onSelectMode?.('SNIPER_6LOSS_MODE');
                    }}
                    className={`p-3 rounded-xl border text-xs font-mono font-bold transition-all text-left cursor-pointer ${
                      autoStrategy === 'SNIPER_6LOSS' || bettingEngineMode === 'SNIPER_6LOSS_MODE'
                        ? 'bg-purple-500/25 border-purple-400 text-purple-200 ring-1 ring-purple-500/50 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold block mb-0.5 text-purple-300">🎯 6-Loss Sniper Mode</div>
                    <span className="text-[10px] text-slate-400 font-sans font-normal block leading-tight">၄ ကြိမ်ရှုံး Scatter Alarm မြည်မည်။ ၆ ကြိမ်ရှုံးသော Method ကို စောင့်ပြီး Win မဖြစ်မချင်း ထို Method ဖြင့် လောင်းသည်</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAutoStrategy('WAIT_BOT');
                      onSelectMode?.('METHODS_7_MODE');
                    }}
                    className={`p-3 rounded-xl border text-xs font-mono font-bold transition-all text-left cursor-pointer ${
                      autoStrategy === 'WAIT_BOT'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 ring-1 ring-emerald-500/30 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold block mb-0.5 text-emerald-300">🐉 Wait Bot (Streak)</div>
                    <span className="text-[10px] text-slate-400 font-sans font-normal block leading-tight">ကြီး သို့မဟုတ် ငယ် ဆက်တိုက်ထွက်ပြီးမှ ဆန့်ကျင်ဘက်ကို win ဖြစ်သည်အထိ လိုက်လောင်းသည်</span>
                  </button>
                </div>
              </div>

              {/* Wait Bot Streak Threshold */}
              {autoStrategy === 'WAIT_BOT' && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[11px] font-mono text-amber-300 font-bold block">
                    Wait Bot: စောင့်ဆိုင်းမည့် ဆက်တိုက်အကြိမ်ရေ (Threshold):
                  </span>
                  <div className="flex gap-2">
                    {[3, 4, 5, 6, 7].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setWaitStreakThreshold(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold ${
                          waitStreakThreshold === s
                            ? 'bg-amber-500 text-black'
                            : 'bg-slate-900 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {s} ကြိမ်
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsBetSettingsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow"
              >
                ပြီးပါပြီ (Save & Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL 2: WIN STOP & LOSE STOP RISK MANAGEMENT                           */}
      {/* ========================================================================= */}
      {isRiskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-emerald-500/60 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-emerald-500/30">
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/40 border-b border-emerald-500/30">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <h3 className="font-tech text-base font-bold text-white">
                  WIN STOP & LOSE STOP (အမြတ်/အရှုံး ကန့်သတ်ချက်)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRiskModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Win Stop Setting */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    WIN STOP (TARGET PROFIT အနိုင်ရယူရေး)
                  </span>
                  <button
                    type="button"
                    onClick={() => setWinStopEnabled(!winStopEnabled)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                      winStopEnabled ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {winStopEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={winStopInput}
                    onChange={(e) => {
                      setWinStopInput(e.target.value);
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) setWinStopAmount(val);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-sm focus:border-emerald-400 outline-none"
                    placeholder="1000"
                  />
                  <span className="text-xs font-mono text-emerald-400 font-bold">MMK</span>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {[500, 1000, 2000, 5000, 10000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setWinStopAmount(v);
                        setWinStopInput(String(v));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-800"
                    >
                      +K {v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lose Stop Setting */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    LOSE STOP (STOP LOSS အရှုံးကာကွယ်ရေး)
                  </span>
                  <button
                    type="button"
                    onClick={() => setLoseStopEnabled(!loseStopEnabled)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                      loseStopEnabled ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {loseStopEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={loseStopInput}
                    onChange={(e) => {
                      setLoseStopInput(e.target.value);
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) setLoseStopAmount(val);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-rose-300 font-mono text-sm focus:border-rose-400 outline-none"
                    placeholder="1000"
                  />
                  <span className="text-xs font-mono text-rose-400 font-bold">MMK</span>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {[500, 1000, 2000, 5000, 10000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setLoseStopAmount(v);
                        setLoseStopInput(String(v));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-800"
                    >
                      -K {v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nan Stop Auto Bet Setting in Risk Modal */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    NAN STOP AUTO BET (Auto Restart)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !nonStopAutoBet;
                      setNonStopAutoBet(nextVal);
                      nonStopAutoBetRef.current = nextVal;
                      if (!nextVal) setNonStopCountdown(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                      nonStopAutoBet ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {nonStopAutoBet ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  အကယ်၍ ဖွင့်ထားပါက Win Profit ရရှိပြီး Auto bet ရပ်တန့်သွားပြီးနောက် သတ်မှတ်ထားသော <strong className="text-amber-300 font-mono">{Math.floor(nonStopWaitSeconds / 60) > 0 ? `${Math.floor(nonStopWaitSeconds / 60)} မိနစ် ` : ''}{nonStopWaitSeconds % 60} စက္ကန့် ({nonStopWaitSeconds}s)</strong> အကြာတွင် Auto Bet စနစ် အလိုအလျောက် Auto Start ပြန်လည်ဖြစ်စေပါမည်။
                </p>

                {/* Wait time presets in modal */}
                <div className="pt-2 border-t border-slate-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-300">
                      စောင့်ဆိုင်းချိန် (Wait Time Preset):
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {nonStopWaitSeconds}s
                    </span>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { label: '30s', val: 30 },
                      { label: '60s (1m)', val: 60 },
                      { label: '95s (1m 35s)', val: 95 },
                      { label: '120s (2m)', val: 120 },
                      { label: '180s (3m)', val: 180 },
                      { label: '300s (5m)', val: 300 }
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => {
                          setNonStopWaitSeconds(p.val);
                          setCustomWaitInput(String(p.val));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
                          nonStopWaitSeconds === p.val
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-mono text-slate-400">စိတ်ကြိုက် (Custom):</span>
                    <input
                      type="number"
                      min="5"
                      max="3600"
                      value={customWaitInput}
                      onChange={(e) => {
                        setCustomWaitInput(e.target.value);
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 5) setNonStopWaitSeconds(val);
                      }}
                      className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs font-bold text-center outline-none focus:border-amber-400"
                      placeholder="95"
                    />
                    <span className="text-xs font-mono text-slate-400">စက္ကန့် (seconds)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRiskModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow"
              >
                သတ်မှတ်ချက်များ သိမ်းဆည်းမည် (Save)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL 3: SHWELOTTERY GAME LOGIN CHANGE                                 */}
      {/* ========================================================================= */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-amber-500/30">
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-amber-500/30">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-tech text-base font-bold text-white">
                    SHWELOTTERY GAME LOGIN
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    ဖုန်းနံပါတ်နှင့် စကားဝှက် ပြောင်းလဲ၍ Login ဝင်ရောက်ပါ
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsLoginModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAccountLoginSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-1">
                  ဖုန်းနံပါတ် (Myanmar Phone):
                </label>
                <input
                  type="text"
                  value={inputPhone}
                  onChange={(e) => setInputPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-amber-400 outline-none"
                  placeholder="09798023829"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-1">
                  စကားဝှက် (Password):
                </label>
                <input
                  type="password"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-amber-400 outline-none"
                  placeholder="166061kp"
                />
              </div>

              {loginFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-mono flex items-center gap-2 ${
                  loginFeedback.success
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputPhone('9798023829');
                    setInputPassword('166061kp');
                  }}
                  className="text-xs text-amber-400 underline font-mono"
                >
                  Default အကောင့်သုံးမည်
                </button>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs shadow flex items-center gap-1.5"
                >
                  {isLoggingIn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isLoggingIn ? 'Login ဝင်နေပါသည်...' : 'Login ဝင်မည်'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
