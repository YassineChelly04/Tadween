// Tadween's own icons, cut like a printed stamp on a 24-unit grid: a solid
// shape in the page's colour, details cut clean through it, and the one ember
// dot of the Tadween mark. Solid because the app's cast is solid; the thin line
// icons beside them looked dead.
//
// Everything is a path `d` string, so PageIcon can draw an icon as a mask and
// the cuts stay real holes on any background, selected rows and dark mode too.

export interface IconDef {
  id: string;
  /** Filled. */
  shape?: string;
  /** Stroked in the page's colour, for parts too thin to fill. */
  line?: string;
  /** Knocked out of the shape, filled. */
  hole?: string;
  /** Knocked out of the shape, stroked. */
  cut?: string;
  /** The ember dot: [cx, cy, r]. */
  dot: [number, number, number];
  /** Extra search words (English, French, Arabic). */
  words: string;
}

const o = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
const r = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;

/** A cog: `teeth` square teeth between radii `inner` and `outer`, around 12,12. */
function cog(teeth: number, inner: number, outer: number): string {
  const step = (Math.PI * 2) / teeth;
  const at = (a: number, rad: number) => `${(12 + rad * Math.cos(a)).toFixed(2)} ${(12 + rad * Math.sin(a)).toFixed(2)}`;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    parts.push(at(a - step * 0.25, inner), at(a - step * 0.16, outer), at(a + step * 0.16, outer), at(a + step * 0.25, inner));
  }
  return `M${parts.join('L')}z`;
}

