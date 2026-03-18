type PlausibleArgs = [string, { props?: Record<string, string> }?];

declare global {
  interface Window {
    plausible?: (...args: PlausibleArgs) => void;
  }
}

export function trackEvent(name: string, props?: Record<string, string>) {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(name, props ? { props } : undefined);
  }
}
