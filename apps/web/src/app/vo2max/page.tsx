'use client';

import { useState } from 'react';
import { estimateCooper, estimateRockport, vo2maxCategory, type Sex } from '@/lib/vo2max';

type TestType = 'cooper' | 'rockport';

export default function Vo2MaxPage() {
  const [test, setTest] = useState<TestType>('cooper');
  const [distance, setDistance] = useState('2000');
  const [weight, setWeight] = useState('70');
  const [age, setAge] = useState('30');
  const [sex, setSex] = useState<Sex>('male');
  const [timeMin, setTimeMin] = useState('15');
  const [hr, setHr] = useState('140');
  const [result, setResult] = useState<number | null>(null);

  function compute(): void {
    let vo2 = 0;
    if (test === 'cooper') {
      vo2 = estimateCooper(Number(distance));
    } else {
      vo2 = estimateRockport(Number(weight), Number(age), sex, Number(timeMin), Number(hr));
    }
    setResult(Math.round(vo2 * 10) / 10);
    try {
      localStorage.setItem('noop-cmf-vo2max', String(vo2));
    } catch {
      // ignore
    }
  }

  const category = result !== null ? vo2maxCategory(result, Number(age), sex) : null;

  return (
    <section aria-label="VO2 max" className="space-y-4">
      <header>
        <p className="text-sm text-muted">Fitness estimate</p>
        <h1 className="text-2xl font-semibold text-foreground">VO2 Max Estimator</h1>
        <p className="text-sm text-muted max-w-prose">
          Estimate your VO2 max from a running test. Cooper: run as far as you can in 12 minutes. Rockport: walk 1 mile as fast as possible.
        </p>
      </header>
      <div className="rounded-2xl border border-line bg-card p-6 space-y-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={test === 'cooper'} onChange={() => { setTest('cooper'); }} />
            Cooper (12-min run)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={test === 'rockport'} onChange={() => { setTest('rockport'); }} />
            Rockport (1-mile walk)
          </label>
        </div>
        {test === 'cooper' ? (
          <label className="block text-sm">
            Distance (meters)
            <input className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={distance} onChange={(e) => { setDistance(e.target.value); }} />
          </label>
        ) : (
          <>
            <label className="block text-sm">
              Weight (kg)
              <input className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={weight} onChange={(e) => { setWeight(e.target.value); }} />
            </label>
            <label className="block text-sm">
              Age
              <input className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={age} onChange={(e) => { setAge(e.target.value); }} />
            </label>
            <label className="block text-sm">
              Sex
              <select className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={sex} onChange={(e) => { setSex(e.target.value as Sex); }}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="block text-sm">
              Time (minutes)
              <input className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={timeMin} onChange={(e) => { setTimeMin(e.target.value); }} />
            </label>
            <label className="block text-sm">
              Heart rate at finish (bpm)
              <input className="mt-1 w-full rounded border border-line bg-void px-3 py-2" value={hr} onChange={(e) => { setHr(e.target.value); }} />
            </label>
          </>
        )}
        <button
          type="button"
          onClick={compute}
          className="rounded-full bg-recovery px-5 py-2 text-sm font-semibold text-[#0e0d0b]"
        >
          Estimate
        </button>
        {result !== null ? (
          <div className="border-t border-line pt-4" data-testid="vo2-result">
            <p className="text-lg font-semibold text-foreground">VO2 max: {result} ml/kg/min</p>
            <p className="text-sm text-muted">Category: {category}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}