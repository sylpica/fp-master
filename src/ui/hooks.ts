import { useLiveQuery } from 'dexie-react-hooks';
import { examKeyOf, lawBaseDateFor } from '../domain/exam';
import type { ExamKey } from '../domain/types';
import { localDate } from '../domain/srs';
import { useSettings } from '../state/settings';
import { loadUserState } from '../db/repo';

export function useExamKey(): ExamKey | undefined {
  const s = useSettings();
  if (!s) return undefined;
  // 金融リテラシー検定は級・科目の区別がなく、単一の試験区分 'lit'
  return s.unit === 'lit' ? 'lit' : examKeyOf(s.grade, s.subject);
}

/** 受験予定日（未設定なら今日）に適用される法令基準日 */
export function useCurrentLawBaseDate(): string | null {
  const s = useSettings();
  return lawBaseDateFor(s?.examDate ?? localDate());
}

export function useUserState() {
  return useLiveQuery(loadUserState, []);
}
