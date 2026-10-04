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

// Plays a timer sound (the default gong or the game's custom file).
function playSound(url: string) {
  // Browsers may block sound until the player has clicked on the page;
  // the timer's colors still show.
  if (url) new Audio(url).play().catch(() => {});
}

interface TimerProps {
  roundStartedAt: number;
  timerDurationMs: number;
  handleExpiration: () => void;
  freezeTimer: boolean;
  warningSound: string; // 30 seconds left
  endSound: string; // out of time
}

// "Timer mm:ss". In the last 30 seconds of a turn its background turns
// orange (red for the last 10), then black with white text at 0:00. Gongs
// sound at the 30-second mark and at 0:00. Without an enforced timer it
// rests at 0:00 until the turn ends.
const Timer: React.FunctionComponent<TimerProps> = ({
  roundStartedAt,
  timerDurationMs,
  handleExpiration,
  freezeTimer = false,
  warningSound,
  endSound,
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

  // Gongs as the countdown crosses 30 seconds and 0 (not when a page is
  // opened with the time already past those points).
  React.useEffect(() => {
    const total = timeRemaining?.total;
    if (total === undefined || freezeTimer) return;
    const prev = lastTotal.current;
    if (prev !== null && prev > 30 && total <= 30) playSound(warningSound);
    if (prev !== null && prev > 0 && total <= 0) playSound(endSound);
    lastTotal.current = total;
  }, [timeRemaining?.total]);

  if (!timeRemaining?.total && timeRemaining?.total !== 0) return null;

  const total = Math.max(timeRemaining.total, 0);
  const level = freezeTimer ? '' : total === 0 ? ' expired' : total <= 10 ? ' urgent' : total <= 30 ? ' warning' : '';
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
