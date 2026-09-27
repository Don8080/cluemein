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

interface TimerProps {
  roundStartedAt: number;
  timerDurationMs: number;
  handleExpiration: () => void;
  freezeTimer: boolean;
}

// "Timer mm:ss". Pulses during the last 30 seconds of a turn; without an
// enforced timer it rests at 0:00 until someone ends the turn.
const Timer: React.FunctionComponent<TimerProps> = ({
  roundStartedAt,
  timerDurationMs,
  handleExpiration,
  freezeTimer = false,
}) => {
  const [timeRemaining, setTimeRemaining] = React.useState(undefined);
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
  }, [endTime]);

  if (!timeRemaining?.total && timeRemaining?.total !== 0) return null;

  const total = Math.max(timeRemaining.total, 0);
  let color;
  if (total <= 30) color = '#F70';
  if (total <= 10) color = '#E22';
  const pulsing = !freezeTimer && total > 0 && total <= 30;
  return (
    <span
      className={'timer' + (pulsing ? ' pulse' : '')}
      style={{ color }}
      role="img"
      aria-label={'Time remaining: ' + timeRemaining.minutes + ':' + timeRemaining.seconds}
    >
      Timer {timeRemaining.minutes}:{timeRemaining.seconds}
    </span>
  );
};

export default Timer;
