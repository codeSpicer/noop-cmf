'use client';

import { useState } from 'react';
import { computeHabitImpacts } from '@noop-cmf/physio-engine';
import { getDatabase } from '@/db/database';

const HABITS = ['alcohol', 'caffeine', 'late-meal', 'screens', 'exercise'] as const;

const HABIT_LABELS: Record<(typeof HABITS)[number], string> = {
  alcohol: 'Alcohol',
  caffeine: 'Caffeine',
  'late-meal': 'Late meal',
  screens: 'Screen time',
  exercise: 'Exercise',
};

/** Journal route: morning checklist persisted to IndexedDB + impact bars. */
export default function JournalPage() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [impacts, setImpacts] = useState<ReturnType<typeof computeHabitImpacts>>([]);

  function toggle(habit: string): void {
    setChecks((prev) => ({ ...prev, [habit]: !prev[habit] }));
    setSaved(false);
  }

  async function submit(): Promise<void> {
    const db = getDatabase();
    const today = new Date().toISOString().slice(0, 10);
    await db.journalEntries.put({ date: today, habits: checks });
    setSaved(true);
    const entries = await db.journalEntries.toArray();
    setImpacts(
      computeHabitImpacts(
        entries.map((entry) => ({ entry, recovery: undefined, ehrv: undefined })),
      ),
    );
  }

  return (
    <section aria-label="Journal" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Habits</p>
        <h1 className="text-2xl font-semibold text-foreground">Morning Journal</h1>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="rounded-2xl border border-line bg-card p-6"
      >
        <fieldset>
          <legend className="mb-3 text-sm text-muted">Yesterday&apos;s habits</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {HABITS.map((habit) => (
              <label
                key={habit}
                className="inline-flex items-center gap-2 text-sm text-foreground py-2 min-h-11"
              >
                <input
                  type="checkbox"
                  checked={checks[habit] ?? false}
                  onChange={() => {
                    toggle(habit);
                  }}
                  aria-label={HABIT_LABELS[habit]}
                  className="h-4 w-4 accent-recovery"
                />
                {HABIT_LABELS[habit]}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="mt-6 rounded-full bg-recovery px-5 py-2 text-sm font-semibold text-[#0e0d0b]"
          data-testid="journal-submit"
        >
          Save entry
        </button>
      </form>
      {saved ? (
        <p role="status" data-testid="journal-saved" className="text-sm text-recovery">
          Entry saved.
        </p>
      ) : null}
      <div className="rounded-2xl border border-line bg-card p-6" data-testid="impact-bars">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Habit impact (recovery delta)</h2>
        {impacts.length === 0 ? (
          <p className="text-xs text-muted">Save entries to see impact.</p>
        ) : (
          impacts.map((impact) => {
            const delta = impact.recoveryDelta ?? 0;
            const width = Math.min(100, Math.abs(delta) * 10);
            const color = delta >= 0 ? 'bg-recovery' : 'bg-red-400';
            return (
              <div key={impact.habit} className="py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{HABIT_LABELS[impact.habit as (typeof HABITS)[number]]}</span>
                  <span className="text-foreground">
                    {impact.recoveryDelta === null ? 'insufficient data' : `${impact.recoveryDelta.toFixed(1)}%`}
                  </span>
                </div>
                {impact.recoveryDelta !== null ? (
                  <div className="mt-1 h-2 w-full rounded-full bg-surface">
                    <div className={`h-2 rounded-full ${color}`} style={{ width: `${String(width)}%` }} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
