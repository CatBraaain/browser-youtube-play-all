const noop: typeof console.log = () => {};

const isProd = import.meta.env?.PROD;

export const logger = {
  log: isProd ? noop : console.log,
  info: isProd ? noop : console.log,
  warn: isProd ? noop : console.log,
  error: console.error,
};
