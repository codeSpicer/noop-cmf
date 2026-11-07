'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => { window.removeEventListener('beforeinstallprompt', handler); };
  }, []);

  if (!deferred || hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 rounded-lg border border-line bg-card p-3 shadow-lg">
      <button
        type="button"
        onClick={() => {
          void deferred.prompt();
          setDeferred(null);
        }}
        className="text-sm font-semibold text-foreground"
      >
        Install app
      </button>
      <button
        type="button"
        onClick={() => { setHidden(true); }}
        className="ml-2 text-xs text-muted"
      >
        dismiss
      </button>
    </div>
  );
}