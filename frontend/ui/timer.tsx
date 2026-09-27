import * as React from 'react';

function getTimeRemaining(endTime: number) {
  const diff = endTime - Date.now();
  const seconds = Math.max(Math.floor((diff / 1000) % 60), 0);
  const minutes = Math.max(Math.floor((diff / 1000 / 60) % 60), 0);
  return {
    total: Math.floor(diff / 1000),
    minutes: `${minutes < 10 ? '0' : ''}${minutes}`,
    seconds: `${seconds < 10 ? '0' : ''}${seconds}`,
  };
}

// A short gong, synthesized so no sound file is needed: a few decaying,
// slightly inharmonic partials.
let audio: AudioContext | null = null;
function playGong() {
  try {
    audio = audio || new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.setValueAtTime(0.35, now);
    master.connect(audio.destination);
    for (const [freq, level, decay] of [
      [110, 1, 2.5],
      [165, 0.6, 2.0],
      [233, 0.45, 1.6],
      [311, 0.3, 1.2],
      [467, 0.2, 0.8],
    ]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + decay);
    }
  } catch {
    // No audio available: the colored timer is warning enough.
  }
}

interface TimerProps {
  roundStartedAt: number;
  timerDurationMs: number;
  handleExpiration: () => void;
  freezeTimer: boolean;
}

// "Timer mm:ss". In the last 30 seconds of a turn its background turns
// orange (red for the last 10) and a gong sounds once at the 30-second
// mark. Without an enforced timer it rests at 0:00 until the turn ends.
const Timer: React.FunctionComponent<TimerProps> = ({
  roundStartedAt,
  timerDurationMs,
  handleExpiration,
  freezeTimer = false,
}) => {
  const [timeRemaining, setTimeRemaining] = React.useState(undefined);
  const lastTotal = React.useRef(null);
  const endTime = new Date(roundStartedAt).getTime() + timerDurationMs + 1000;

  React.useEffect(() => {
    const timeRemaining = getTimeRemaining(endTime - 1000);
    if (timeRemaining.total < 0) {
      handleExpiration();
    }
    const timeout = freezeTimer
      ? null
      : setTimeout(() => setTimeRemaining(timeRemaining), 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [timeRemaining]);

  React.useEffect(() => {
    setTimeRemaining(getTimeRemaining(endTime));
    lastTotal.current = null; // new turn
  }, [endTime]);

  // Gong when the countdown crosses 30 seconds (not when a page is opened
  // with less than 30 seconds already left).
  React.useEffect(() => {
    const total = timeRemaining?.total;
    if (total === undefined || freezeTimer) return;
    if (lastTotal.current !== null && lastTotal.current > 30 && total <= 30) playGong();
    lastTotal.current = total;
  }, [timeRemaining?.total]);

  if (!timeRemaining?.total && timeRemaining?.total !== 0) return null;

  const total = Math.max(timeRemaining.total, 0);
  const level = freezeTimer ? '' : total <= 10 ? ' urgent' : total <= 30 ? ' warning' : '';
  return (
    <span
      className={'timer' + level}
      role="img"
      aria-label={'Time remaining: ' + timeRemaining.minutes + ':' + timeRemaining.seconds}
    >
      Timer {timeRemaining.minutes}:{timeRemaining.seconds}
    </span>
  );
};

export default Timer;
