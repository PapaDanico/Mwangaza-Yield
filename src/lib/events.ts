export const APP_EVENTS = {
  OPEN_PALETTE: 'mwangaza:palette',
  SW_ACTIVATED: 'SW_ACTIVATED',
  SW_UPDATE: 'sw:update',
  DATA_REFRESH: 'data:refresh',
  SKIP_WAITING: 'SKIP_WAITING',
} as const;

export type AppEvent = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];
