import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProbePage from './page';

describe('ProbePage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders connect and log panel', () => {
    window.history.replaceState({}, '', '/probe');
    render(<ProbePage />);
    expect(screen.getByTestId('probe-connect')).toBeInTheDocument();
    expect(screen.getByTestId('probe-log')).toBeInTheDocument();
  });

  it('handles missing bluetooth and send without session', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    window.history.replaceState({}, '', '/probe');
    render(<ProbePage />);
    await user.click(screen.getByTestId('probe-connect'));
    expect(screen.getByTestId('probe-status')).toHaveTextContent(/unavailable/i);
    await user.click(screen.getByTestId('probe-send'));
    expect(screen.getByTestId('probe-log')).toBeInTheDocument();
  });

  it('connects with a fake bluetooth and disconnects', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const fakeChar = {
      writeValue: async () => { await Promise.resolve(); },
      startNotifications: async () => { await Promise.resolve(); return fakeChar; },
      addEventListener: () => {},
    };
    const fakeService = { getCharacteristic: async () => { await Promise.resolve(); return fakeChar; } };
    const fakeServer = { connected: true, disconnect: () => {}, getPrimaryService: async () => { await Promise.resolve(); return fakeService; } };
    const fakeDevice = { gatt: { connect: async () => { await Promise.resolve(); return fakeServer; } } };
    const fakeBt = { requestDevice: async () => { await Promise.resolve(); return fakeDevice; } };
    (globalThis as unknown as { navigator: { bluetooth: unknown } }).navigator = {
      bluetooth: fakeBt,
    };
    window.history.replaceState({}, '', '/probe');
    render(<ProbePage />);
    await user.click(screen.getByTestId('probe-connect'));
    await user.click(screen.getByTestId('probe-disconnect'));
    expect(screen.getByTestId('probe-log')).toBeInTheDocument();
  });
});