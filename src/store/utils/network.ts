export const isOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;
