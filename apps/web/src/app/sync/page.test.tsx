import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncPage from './page';

describe('SyncPage', () => {
  afterEach(() => {
    cleanup();
  });
  it('restores status when data exists', async () => {
    const { getDatabase } = await import('@/db/database');
    const db = getDatabase();
    await db.hrSamples.put({ timestamp: 1, bpm: 70 } as never);
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    await screen.findByText(/Restored/i, {}, { timeout: 5000 });
  }, 10000);

  it('offers the dropzone and sync buttons', () => {
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    expect(screen.getByTestId('db-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('ble-sync')).toBeInTheDocument();
    expect(screen.getByTestId('push-recovery')).toBeInTheDocument();
  });

  it('pushes recovery to the watch', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    await user.click(screen.getByTestId('push-recovery'));
    await screen.findByText('Recovery pushed to watch.', {}, { timeout: 30000 });
  }, 40000);

  it('attempts a BLE sync without bluetooth', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    await user.click(screen.getByTestId('ble-sync'));
    await screen.findByText(/Web Bluetooth is not available/i, {}, { timeout: 5000 });
  }, 10000);

  it('handles a dropped file', async () => {
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    const file = new File(['dummy'], 'test.db', { type: 'application/octet-stream' });
    const dropzone = screen.getByTestId('db-dropzone');
    // trigger drop
    const dataTransfer = { files: [file], types: ['Files'] };
    dropzone.dispatchEvent(new Event('dragover', { bubbles: true }));
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);
    await screen.findByText(/Import failed|Could not parse|Parsing/i, {}, { timeout: 10000 });
  }, 15000);

  it('attempts a BLE sync with a fake bluetooth', async () => {
    const user = userEvent.setup();
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
    window.history.replaceState({}, '', '/sync');
    render(<SyncPage />);
    await user.click(screen.getByTestId('ble-sync'));
    await screen.findByText(/BLE sync failed|Connect failed|Web Bluetooth/i, {}, { timeout: 10000 });
  }, 15000);
});