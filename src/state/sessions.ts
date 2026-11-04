import { db, type StudySession } from '../db/db';
import { loadUserState, recordAttempt, saveSession } from '../db/repo';
import { selectQuestions, type PracticeConfig } from '../domain/selection';
import { newSeed } from '../domain/random';
import { ratingFromAnswer } from '../domain/srs';
import type { Question } from '../domain/types';
import { setSetting } from './settings';

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const FILTER_LABELS: Record<PracticeConfig['filter'], string> = {
  all: 'すべて',
  unanswered: '未回答の問題',
  wrong: '間違えた問題',
  bookmarked: 'ブックマーク',
  later: '後で復習',
  weak: '苦手分野優先',
  due: '復習予定',
  unsure: '理解が曖昧な問題',
  stale: '長期間未学習',
};

export interface StartResult {
  sessionId: string | null;
  count: number;
}

/** 通常演習を開始する（出題条件を記憶する） */
export async function startPractice(pool: Question[], cfg: PracticeConfig, title?: string, remember = true): Promise<StartResult> {
  const u = await loadUserState();
  const qs = selectQuestions(pool, cfg, u, newSeed());
  if (remember) await setSetting('lastPractice', cfg);
  if (qs.length === 0) return { sessionId: null, count: 0 };
  const now = new Date().toISOString();
  const s: StudySession = {
    id: newId(),
    kind: 'practice',
    title: title ?? `${FILTER_LABELS[cfg.filter]}（${qs.length}問）`,
    config: cfg,
    itemIds: qs.map((q) => q.id),
    answers: {},
    flagged: [],
    index: 0,
    startedAt: now,
    updatedAt: now,
  };
  await saveSession(s);
  return { sessionId: s.id, count: qs.length };
}

/**
 * 解答の確定（履歴への記録と復習間隔の更新）。
 * 「自信なし」を解答後に付け外しできるよう、次の問題へ進むときに確定する。
 */
export async function commitAnswer(s: StudySession, q: Question, mode: string): Promise<StudySession> {
  const a = s.answers[q.id];
  if (!a || a.correct === undefined || a.committed) return s;
  const next = { ...s, answers: { ...s.answers, [q.id]: { ...a, committed: true } } };
  // 「次の問題へ」の連打（ダブルタップ）などで同時に呼ばれても二重に記録しないよう、
  // 確定済みかの確認・履歴の記録・確定フラグの保存を1つのトランザクションで行う
  await db.transaction('rw', db.sessions, db.attempts, db.srs, async () => {
    const stored = await db.sessions.get(s.id);
    if (stored?.answers[q.id]?.committed) return;
    await recordAttempt(
      {
        itemId: q.id,
        itemKind: 'question',
        exam: q.exam,
        field: q.field,
        correct: a.correct!,
        unsure: !!a.unsure,
        timeMs: a.timeMs ?? 0,
        sessionId: s.id,
        mode,
      },
      ratingFromAnswer(a.correct!, !!a.unsure),
    );
    await saveSession(next);
  });
  return next;
}

/** 中断したセッションで、確定前の解答があれば確定する */
export async function commitPending(s: StudySession, byId: Map<string, Question>, mode: string): Promise<StudySession> {
  let cur = s;
  for (const id of s.itemIds) {
    const q = byId.get(id);
    if (q) cur = await commitAnswer(cur, q, mode);
  }
  return cur;
}

export async function finishSession(s: StudySession): Promise<void> {
  await db.sessions.put({ ...s, finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}
