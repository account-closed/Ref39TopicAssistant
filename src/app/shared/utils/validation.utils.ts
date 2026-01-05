/**
 * Regular expression for valid keywords and tag names.
 * Allows alphanumeric characters (including Unicode letters), 
 * and explicitly allows: _ - .
 * No spaces or other special characters.
 */
const VALID_KEYWORD_REGEX = /^[\p{L}\p{N}_\-\.]+$/u;

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
  // Remove all characters except allowed ones
  sanitized = sanitized.replace(/[^\p{L}\p{N}_\-\.]/gu, '');
  return sanitized;
}
