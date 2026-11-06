import i18n from '../../i18n';
import { formatDay, noteDay, todayIso } from '../../lib/dates';
import { useApp } from '../../store';

let creating: Promise<unknown> | null = null;

/** Opens the journal entry for `day`, creating it (titled with the date) if there is none. */
export async function openJournal(day: string) {
  // A double click must not make two entries for one day.
  await creating;
  const { notes, open, createNote } = useApp.getState();
  const existing = notes.find((n) => n.journal && !n.trashedAt && noteDay(n) === day);
  if (existing) return open({ kind: 'page', id: existing.id });
  creating = createNote({ date: day, journal: true, title: formatDay(day, i18n.language) }).finally(() => (creating = null));
  await creating;
}

export const openTodayJournal = () => openJournal(todayIso());
