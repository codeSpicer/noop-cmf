/**
 * GATT identifiers for CMF Watch Pro 2 (Nothing "leopard" platform).
 *
 * Values below were captured from a live read-only probe of device
 * "CMF Watch Pro 2-D70F" (see `fixtures/cmf-watch-pro-2-gatt.json`).
 * Standard SIG UUIDs are 16-bit aliases; vendor channels are full 128-bit.
 */

/** Battery Service (SIG): exposes the battery-level characteristic. */
export const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';

/** Battery Level characteristic (uint8 percent, SIG). */
export const BATTERY_LEVEL_CHAR_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

/** Device Information service (SIG). */
export const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';

/** Model Number String ("leopard" on the probed unit). */
export const MODEL_NUMBER_CHAR_UUID = '00002a24-0000-1000-8000-00805f9b34fb';

/** Manufacturer Name String. */
export const MANUFACTURER_NAME_CHAR_UUID = '00002a29-0000-1000-8000-00805f9b34fb';

/** PnP ID characteristic. */
export const PNP_ID_CHAR_UUID = '00002a50-0000-1000-8000-00805f9b34fb';

/** Client Characteristic Configuration descriptor (notify enable). */
export const CCC_DESCRIPTOR_UUID = '00002902-0000-1000-8000-00805f9b34fb';

/** Vendor data channel service with write + notify characteristics. */
export const VENDOR_FFD0_SERVICE_UUID = '0000ffd0-0000-1000-8000-00805f9b34fb';

/** Write characteristic on the FFD0 vendor channel. */
export const VENDOR_FFD1_WRITE_CHAR_UUID = '0000ffd1-0000-1000-8000-00805f9b34fb';

/** Notify characteristic on the FFD0 vendor channel. */
export const VENDOR_FFD2_NOTIFY_CHAR_UUID = '0000ffd2-0000-1000-8000-00805f9b34fb';

/** Write+notify characteristic on the FFD0 vendor channel. */
export const VENDOR_FFD3_WRITE_NOTIFY_CHAR_UUID = '0000ffd3-0000-1000-8000-00805f9b34fb';

/** Actions/Zephyr-style write/notify channel `e49a30xx`. */
export const ATS_E49A_SERVICE_UUID = 'e49a3001-f69a-11e8-8eb2-f2801f1b9fd1';

/** Write characteristic on the E49A channel. */
export const ATS_E49A_WRITE_CHAR_UUID = 'e49a3002-f69a-11e8-8eb2-f2801f1b9fd1';

/** Notify characteristic on the E49A channel. */
export const ATS_E49A_NOTIFY_CHAR_UUID = 'e49a3003-f69a-11e8-8eb2-f2801f1b9fd1';

/** Vendor channel on service base `02f00000-...-fe00`. */
export const VENDOR_FE00_SERVICE_UUID = '02f00000-0000-0000-0000-00000000fe00';

/** Write characteristic on the FE00 channel. */
export const VENDOR_FF01_WRITE_CHAR_UUID = '02f00000-0000-0000-0000-00000000ff01';

/** Notify characteristic on the FE00 channel. */
export const VENDOR_FF02_NOTIFY_CHAR_UUID = '02f00000-0000-0000-0000-00000000ff02';

/** Vendor channel on service base `02f00000-...-ffe0`. */
export const VENDOR_FFE0_SERVICE_UUID = '02f00000-0000-0000-0000-00000000ffe0';

/** Write characteristic on the FFE0 channel. */
export const VENDOR_FFE1_WRITE_CHAR_UUID = '02f00000-0000-0000-0000-00000000ffe1';

/** Notify characteristic on the FFE0 channel. */
export const VENDOR_FFE2_NOTIFY_CHAR_UUID = '02f00000-0000-0000-0000-00000000ffe2';

/** Vendor channel on service `f48a23c0`. */
export const VENDOR_F48A_SERVICE_UUID = 'f48a23c0-f69a-11e8-8eb2-f2801f1b9fd1';

/** Write characteristic on the F48A channel. */
export const VENDOR_F48A_WRITE_CHAR_UUID = 'f48a24c1-f69a-11e8-8eb2-f2801f1b9fd1';

/** Notify characteristic on the F48A channel. */
export const VENDOR_F48A_NOTIFY_CHAR_UUID = 'f48a25c2-f69a-11e8-8eb2-f2801f1b9fd1';

/** Vendor channel on service `0000fff0`. */
export const VENDOR_FFF0_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';

/** Write characteristic on the FFF0 channel. */
export const VENDOR_FFF2_WRITE_CHAR_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';

/** Notify characteristic on the FFF0 channel. */
export const VENDOR_FFF1_NOTIFY_CHAR_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

/** Vendor channel on service `77d4e67c`. */
export const VENDOR_77D4_SERVICE_UUID = '77d4e67c-2fe2-2334-0d35-9ccd078f529c';

/** Write characteristic on the 77D4 channel. */
export const VENDOR_77D4_WRITE_CHAR_UUID = '77d4ff01-2fe2-2334-0d35-9ccd078f529c';

/** Notify characteristic on the 77D4 channel. */
export const VENDOR_77D4_NOTIFY_CHAR_UUID = '77d4ff02-2fe2-2334-0d35-9ccd078f529c';

/** Short alias for {@link BATTERY_LEVEL_CHAR_UUID} used by tests. */
export const BATTERY_LEVEL_UUID = BATTERY_LEVEL_CHAR_UUID;
