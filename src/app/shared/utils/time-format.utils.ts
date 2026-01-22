/**
 * Shared time formatting utilities.
 */

/**
 * Formats a decimal hour value as hours and minutes.
 * Example: 1.75 -> "1h 45min", 0.5 -> "30min", 2 -> "2h"
 *
 * @param value The decimal hour value to format
 * @returns A string in the format "Xh Ymin", "Xh", "Ymin", or "0min"
 */
export function formatHoursMinutes(value: number): string {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);

  if (hours === 0 && minutes === 0) {
    return '0min';
  } else if (hours === 0) {
    return `${minutes}min`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}min`;
  }
}
