import { TShirtSize } from '../../core/models';

/**
 * Returns a star representation for a priority value (1-10).
 * @param priority Priority value from 1 to 10
 * @returns String with filled and empty stars
 */
export function getPriorityStars(priority: number | undefined): string {
  if (!priority) return '';
  return '★'.repeat(priority) + '☆'.repeat(10 - priority);
}

/**
 * Returns the severity color for a T-shirt size.
 * Smaller sizes are success/info, larger sizes are warn/danger.
 * @param size T-shirt size
 * @returns PrimeNG severity value
 */
export function getSizeSeverity(
  size: TShirtSize | undefined
): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
  switch (size) {
    case 'XXS':
      return 'success';
    case 'XS':
    case 'S':
      return 'info';
    case 'M':
      return 'secondary';
    case 'L':
      return 'warn';
    case 'XL':
    case 'XXL':
      return 'danger';
    default:
      return 'secondary';
  }
}
