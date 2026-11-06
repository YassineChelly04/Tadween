import { useEffect, useState } from 'react';

const CENTRE = 50;
const TICKS = Array.from({ length: 60 }, (_, i) => i);

function useTicking(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The clock: sixty ticks on a hairline, two ink hands, and the ember dot for
 * the seconds, walking round the ring like the dot of the Tadween mark. The
 * dot's angle only ever grows, so midnight does not spin it backwards.
 */
export function Clock({ lang }: { lang: string }) {
  const now = useTicking();
  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  const secondsToday = now.getHours() * 3600 + now.getMinutes() * 60 + seconds;
  const digits = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { hour: '2-digit', minute: '2-digit' }).format(now);

  return (
    <div className="home-clock" role="timer" aria-label={digits}>
      <svg className="clock-face" viewBox="0 0 100 100" aria-hidden="true">
        {TICKS.map((i) => (
          <line key={i} className="clock-tick" data-hour={i % 5 === 0} x1={CENTRE} x2={CENTRE} y1={2} y2={i % 5 === 0 ? 10 : 6} transform={`rotate(${i * 6} ${CENTRE} ${CENTRE})`} />
        ))}
        <line className="clock-hand" x1={CENTRE} y1={CENTRE} x2={CENTRE} y2={26} strokeWidth={4} transform={`rotate(${hours * 30} ${CENTRE} ${CENTRE})`} />
        <line className="clock-hand" x1={CENTRE} y1={CENTRE} x2={CENTRE} y2={14} strokeWidth={2.4} transform={`rotate(${minutes * 6} ${CENTRE} ${CENTRE})`} />
        <circle className="clock-pin" cx={CENTRE} cy={CENTRE} r={3.6} />
        <circle className="clock-second" cx={CENTRE} cy={14} r={4} style={{ transform: `rotate(${secondsToday * 6}deg)` }} />
      </svg>
      <span className="clock-digits">{digits}</span>
    </div>
  );
}