export const ICONS: IconDef[] = [
  // Diary
  { id: 'journal', shape: r(4.5, 2.5, 15, 19), cut: 'M8 2.5v19M11 8h5', dot: [13.5, 13, 1.5], words: 'journal diary book carnet journal يوميات دفتر' },
  { id: 'pen', shape: 'M16 2.5l5.5 5.5L9 20.5l-6.5 1 1-6.5z', cut: 'M13.5 5l5.5 5.5', dot: [6.6, 17.4, 1.3], words: 'pen write edit stylo écrire قلم كتابة' },
  { id: 'feather', shape: 'M21.5 2.5C12 2.5 6 8 6 15v3h3c7 0 12.5-6 12.5-15.5z', line: 'M2.5 21.5l4-4', cut: 'M7 17l8.5-8.5', dot: [15.5, 13, 1.3], words: 'feather quill plume ريشة' },
  { id: 'ink', shape: 'M12 2s7.5 8 7.5 13a7.5 7.5 0 0 1-15 0C4.5 10 12 2 12 2z', cut: 'M8 15a4 4 0 0 0 4 4', dot: [14.5, 13, 1.5], words: 'ink drop water encre goutte eau حبر قطرة ماء' },
  { id: 'heart', shape: 'M12 21.5S2.5 15.8 2.5 9A5 5 0 0 1 12 6.2 5 5 0 0 1 21.5 9c0 6.8-9.5 12.5-9.5 12.5z', cut: 'M6 9.5A2.5 2.5 0 0 1 8.5 7', dot: [15.5, 10, 1.5], words: 'heart love cœur amour قلب حب' },
  { id: 'candle', shape: `${r(8, 10, 8, 12)}M12 1.5s3 3.2 3 5.2a3 3 0 0 1-6 0c0-2 3-5.2 3-5.2z`, cut: 'M8 14h4', dot: [12, 6.8, 1.2], words: 'candle calm memory bougie souvenir شمعة ذكرى' },
  { id: 'sunrise', shape: `M5 16a7 7 0 0 1 14 0z${r(2, 17.5, 20, 2.5)}`, line: 'M12 3.5V6.5M4.5 8.5l1.8 1.8M19.5 8.5l-1.8 1.8', dot: [12, 12.5, 1.4], words: 'sunrise morning dawn matin aube lever شروق صباح فجر' },
  { id: 'sun', shape: o(12, 12, 5.5), line: 'M12 1.8v2.8M12 19.4v2.8M1.8 12h2.8M19.4 12h2.8M4.8 4.8l2 2M17.2 17.2l2 2M4.8 19.2l2-2M17.2 6.8l2-2', dot: [12, 12, 1.7], words: 'sun day soleil jour شمس نهار' },
  { id: 'moon', shape: 'M21.5 14.2A9.8 9.8 0 1 1 9.8 2.5a7.8 7.8 0 0 0 11.7 11.7z', cut: 'M5.5 12A5 5 0 0 0 8 16.3', dot: [18, 6, 1.6], words: 'moon night ramadan lune nuit قمر ليل رمضان' },
  { id: 'cloud', shape: 'M6.5 19.5a5 5 0 0 1-.6-10 6.5 6.5 0 0 1 12.4 1.5 4.3 4.3 0 0 1-.3 8.5z', dot: [9.5, 14, 1.5], words: 'cloud weather mood nuage météo سحابة طقس' },
  { id: 'rain', shape: 'M6.5 15a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.3 3.9 3.9 0 0 1-.3 7.7z', line: 'M8 18l-1 3M13 18l-1 3M18 18l-1 3', dot: [10.5, 10.5, 1.4], words: 'rain sad weather pluie triste مطر حزن' },
  { id: 'umbrella', shape: 'M12 3a10 10 0 0 1 10 10H2A10 10 0 0 1 12 3z', line: 'M12 1.8V3M12 13v6.5a2 2 0 0 0 4 0', dot: [15.5, 9.5, 1.4], words: 'umbrella protection parapluie مظلة' },
  { id: 'snow', shape: o(12, 12, 3.4), line: 'M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8', dot: [12, 12, 1.3], words: 'snow winter cold neige hiver froid ثلج شتاء' },
  { id: 'flower', shape: `${o(12, 6.5, 4)}${o(17.5, 10.5, 4)}${o(15.4, 17, 4)}${o(8.6, 17, 4)}${o(6.5, 10.5, 4)}`, hole: o(12, 12, 2.7), dot: [12, 12, 1.6], words: 'flower spring jasmine fleur printemps jasmin زهرة ربيع ياسمين' },
  { id: 'leaf', shape: 'M3.5 20.5C3 10 10 3.5 21 2.5c-1 11-7.5 18-17.5 18z', cut: 'M4.5 19.5l9.5-9.5', dot: [15, 14, 1.5], words: 'leaf nature plant feuille ورقة طبيعة' },
  { id: 'tree', shape: `M12 1.5a6 6 0 0 1 5.8 7.5A5.5 5.5 0 0 1 15 18.5H9A5.5 5.5 0 0 1 6.2 9 6 6 0 0 1 12 1.5z${r(10.8, 17, 2.4, 5)}`, cut: 'M12 18v-6M12 13.5l3-3', dot: [9, 8.5, 1.3], words: 'tree nature family arbre famille شجرة عائلة' },
  { id: 'mountain', shape: 'M1.5 21L9 7l4 7.2L15.5 10 22.5 21z', cut: 'M6.5 13.5l2.5 2 2-1.8', dot: [18.5, 5.5, 1.9], words: 'mountain hike goal montagne randonnée جبل' },
  { id: 'wave', shape: 'M2 9c3-5 6-5 9-1 2.6 3.4 5.5 3.6 11 1v12H2z', cut: 'M2 16c3-2.5 6-2.5 9 0s7 2.5 11 0', dot: [18.5, 5, 1.7], words: 'wave sea beach mer plage vague بحر موجة شاطئ' },
  { id: 'fire', shape: 'M12 1.5c.5 4 6.5 6.5 6.5 13a6.5 6.5 0 0 1-13 0c0-2.5 1.2-4.5 3-6 0 2 .8 3 2 3.5-.8-3.5-.2-7.5 1.5-10.5z', dot: [12, 16.5, 1.7], words: 'fire energy feu énergie نار طاقة' },
  { id: 'bird', shape: 'M2 19c0-7 5-12 11-12 .6-2.3 2.2-3.5 4-3.5 2 0 3.4 1.3 3.8 3L23 8l-2.3 1c-.5 6.5-5.5 10-11.7 10z', cut: 'M6 15c3 0 6-1.5 7-5', dot: [16.8, 6.7, 1.1], words: 'bird freedom oiseau liberté طائر عصفور' },
  { id: 'butterfly', shape: 'M12 8C9 3.5 3 2 2.5 6c-.3 3 1.5 6 4.5 6.5C4 13 3.5 17 6 19c2.5 1.8 5-1 6-5 1 4 3.5 6.8 6 5 2.5-2 2-6-1-6.5 3-.5 4.8-3.5 4.5-6.5C21 2 15 3.5 12 8z', cut: 'M12 6v12', dot: [16.5, 8, 1.3], words: 'butterfly change papillon فراشة' },
  { id: 'cat', shape: 'M4 2.5l4.5 4h7L20 2.5V14a8 8 0 0 1-16 0z', cut: 'M8 12h.01M16 12h.01M10.5 16.3l1.5 1 1.5-1', dot: [12, 14.5, 1.2], words: 'cat pet chat animal قطة قط' },
  { id: 'paw', shape: `${o(12, 16, 5)}${o(5.5, 10.5, 2.2)}${o(9.5, 6, 2.3)}${o(14.5, 6, 2.3)}${o(18.5, 10.5, 2.2)}`, dot: [12, 16, 1.4], words: 'paw pet dog chien animal كلب حيوان' },
  { id: 'fish', shape: 'M2 12c3-5 7-7 11-7 3 0 5.5 2 7 4.5L23 6v12l-3-3.5c-1.5 2.5-4 4.5-7 4.5-4 0-8-2-11-7z', cut: 'M11 8c1.5 2.5 1.5 5.5 0 8', dot: [6.8, 10.8, 1.2], words: 'fish sea poisson mer سمكة' },

  // Notes
  { id: 'page', shape: 'M5 2.5h10l4 4v15H5z', cut: 'M15 2.5v4h4M8.5 12h7M8.5 16h4', dot: [15.5, 16, 1.5], words: 'page document note page صفحة' },
  { id: 'bookmark', shape: 'M6 2.5h12V22l-6-4.5L6 22z', dot: [12, 9, 1.8], words: 'bookmark save marque-page signet علامة' },
  { id: 'quote', shape: 'M3 6.5h7.5V13c0 4-2.5 6.5-6 7v-3c1.6-.6 2.5-1.6 2.5-3.5H3zM13.5 6.5H21V13c0 4-2.5 6.5-6 7v-3c1.6-.6 2.5-1.6 2.5-3.5h-4z', dot: [17.2, 10, 1.4], words: 'quote citation اقتباس' },
  { id: 'list', shape: r(3, 3, 18, 18), cut: 'M10 8h7.5M10 12h7.5M10 16h5M6.5 12h.01M6.5 16h.01', dot: [6.5, 8, 1.4], words: 'list items liste قائمة' },
  { id: 'checklist', shape: r(3, 3, 18, 18), cut: 'M6 8l1.5 1.5L10 6.5M13 8h5M6 15l1.5 1.5L10 13.5M13 15h2.5', dot: [18.2, 15, 1.2], words: 'todo tasks check tâches à faire مهام' },
  { id: 'tag', shape: 'M2.5 12V2.5H12l9.5 9.5-9.5 9.5z', dot: [7.5, 7.5, 1.8], words: 'tag label étiquette وسم' },
  { id: 'idea', shape: `M12 2a7.8 7.8 0 0 0-4.6 14.1V18h9.2v-1.9A7.8 7.8 0 0 0 12 2z${r(9, 19.5, 6, 2.5)}`, cut: 'M12 18v-5M9.5 10.5l2.5 2.5 2.5-2.5', dot: [9, 7, 1.3], words: 'idea light bulb idée ampoule فكرة' },
  { id: 'question', shape: o(12, 12, 9.7), cut: 'M9.2 9.3a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1', dot: [12, 17.3, 1.4], words: 'question help aide سؤال' },
  { id: 'target', shape: o(12, 12, 9.7), cut: o(12, 12, 5.5), dot: [12, 12, 2], words: 'target goal objectif cible هدف' },
  { id: 'compass', shape: o(12, 12, 9.7), cut: 'M16 8l-2.5 5.5L8 16l2.5-5.5z', dot: [12, 12, 1.1], words: 'compass direction boussole بوصلة' },
  { id: 'flag', shape: 'M6 3h14l-3.5 5L20 13H6z', line: 'M5 2.5V22', dot: [11, 8, 1.6], words: 'flag milestone drapeau jalon علم' },
  { id: 'star', shape: 'M12 1.8l3.1 6.6 7.1.9-5.2 5 1.3 7.2-6.3-3.5-6.3 3.5L7 14.3l-5.2-5 7.1-.9z', dot: [12, 12.2, 1.8], words: 'star favourite étoile favori نجمة' },
  { id: 'spark', shape: 'M12 1.5l2.8 7.7 7.7 2.8-7.7 2.8L12 22.5l-2.8-7.7L1.5 12l7.7-2.8z', dot: [12, 12, 1.8], words: 'spark signal new étincelle شرارة' },
  { id: 'anchor', shape: o(12, 5, 3.2), line: 'M12 8v13M4 13a8 8 0 0 0 16 0M8 10.5h8', dot: [12, 5, 1.4], words: 'anchor stable ancre مرساة' },
  { id: 'layers', shape: 'M12 2.5L22 8l-10 5.5L2 8zM5 11.7l-3 1.8 10 6 10-6-3-1.8-7 4.2z', dot: [12, 8, 1.5], words: 'layers stack couches طبقات' },

  // Study
  { id: 'book', shape: 'M12 6C9.5 4 6 3.5 2 3.5v15c4 0 7.5.5 10 2.5 2.5-2 6-2.5 10-2.5v-15c-4 0-7.5.5-10 2.5z', cut: 'M12 6v15M5.5 8c1.5 0 3 .3 3.8.8', dot: [17, 9.5, 1.3], words: 'book read reading livre lecture كتاب قراءة' },
  { id: 'notebook', shape: r(6, 2.5, 15, 19), line: 'M3 6.5h4M3 12h4M3 17.5h4', cut: 'M10.5 8h6.5M10.5 12h4', dot: [16, 16, 1.4], words: 'notebook cahier notes كراس دفتر' },
  { id: 'pencil', shape: 'M8 2.5h8V17l-4 5-4-5z', cut: 'M8 7h8M8 17h8', dot: [12, 12, 1.4], words: 'pencil draft crayon brouillon قلم رصاص' },
  { id: 'graduation', shape: 'M12 3.5L23 9l-11 5.5L1 9zM6 13.7l6 3 6-3V18c-1.7 1.7-3.8 2.5-6 2.5S7.7 19.7 6 18z', line: 'M21.5 10v6', dot: [21.5, 18, 1.4], words: 'school study course école cours études دراسة' },
  { id: 'backpack', shape: 'M5 9.5a7 7 0 0 1 14 0V22H5z', line: 'M9.5 3.5V2.5h5v1', cut: 'M8.5 22v-7.5h7V22', dot: [12, 9, 1.6], words: 'backpack school bag sac cartable محفظة حقيبة' },
  { id: 'clipboard', shape: `${r(4, 4, 16, 18)}${r(8.5, 2, 7, 4)}`, cut: 'M8.5 6h7M8 11h8M8 15h5', dot: [15.8, 15.5, 1.3], words: 'exam test homework devoir examen امتحان واجب' },
  { id: 'calculator', shape: r(4.5, 2.5, 15, 19), cut: 'M8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M8 18h.01M12 18h.01', dot: [16, 16, 1.4], words: 'math calculator budget calcul mathématiques حساب رياضيات' },
  { id: 'ruler', shape: 'M2 16.5L16.5 2 22 7.5 7.5 22z', cut: 'M6 12.5L8.5 15M9.5 9L13 12.5M13 5.5L15.5 8', dot: [7, 17, 1.2], words: 'ruler geometry règle géométrie مسطرة هندسة' },
  { id: 'flask', shape: 'M9 2.5h6v2h-1V10l6.2 9.8c.6 1-.1 2.2-1.2 2.2H5c-1.1 0-1.8-1.2-1.2-2.2L10 10V4.5H9z', cut: 'M7.5 15.5h9', dot: [13, 18.5, 1.3], words: 'science lab experiment chemistry laboratoire chimie مختبر كيمياء' },
  { id: 'microscope', shape: `M9.5 2.5h4l1 11h-6z${r(4, 19.5, 16, 2.5)}`, line: 'M14.5 7.5a7 7 0 0 1 2 12', dot: [11.5, 16.5, 1.5], words: 'microscope biology biologie مجهر أحياء' },
  { id: 'atom', shape: o(12, 12, 3), line: 'M2.5 12a9.5 4 0 1 0 19 0a9.5 4 0 1 0-19 0zM7.25 3.77A9.5 4 60 1 0 16.75 20.23A9.5 4 60 1 0 7.25 3.77zM7.25 20.23A9.5 4 -60 1 0 16.75 3.77A9.5 4 -60 1 0 7.25 20.23z', dot: [12, 12, 1.3], words: 'atom physics physique ذرة فيزياء' },
  { id: 'dna', line: 'M7 2.5c0 7 10 12 10 19M17 2.5c0 7-10 12-10 19M8 6.5h8M8.5 17.5h7', dot: [12, 12, 1.7], words: 'dna biology medicine adn médecine طب حمض' },
  { id: 'brain', shape: 'M12 4.5A3.2 3.2 0 0 0 6.3 5.9 3.5 3.5 0 0 0 3.5 10a3.5 3.5 0 0 0 0 5 3.5 3.5 0 0 0 3 4.3 3.2 3.2 0 0 0 5.5 1.2 3.2 3.2 0 0 0 5.5-1.2 3.5 3.5 0 0 0 3-4.3 3.5 3.5 0 0 0 0-5 3.5 3.5 0 0 0-2.8-4.1A3.2 3.2 0 0 0 12 4.5z', cut: 'M12 4.5v16M8 10c1.5 0 2.5.8 2.5 2M16 14c-1.5 0-2.5-.8-2.5-2', dot: [16, 8.5, 1.3], words: 'brain mind psychology cerveau esprit دماغ عقل' },
  { id: 'globe', shape: o(12, 12, 9.7), cut: 'M2.3 12h19.4M12 2.3c-5 5.5-5 14 0 19.4M12 2.3c5 5.5 5 14 0 19.4', dot: [17.8, 6.6, 1.2], words: 'world globe geography monde géographie العالم جغرافيا' },
  { id: 'language', shape: r(2.5, 3.5, 19, 17), cut: 'M6 16l3-8 3 8M7 13.5h4M18.5 9.5c-2-1-3.5 0-3.5 1.3 0 1.7 3.5 1.2 3.5 3 0 1.2-1.5 1.8-3 1.5', dot: [18.5, 17.8, 1.1], words: 'language arabic translate langue arabe لغة عربية' },
  { id: 'palette', shape: 'M12 2.5a9.7 9.7 0 0 0 0 19.4c1.5 0 2.2-1 2.2-2 0-.6-.3-1-.6-1.5-.4-.6-.7-1.1-.7-1.8 0-1.2 1-2.1 2.3-2.1h2.3c2.4 0 4.5-1.8 4.5-4.3C22 5.7 17.6 2.5 12 2.5z', hole: `${o(7.5, 11, 1.3)}${o(9, 7, 1.3)}${o(14, 6.5, 1.3)}`, dot: [17.5, 10, 1.5], words: 'art colour drawing palette dessin couleur فن رسم' },
  { id: 'certificate', shape: `${r(3, 3, 18, 14)}M13 16h6v6.5L16 20l-3 2.5z`, cut: 'M6.5 8h8M6.5 12h4', dot: [16, 13.8, 1.7], words: 'certificate diploma diplôme شهادة' },
  { id: 'glasses', shape: `${o(6.5, 14, 4.5)}${o(17.5, 14, 4.5)}`, hole: `${o(6.5, 14, 2.6)}${o(17.5, 14, 2.6)}`, line: 'M11 13.5c.7-.6 1.3-.6 2 0M2.5 12L5 6M21.5 12L19 6', dot: [17.5, 14, 1.2], words: 'glasses reading lunettes نظارات' },

  // Rooted
  { id: 'mosque', shape: `M12 3c0 2.5 6.5 4 6.5 9v.5h-13V12C5.5 7 12 5.5 12 3z${r(4, 12.5, 15, 9)}${r(20, 7, 2, 14.5)}`, cut: 'M9.5 21.5V17a2 2 0 0 1 4 0v4.5', dot: [21, 4.5, 1.3], words: 'mosque prayer faith mosquée prière مسجد صلاة' },
  { id: 'lantern', shape: `M12 2l4.5 5h-9zM8 8h8l2.5 4-2.5 8H8l-2.5-8z${r(9, 20.5, 6, 1.5)}`, cut: 'M6.5 12h11', dot: [12, 16, 1.5], words: 'lantern ramadan fanous lanterne فانوس رمضان' },
  { id: 'tea', shape: 'M6 5h12l-1.5 16.5h-9z', cut: 'M6.5 10h11', dot: [10.5, 15, 1.4], words: 'tea mint glass thé menthe verre شاي نعناع' },
  { id: 'olive', shape: 'M6 14c-3-1-3.5-3.5-3-6 2.5 0 5 1.5 5.5 4zM12 8.5c-2.5-1-3-3.5-2.5-6 2.5 0 4.5 1.5 5 4zM13 13c3-1.5 6-1 8 1-1.5 2-5 3-8.5 1z', line: 'M3 21C7 17 12 12 20 3', dot: [9, 18, 1.8], words: 'olive branch peace tunisia olivier paix tunisie زيتون سلام تونس' },
  { id: 'palm', shape: 'M12 9C9 5 5 5 2 8c3-.5 6 0 10 1zM12 9c3-4 7-4 10-1-3-.5-6 0-10 1zM12 9C11 5 8 2.5 5 3c2.5 1.5 5 3.5 7 6zM12 9c1-4 4-6.5 7-6-2.5 1.5-5 3.5-7 6z', line: 'M12 9c-.5 4-.5 8 0 12.5', dot: [12, 10.5, 1.2], words: 'palm oasis desert palmier désert نخلة صحراء واحة' },
  { id: 'door', shape: 'M5 21.5V10a7 7 0 0 1 14 0v11.5z', cut: 'M9 21.5V10.5a3 3 0 0 1 6 0v11', dot: [13.3, 15, 1.1], words: 'door home sidi bou said porte باب' },
  { id: 'khamsa', shape: `M5 11h14v5a7 6 0 0 1-14 0z${r(5, 6, 3, 7)}${r(8.7, 3.5, 3, 9)}${r(12.4, 3.5, 3, 9)}${r(16, 6, 3, 7)}M12 22.5l-3-2h6z`, cut: o(12, 15, 2.8), dot: [12, 15, 1.4], words: 'khamsa hamsa hand protection main خمسة كف' },

  // Work
  { id: 'briefcase', shape: r(2.5, 7, 19, 14), line: 'M8.5 7V3.5h7V7', cut: 'M2.5 13h19', dot: [12, 13, 1.7], words: 'work job briefcase travail mallette عمل' },
  { id: 'folder', shape: 'M2 5h7.6l2 2.8H22v12.7H2z', cut: 'M2 11.5h20', dot: [17.5, 16, 1.5], words: 'folder dossier مجلد' },
  { id: 'calendar', shape: r(3, 5, 18, 16.5), line: 'M8 2.5V6M16 2.5V6', cut: 'M3 10h18', dot: [15.5, 15.5, 1.7], words: 'calendar date agenda calendrier تقويم' },
  { id: 'clock', shape: o(12, 12, 9.7), cut: 'M12 6.5V12l3.5 2.5', dot: [12, 12, 1.2], words: 'clock time horloge heure ساعة وقت' },
  { id: 'hourglass', shape: 'M5 2.5h14V7l-5.5 5 5.5 5v4.5H5V17l5.5-5L5 7z', cut: 'M5 5h14M5 19h14', dot: [12, 16, 1.3], words: 'hourglass deadline sablier délai ساعة رملية موعد' },
  { id: 'bell', shape: 'M12 2.5A6.5 6.5 0 0 0 5.5 9c0 5-2.5 7-2.5 8h18c0-1-2.5-3-2.5-8A6.5 6.5 0 0 0 12 2.5zM9.5 18.5a2.5 2.5 0 0 0 5 0z', dot: [17.5, 4.5, 1.9], words: 'bell reminder cloche rappel جرس تذكير' },
  { id: 'chart', shape: `${r(3, 14, 4.5, 7.5)}${r(9.75, 9, 4.5, 12.5)}${r(16.5, 4, 4.5, 17.5)}`, dot: [5.25, 10.5, 1.6], words: 'chart growth graph graphique courbe رسم بياني' },
  { id: 'diagram', shape: `${r(2.5, 2.5, 8, 6)}${r(13.5, 15.5, 8, 6)}`, line: 'M6.5 8.5v10h7M10.5 5.5h5', dot: [17.5, 5.5, 1.9], words: 'diagram system flow schéma نظام' },
  { id: 'table', shape: r(2.5, 3.5, 19, 17), cut: 'M2.5 9.5h19M2.5 15h19M9 9.5v11', dot: [15.3, 17.7, 1.2], words: 'table sheet database tableau base جدول' },
  { id: 'code', shape: r(2.5, 3.5, 19, 17), cut: 'M9 9l-3 3 3 3M15 9l3 3-3 3', dot: [12, 12, 1.5], words: 'code dev programme برمجة' },
  { id: 'gear', shape: cog(8, 7.4, 10.2), hole: o(12, 12, 3.6), dot: [12, 12, 1.6], words: 'settings gear system réglages إعدادات' },
  { id: 'hammer', shape: `M4.5 3h13l3 3.5-3 3h-13z${r(10, 9.5, 4, 12.5)}`, dot: [8, 6.2, 1.4], words: 'hammer build fix marteau construire مطرقة بناء' },
  { id: 'receipt', shape: 'M5 2.5h14V22l-2.3-1.7L14.3 22 12 20.3 9.7 22l-2.4-1.7L5 22z', cut: 'M8.5 7.5h7M8.5 11.5h7M8.5 15.5h3', dot: [15, 15.5, 1.3], words: 'invoice receipt facture reçu فاتورة' },
  { id: 'box', shape: 'M12 2l9.5 5v10.5L12 22l-9.5-4.5V7z', cut: 'M2.5 7L12 12l9.5-5M12 12v10', dot: [7, 14, 1.3], words: 'box archive package boîte colis صندوق' },
  { id: 'paperclip', line: 'M20 11.5L11.5 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-8.7 8.7a1.6 1.6 0 0 1-2.3-2.3l7.5-7.5', dot: [19.5, 18.5, 1.5], words: 'paperclip attachment trombone pièce jointe مشبك مرفق' },
  { id: 'scissors', shape: `${o(6, 18, 3.3)}${o(6, 6, 3.3)}`, hole: `${o(6, 18, 1.4)}${o(6, 6, 1.4)}`, line: 'M8.5 8L21 18M8.5 16L21 6', dot: [16.5, 12, 1.2], words: 'scissors cut ciseaux couper مقص' },
  { id: 'link', line: 'M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1', dot: [19.5, 19.5, 1.5], words: 'link url lien رابط' },
  { id: 'rocket', shape: 'M12 1.5c3.5 2.5 5 6.5 5 10.5 0 1.5-.3 3-.7 4.5H7.7C7.3 15 7 13.5 7 12c0-4 1.5-8 5-10.5zM7 11l-4 4.5v4l4.5-3zM17 11l4 4.5v4l-4.5-3z', line: 'M12 18.5v3', dot: [12, 9, 1.7], words: 'rocket launch project fusée lancement صاروخ مشروع' },
  { id: 'bolt', shape: 'M13.5 1.5L4 13.5h7L9.5 22.5 20 10h-7.5z', dot: [18, 18.5, 1.5], words: 'bolt energy quick éclair rapide برق سريع' },
  { id: 'trophy', shape: `M7 2.5h10v8a5 5 0 0 1-10 0z${r(11, 15, 2, 4)}${r(7.5, 19, 9, 2.5)}`, line: 'M7 4.5H3.5c0 4 1.2 6 3.7 6.5M17 4.5h3.5c0 4-1.2 6-3.7 6.5', dot: [12, 8, 1.5], words: 'trophy win achievement trophée réussite كأس نجاح' },
  { id: 'medal', shape: o(12, 15, 6.7), line: 'M8 2.5l3 7M16 2.5l-3 7', cut: o(12, 15, 4), dot: [12, 15, 1.7], words: 'medal award médaille ميدالية' },
  { id: 'crown', shape: 'M2.5 7l5 5L12 4l4.5 8 5-5-2 13h-15z', cut: 'M4.7 16.5h14.6', dot: [12, 12.5, 1.4], words: 'crown best couronne تاج' },
  { id: 'gem', shape: 'M7 3h10l5 6.5L12 22 2 9.5z', cut: 'M2 9.5h20M8.5 9.5L12 22l3.5-12.5M8.5 9.5L10 3M15.5 9.5L14 3', dot: [12, 6.2, 1.2], words: 'gem precious diamond diamant précieux جوهرة' },

  // Tools of the day
  { id: 'laptop', shape: `${r(4.5, 4, 15, 12)}M2 17.5h20l-1 3H3z`, cut: 'M7.5 8h6', dot: [15, 12, 1.3], words: 'laptop computer ordinateur حاسوب' },
  { id: 'phone', shape: r(6, 1.8, 12, 20.4), cut: 'M6 5h12M6 18.5h12', dot: [12, 12, 1.5], words: 'phone call téléphone appel هاتف' },
  { id: 'mic', shape: 'M8.5 6a3.5 3.5 0 0 1 7 0v6a3.5 3.5 0 0 1-7 0z', line: 'M5 11.5a7 7 0 0 0 14 0M12 18.5v3.2M8.5 21.7h7', dot: [12, 8, 1.2], words: 'mic voice dictation micro voix dictée ميكروفون صوت إملاء' },
  { id: 'headphones', shape: `${r(2, 14, 5, 8)}${r(17, 14, 5, 8)}`, line: 'M3.5 15v-2.5a8.5 8.5 0 0 1 17 0V15', dot: [19.5, 18, 1.2], words: 'headphones podcast listen casque écouter سماعات' },
  { id: 'music', shape: `M8.5 5l12-2.5V16h-2V7.2L10.5 9v9.5h-2z${o(6.3, 18.5, 3.3)}${o(17.3, 16, 3.3)}`, dot: [17.3, 16, 1.3], words: 'music song musique chanson موسيقى' },
  { id: 'camera', shape: 'M2.5 7.5H7l2-3h6l2 3h4.5v13h-19z', cut: o(12, 13.5, 4), dot: [12, 13.5, 1.6], words: 'camera photo appareil صورة كاميرا' },
  { id: 'film', shape: r(2.5, 4, 19, 16), cut: 'M7 4v16M17 4v16M2.5 9H7M2.5 15H7M17 9h4.5M17 15h4.5', dot: [12, 12, 1.7], words: 'film movie cinema cinéma فيلم سينما' },
  { id: 'game', shape: 'M7 6.5h10a5.5 5.5 0 0 1 5.3 7l-1 3.5a3 3 0 0 1-5.2 1L14 16h-4l-2.1 2a3 3 0 0 1-5.2-1l-1-3.5A5.5 5.5 0 0 1 7 6.5z', cut: 'M8 9.5v4M6 11.5h4', dot: [16, 11.5, 1.4], words: 'game play jeu jouer لعبة' },
  { id: 'eye', shape: 'M1.5 12C4.5 6.5 8 4.5 12 4.5s7.5 2 10.5 7.5c-3 5.5-6.5 7.5-10.5 7.5S4.5 17.5 1.5 12z', hole: o(12, 12, 4), dot: [12, 12, 2], words: 'eye see vision œil voir عين رؤية' },
  { id: 'lock', shape: r(4, 10, 16, 12), line: 'M7.5 10V7a4.5 4.5 0 0 1 9 0v3', dot: [12, 16, 1.7], words: 'lock private secret cadenas privé قفل خاص' },
  { id: 'shield', shape: 'M12 2L3.5 5v7c0 5 3.5 8.5 8.5 10 5-1.5 8.5-5 8.5-10V5z', cut: 'M8.5 11l2.5 2.5 4.5-4.5', dot: [12, 18, 1.2], words: 'shield safe protection bouclier sécurité درع أمان' },
  { id: 'key', shape: `${o(8, 16, 5.7)}M10.5 11.5L19 3h2.5v2.5L20 7l1.5 1.5-2.2 2.2-1.5-1.5-1.6 1.6 1.5 1.5-2.2 2.2-1.5-1.5-1.5 1.5z`, dot: [7, 17, 1.7], words: 'key password clé secret mot de passe مفتاح' },

  // Life
  { id: 'home', shape: 'M12 2.5l10 9h-2.5v10h-15v-10H2z', cut: 'M10 21.5V15h4v6.5', dot: [12, 10, 1.5], words: 'home house maison منزل بيت' },
  { id: 'bed', shape: `${r(2, 4, 2.2, 17)}M4 12h18v8H4z${o(8, 9, 2.5)}M11 7.5h8a3 3 0 0 1 3 3V12H11z`, dot: [18, 16, 1.3], words: 'bed sleep dream lit sommeil rêve سرير نوم حلم' },
  { id: 'coffee', shape: 'M3.5 8h14v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z', line: 'M17.5 10h1.3a2.7 2.7 0 0 1 0 5.4h-1.3', cut: 'M7 12v4', dot: [10.5, 4, 1.5], words: 'coffee break café pause قهوة' },
  { id: 'bread', shape: 'M3 6.5C3 4 5.5 3 8 3h8c2.5 0 5 1 5 3.5 0 1.5-.8 2.3-1.5 3V21h-15V9.5C3.8 8.8 3 8 3 6.5z', cut: 'M9 8L7.5 10.5M13 8l-1.5 2.5M17 8l-1.5 2.5', dot: [12, 15.5, 1.4], words: 'bread food recipe pain cuisine recette خبز طبخ وصفة' },
  { id: 'apple', shape: 'M12 7c-1.5-1.5-4-2-6-.8-2.5 1.5-3.5 5-2.5 9 .8 3 2.8 6.3 5 6.3 1.2 0 2-.7 3.5-.7s2.3.7 3.5.7c2.2 0 4.2-3.3 5-6.3 1-4 0-7.5-2.5-9-2-1.2-4.5-.7-6 .8z', line: 'M12 7c0-2 .8-3.8 3-5', dot: [8.5, 12, 1.4], words: 'apple food health pomme santé تفاحة صحة' },
  { id: 'plant', shape: 'M6 14h12l-1.5 8h-9zM12 9C12 5 9 2.5 5 2.5c0 4 3 6.5 7 6.5zM12 11c0-3 2.5-5.5 6.5-5.5 0 3.5-3 5.5-6.5 5.5z', line: 'M12 14V7', dot: [12, 18, 1.3], words: 'plant grow habit plante croissance نبات نمو' },
  { id: 'dumbbell', shape: `${r(1.5, 9, 3, 6)}${r(5, 6, 4, 12)}${r(15, 6, 4, 12)}${r(19.5, 9, 3, 6)}`, line: 'M9 12h6', dot: [7, 12, 1.3], words: 'sport gym dumbbell haltère رياضة' },
  { id: 'ball', shape: o(12, 12, 9.7), cut: 'M5 5.2c3 2.5 3 11 0 13.6M19 5.2c-3 2.5-3 11 0 13.6M2.3 12h19.4', dot: [12, 6.5, 1.3], words: 'ball football sport ballon كرة' },
  { id: 'health', shape: r(2.5, 2.5, 19, 19), cut: 'M12 7v10M7 12h10', dot: [18, 18, 1.2], words: 'health medical santé médical صحة طبي' },
  { id: 'pill', shape: 'M4 13.5L13.5 4A5.3 5.3 0 0 1 21 11.5L11.5 21A5.3 5.3 0 0 1 4 13.5z', cut: 'M9 8.5l7 7', dot: [16, 8.3, 1.4], words: 'pill medicine médicament دواء' },
  { id: 'gift', shape: `${r(3.5, 10, 17, 11.5)}${r(2.5, 7, 19, 3.5)}`, line: 'M12 7C10.5 3 5.5 2 6 5c.2 1.5 3 2 6 2zM12 7c1.5-4 6.5-5 6-2-.2 1.5-3 2-6 2z', cut: 'M12 7v14.5M2.5 10.5h19', dot: [17, 16, 1.4], words: 'gift present cadeau هدية' },
  { id: 'cart', shape: `M6 6h16l-2 8.5H7.6z${o(9, 20, 2)}${o(18, 20, 2)}`, line: 'M1.5 3h3.3l2.5 13h12', dot: [13, 10, 1.5], words: 'shopping cart courses panier تسوق' },
  { id: 'car', shape: `M5 11l2-5.5h10l2 5.5h2.5v7.5h-19V11z${r(4, 18, 3.5, 3)}${r(16.5, 18, 3.5, 3)}`, cut: 'M6.5 11h11M17.5 14.5h.01', dot: [6.5, 14.5, 1.3], words: 'car drive voiture سيارة' },
  { id: 'bike', shape: `${o(5.8, 16.5, 4.3)}${o(18.2, 16.5, 4.3)}`, hole: `${o(5.8, 16.5, 2.6)}${o(18.2, 16.5, 2.6)}`, line: 'M5.8 16.5L10 8.5h6.5l1.7 8M10 8.5l4 8H6M15 5.5h3', dot: [14, 16.5, 1.2], words: 'bike cycling vélo دراجة' },
  { id: 'train', shape: 'M6 2.5h12a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z', line: 'M7.5 19L5 22M16.5 19L19 22', cut: 'M4 11.5h16M12 2.5v9M16 15.3h.01', dot: [8, 15.3, 1.3], words: 'train metro commute métro قطار مترو' },
  { id: 'plane', shape: 'M22 2L2 10.5 9 14l3.5 7.5z', cut: 'M9 14L22 2', dot: [5, 19, 1.5], words: 'travel plane trip voyage avion سفر' },
  { id: 'boat', shape: 'M2 15h20l-3.5 6.5h-13zM11.5 2.5v11H4zM13 5l7 8.5h-7z', dot: [8.5, 18.3, 1.2], words: 'boat sail bateau voile قارب' },
  { id: 'suitcase', shape: r(4, 7, 16, 14.5), line: 'M9 7V3.5h6V7', cut: 'M8.5 7v14.5M15.5 7v14.5', dot: [12, 14, 1.4], words: 'suitcase trip holiday valise vacances حقيبة سفر عطلة' },
  { id: 'tent', shape: 'M12 2.5l10.5 19h-21z', cut: 'M12 10L8 21.5M12 10l4 11.5', dot: [12, 7, 1.3], words: 'tent camping tente خيمة' },
  { id: 'pin', shape: 'M12 22s-7.5-6.8-7.5-12.5a7.5 7.5 0 0 1 15 0C19.5 15.2 12 22 12 22z', dot: [12, 9.5, 2.2], words: 'place location map lieu carte مكان خريطة' },

  // People and money
  { id: 'person', shape: `${o(12, 7.5, 5)}M3 22a9 9 0 0 1 18 0z`, dot: [19.5, 5, 1.5], words: 'person me profile personne moi شخص' },
  { id: 'people', shape: `${o(8.5, 8, 4.2)}M1.5 21a7 7 0 0 1 14 0z${o(17, 9, 3.2)}M17 14a5.5 5.5 0 0 1 5.5 7h-5c0-2.7-.9-5-2.6-6.6A5.5 5.5 0 0 1 17 14z`, dot: [8.5, 8, 1.4], words: 'people team client équipe clients فريق ناس' },
  { id: 'chat', shape: 'M2.5 3.5h19v14H11l-5 4.5v-4.5H2.5z', cut: 'M7.5 10.5h.01M12 10.5h.01', dot: [16.5, 10.5, 1.4], words: 'chat meeting message réunion discussion محادثة' },
  { id: 'mail', shape: r(2, 4.5, 20, 15), cut: 'M2.5 5.5L12 13l9.5-7.5', dot: [18, 16, 1.4], words: 'mail email letter courrier lettre بريد' },
  { id: 'coins', shape: 'M4 5.5C4 3.6 7.6 2.5 12 2.5s8 1.1 8 3v13c0 1.9-3.6 3-8 3s-8-1.1-8-3z', cut: 'M4 6c1 1.5 4 2.2 8 2.2s7-.7 8-2.2M4 12.5c1 1.5 4 2.2 8 2.2s7-.7 8-2.2', dot: [12, 5, 1.2], words: 'money coins finance argent pièces مال' },
  { id: 'wallet', shape: `${r(2.5, 6, 19, 15)}${r(4.5, 3.5, 13, 2.5)}`, cut: 'M21.5 11.5h-5a2.5 2.5 0 0 0 0 5h5', dot: [17, 14, 1.2], words: 'wallet budget expenses portefeuille dépenses محفظة مصاريف' },
];

/** Eight colours from the brand palette (see tokens.css `--icon-*`). */
export const ICON_COLOURS = ['ink', 'graphite', 'lapis', 'sea', 'ember', 'brick', 'olive', 'sand'] as const;
export type IconColour = (typeof ICON_COLOURS)[number];

const BY_ID = new Map(ICONS.map((i) => [i.id, i]));

/** "leaf:ember" → the icon and its colour; null when unknown. */
export function parseIcon(value: string | null | undefined): { def: IconDef; colour: IconColour } | null {
  if (!value) return null;
  const [id, colour] = value.split(':');
  const def = BY_ID.get(id);
  if (!def) return null;
  return { def, colour: (ICON_COLOURS as readonly string[]).includes(colour) ? (colour as IconColour) : 'ink' };
}
