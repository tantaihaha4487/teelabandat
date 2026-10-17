let activeStop: (() => void) | undefined;

export function claimPlayback(stop: () => void) {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}

export function releasePlayback(stop: () => void) {
  if (activeStop === stop) activeStop = undefined;
}
