import { Ref } from 'vue';

export interface DiceAnimationOptions {
  /** How many intermediate frames to show */
  frames?: number;
  /** Milliseconds between frames */
  interval?: number;
}

/**
 * Animate a dice roll: cycle random intermediate values before landing on the final result.
 *
 * @param target - reactive ref to update with intermediate and final values
 * @param rolling - reactive ref<boolean> set true during animation
 * @param randomFn - function that generates a random intermediate value
 * @param finalValue - the actual result to land on
 * @param options - animation tuning
 */
export function animateRoll<T>(
  target: Ref<T>,
  rolling: Ref<boolean>,
  randomFn: () => T,
  finalValue: T,
  options?: DiceAnimationOptions
): Promise<void> {
  const frames = options?.frames ?? 8;
  const ms = options?.interval ?? 70;

  rolling.value = true;
  let tick = 0;

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      target.value = randomFn();
      tick++;
      if (tick >= frames) {
        clearInterval(interval);
        target.value = finalValue;
        rolling.value = false;
        resolve();
      }
    }, ms);
  });
}
