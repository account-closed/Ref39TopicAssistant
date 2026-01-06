/**
 * Regular expression for valid keywords and tag names.
 * Allows alphanumeric characters (including Unicode letters), 
 * and explicitly allows: _ - .
 * No spaces or other special characters.
 * Note: Hyphen is placed at the end of the character class to avoid escaping issues.
 */
const VALID_KEYWORD_REGEX = /^[\p{L}\p{N}_.-]+$/u;

/**
 * Regular expression for valid hex color codes.
 * Matches 3, 4, 6, or 8 digit hex colors with or without # prefix.
 */
const VALID_HEX_COLOR_REGEX = /^#?([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;

/**
 * Validates a keyword or tag name.
 * - No spaces allowed
 * - No special characters except: _ - .
 * - Must have at least one character
 * 
 * @param value The value to validate
 * @returns true if the value is valid
 */
export function isValidKeyword(value: string): boolean {
  if (!value || value.length === 0) {
    return false;
  }
  return VALID_KEYWORD_REGEX.test(value);
}

/**
 * Sanitizes a keyword by removing invalid characters.
 * - Replaces spaces with underscores
 * - Removes all characters except letters, numbers, _, -, .
 * 
 * @param value The value to sanitize
 * @returns The sanitized value
 */
export function sanitizeKeyword(value: string): string {
  if (!value) {
    return '';
  }
  // Replace spaces with underscores
  let sanitized = value.replace(/\s+/g, '_');
  // Remove all characters except allowed ones (hyphen at end of character class)
  sanitized = sanitized.replace(/[^\p{L}\p{N}_.-]/gu, '');
  return sanitized;
}

/**
 * Validates a hex color code.
 * Accepts colors with or without # prefix.
 * 
 * @param value The color value to validate
 * @returns true if the value is a valid hex color
 */
export function isValidHexColor(value: string | undefined): boolean {
  if (!value) {
    return true; // undefined/empty is valid (color is optional)
  }
  return VALID_HEX_COLOR_REGEX.test(value);
}

/**
 * Normalizes a hex color to include # prefix if missing.
 * 
 * @param value The color value to normalize
 * @returns The normalized color with # prefix, or undefined if invalid/empty
 */
export function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (!isValidHexColor(value)) {
    return undefined;
  }
  return value.startsWith('#') ? value : `#${value}`;
}
