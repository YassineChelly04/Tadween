import type { Language } from '../lib/api';
import fr from '../assets/flags/fr.svg';
import gb from '../assets/flags/gb.svg';
import sa from '../assets/flags/sa.svg';

// Official national flags (flag-icons, MIT): France, United Kingdom, Saudi Arabia.
const FLAGS: Record<Language, string> = { fr, en: gb, ar: sa };

export function Flag({ lang, size = 20 }: { lang: Language; size?: number }) {
  return (
    <img
      className="flag"
      src={FLAGS[lang]}
      alt=""
      width={size}
      height={Math.round((size * 3) / 4)}
      draggable={false}
    />
  );
}
