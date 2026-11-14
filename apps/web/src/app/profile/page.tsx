'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDatabase } from '@/db/database';
import { loadUserProfile, saveUserProfile } from '@/lib/user-profile';
import type { UserProfile } from '@/lib/user-profile';
import { errorMessage } from '@/lib/errors';

function toInputNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export default function ProfilePage() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restingHeartRate, setRestingHeartRate] = useState('');
  const [maxHeartRate, setMaxHeartRate] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'' | 'male' | 'female' | 'other'>('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [dayStartHour, setDayStartHour] = useState<'0' | '2'>('0');

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const db = getDatabase();
        const profile = await loadUserProfile(db);
        if (cancelled) return;
        if (profile) {
          setRestingHeartRate(toInputNumber(profile.restingHeartRate));
          setMaxHeartRate(toInputNumber(profile.maxHeartRate));
          setAge(toInputNumber(profile.age));
          setSex(profile.sex ?? '');
          setHeightCm(profile.heightCm !== undefined ? String(profile.heightCm) : '');
          setWeightKg(profile.weightKg !== undefined ? String(profile.weightKg) : '');
          setDayStartHour(profile.dayStartHour === 2 ? '2' : '0');
        }
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load profile.'));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function onSave(): Promise<void> {
    setStatus(null);
    setError(null);

    const rhr = restingHeartRate.trim() === '' ? undefined : Number(restingHeartRate);
    const maxHr = maxHeartRate.trim() === '' ? undefined : Number(maxHeartRate);
    const ageVal = age.trim() === '' ? undefined : Number(age);
    const heightVal = heightCm.trim() === '' ? undefined : Number(heightCm);
    const weightVal = weightKg.trim() === '' ? undefined : Number(weightKg);

    if (rhr !== undefined && (!Number.isFinite(rhr) || rhr < 30 || rhr > 120)) {
      setError('Resting heart rate must be between 30 and 120 bpm.');
      return;
    }
    if (maxHr !== undefined && (!Number.isFinite(maxHr) || maxHr < 100 || maxHr > 230)) {
      setError('Max heart rate must be between 100 and 230 bpm.');
      return;
    }
    if (rhr !== undefined && maxHr !== undefined && maxHr <= rhr) {
      setError('Max heart rate must be greater than resting heart rate.');
      return;
    }
    if (ageVal !== undefined && (!Number.isFinite(ageVal) || ageVal < 10 || ageVal > 120)) {
      setError('Age must be between 10 and 120.');
      return;
    }
    if (heightVal !== undefined && (!Number.isFinite(heightVal) || heightVal < 80 || heightVal > 250)) {
      setError('Height must be between 80 and 250 cm.');
      return;
    }
    if (weightVal !== undefined && (!Number.isFinite(weightVal) || weightVal < 20 || weightVal > 300)) {
      setError('Weight must be between 20 and 300 kg.');
      return;
    }

    const patch: Partial<Omit<UserProfile, 'id'>> = {
      dayStartHour: dayStartHour === '2' ? 2 : 0,
    };
    if (rhr !== undefined) patch.restingHeartRate = Math.round(rhr);
    if (maxHr !== undefined) patch.maxHeartRate = Math.round(maxHr);
    if (ageVal !== undefined) patch.age = Math.round(ageVal);
    if (sex !== '') patch.sex = sex;
    if (heightVal !== undefined) patch.heightCm = heightVal;
    if (weightVal !== undefined) patch.weightKg = weightVal;

    setSaving(true);
    try {
      const db = getDatabase();
      await saveUserProfile(patch, db);
      setStatus('Profile saved. Strain, recovery, readiness, and training metrics will use your personal baselines.');
    } catch (err) {
      setError(errorMessage(err, 'Failed to save profile.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Profile" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Personalization</p>
        <h1 className="text-2xl font-semibold text-foreground">Profile &amp; metrics</h1>
        <p className="text-sm text-muted max-w-prose">
          Set your personal metrics to calibrate strain, recovery, and training load (HR zones/TRIMP). This data is
          stored only on this device and included in JSON exports you create.
        </p>
      </header>

      <div className="rounded-2xl border border-line bg-card p-6">
        {error ? <p role="alert" className="mb-3 text-sm text-red-400">{error}</p> : null}
        {status ? <p className="mb-3 text-sm text-recovery" data-testid="profile-saved">{status}</p> : null}
        {!loaded ? (
          <p aria-busy="true">Loading profile…</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void onSave(); }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-muted">
                Resting heart rate (bpm)
                <input
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={120}
                  value={restingHeartRate}
                  onChange={(e) => { setRestingHeartRate(e.target.value); }}
                  placeholder="e.g. 60"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                  data-testid="profile-rhr"
                />
                <span className="mt-1 block text-xs text-faint">Used for HR reserve/zones and recovery baselines. Default: 50.</span>
              </label>
              <label className="block text-sm text-muted">
                Max heart rate (bpm)
                <input
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={230}
                  value={maxHeartRate}
                  onChange={(e) => { setMaxHeartRate(e.target.value); }}
                  placeholder="e.g. 201"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                  data-testid="profile-max-hr"
                />
                <span className="mt-1 block text-xs text-faint">Highest HR you’ve observed. Used for HR zones/TRIMP/strain. Default: 190.</span>
              </label>
              <label className="block text-sm text-muted">
                Age (years)
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={120}
                  value={age}
                  onChange={(e) => { setAge(e.target.value); }}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                />
              </label>
              <label className="block text-sm text-muted">
                Sex
                <select
                  value={sex}
                  onChange={(e) => { setSex(e.target.value as '' | 'male' | 'female' | 'other'); }}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm text-muted">
                Height (cm)
                <input
                  type="number"
                  inputMode="decimal"
                  min={80}
                  max={250}
                  value={heightCm}
                  onChange={(e) => { setHeightCm(e.target.value); }}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                />
              </label>
              <label className="block text-sm text-muted">
                Weight (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={300}
                  value={weightKg}
                  onChange={(e) => { setWeightKg(e.target.value); }}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground"
                />
              </label>
            </div>

            <label className="block text-sm text-muted">
              Day starts at (for daily steps/reset)
              <select
                value={dayStartHour}
                onChange={(e) => { setDayStartHour(e.target.value === '2' ? '2' : '0'); }}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-foreground sm:max-w-xs"
                data-testid="profile-day-start"
              >
                <option value="0">12:00 AM (midnight, local)</option>
                <option value="2">2:00 AM (local)</option>
              </select>
              <span className="mt-1 block text-xs text-faint">
                Controls how “today’s” steps are counted (use 2:00 AM if you want late-night activity to count toward the previous day).
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-strain px-5 py-2 text-sm font-semibold text-[#0e0d0b] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="profile-save"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              <Link href="/sync" className="text-sm text-muted underline hover:text-foreground">
                Back to Sync
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted space-y-2">
        <p className="font-semibold text-foreground">How this is used</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Resting and max heart rate personalize HR zones, TRIMP/strain, recovery, and training load calculations from your raw samples.</li>
          <li>Weight, height, age, and sex are stored for future personalization (e.g. energy/calorie estimates) and included in your exports.</li>
          <li>Metrics are recomputed from your existing synced data using the current profile; no backend or account is involved.</li>
          <li>Steps use a local day boundary (midnight or 2:00 AM) so “Today” resets as expected; sleep views focus on the main overnight session and may differ from the watch if sleep stages were recorded while not worn.</li>
        </ul>
      </div>
    </section>
  );
}
