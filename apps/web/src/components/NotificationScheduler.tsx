'use client';

import { useEffect } from 'react';
import { getDatabase } from '@/db/database';
import { loadOverview } from '@/lib/db-analytics';

/** Requests notification permission and schedules "time to sleep" / "recovery ready" nudges. */
export function NotificationScheduler() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const db = getDatabase();
        const view = await loadOverview(db);
        if (cancelled || !view) return;
        const now = new Date();
        const hour = now.getHours();
        // Time to sleep: sleep debt > 60 min and evening
        if (view.sleepPerformance < 70 && hour >= 20) {
          new Notification('Time to sleep', {
            body: `Sleep performance is ${String(view.sleepPerformance)}%. Consider winding down.`,
            tag: 'sleep',
          });
        }
        // Recovery ready: high recovery, low strain
        if (view.recovery >= 80 && view.strain < view.strainTarget) {
          new Notification('Recovery ready', {
            body: `Recovery ${String(view.recovery)}% — good day to go hard. Target strain ${String(view.strainTarget)}.`,
            tag: 'recovery',
          });
        }
      } catch {
        // ignore
      }
    }
    void check();
    return () => { cancelled = true; };
  }, []);

  return null;
}