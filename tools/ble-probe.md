# CMF Watch BLE probe

Manual protocol-discovery aid for the recorded-data fetch payloads.

1. Start the web app: `pnpm --filter web dev`.
2. Open http://localhost:3000/probe in a Chromium-based browser.
3. Click **Connect** and choose the CMF watch.
4. If first time, pair via the shell channel (the probe uses `pairWatch` internally only when no auth key is stored; for now use the sync page flow or run `pairWatch` from devtools). Reconnect uses the stored auth key.
5. Use the command dropdown + hex payload field to send candidate fetch commands (`ACTIVITY_FETCH_1`, `ACTIVITY_FETCH_2`, `TRIGGER_SYNC`, per-metric). Watch the log panel for replies and decoded payloads.
6. Record working request payloads and reply decoders in `packages/cmf-ble/src/cmf-ble-provider.ts` fetch methods and `wire.ts`.

Notes:
- Web Bluetooth requires a user gesture and Chromium; iOS Safari is unsupported.
- Pairing may re-key the watch; Nothing X may need re-pairing afterwards.
- Test watch: `CMF Watch Pro 2-D70F`, auth key `263027dc872a14fe25daf3155cb00973`.