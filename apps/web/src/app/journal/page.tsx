'use client';

import { useState } from 'react';
import { computeHabitImpacts } from '@noop-cmf/physio-engine';
import { getDatabase } from '@/db/database';

const HABITS = ['alcohol', 'caffeine', 'late-meal', 'screens', 'exercise'] as const;

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
    <section aria-label="Journal">
      <h1 className="mb-4 text-2xl font-bold">Morning Journal</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend className="mb-2">Yesterday&apos;s habits</legend>
          {HABITS.map((habit) => (
            <label key={habit} className="mr-4 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={checks[habit] ?? false}
                onChange={() => {
                  toggle(habit);
                }}
                aria-label={habit}
              />
              {habit}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          className="mt-4 rounded bg-recovery px-4 py-2 text-black"
          data-testid="journal-submit"
        >
          Save entry
        </button>
      </form>
      {saved ? (
        <p role="status" data-testid="journal-saved">
          Entry saved.
        </p>
      ) : null}
      <div className="mt-4" data-testid="impact-bars">
        {impacts.map((impact) => (
          <div key={impact.habit}>
            {impact.habit}:{' '}
            {impact.recoveryDelta === null ? 'insufficient data' : impact.recoveryDelta.toFixed(1)}
          </div>
        ))}
      </div>
    </section>
  );
}
