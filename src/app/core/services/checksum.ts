/**
 * Checksum module for detecting datastore changes.
 * 
 * Uses a deterministic canonical JSON representation and SHA-256 hashing
 * to detect content changes in the datastore.
 * 
 * Excluded fields:
 * - `generatedAt`: Changes on every save but doesn't affect content semantics
 * - `revisionId`: Monotonic counter for versioning, not content identity
 */

import { Datastore } from '../models';

/**
 * Fields excluded from checksum calculation.
 * These fields change without affecting the semantic content of the datastore.
 */
const EXCLUDED_FIELDS = new Set(['generatedAt', 'revisionId']);

/**
 * Creates a canonical JSON string from an object with deterministic key ordering.
 * - Object keys are sorted alphabetically (recursive)
 * - Arrays maintain their natural order (not sorted)
 * - Excluded fields are omitted from the output
 * 
 * @param value - Any JSON-serializable value
 * @param excludeFields - Set of field names to exclude from serialization
 * @returns Canonical JSON string
 */
export function canonicalStringify(value: unknown, excludeFields: Set<string> = EXCLUDED_FIELDS): string {
  return JSON.stringify(value, (key, val) => {
    // Exclude specified fields
    if (key && excludeFields.has(key)) {
      return undefined;
    }
    
    // For objects (but not arrays or null), sort keys
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sortedObj: Record<string, unknown> = {};
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        // Skip excluded fields during key iteration
        if (!excludeFields.has(k)) {
          sortedObj[k] = val[k];
        }
      }
      return sortedObj;
    }
    
    return val;
  });
}

/**
 * Computes a SHA-256 checksum of the datastore content.
 * Uses WebCrypto for cross-platform compatibility.
 * 
 * @param ds - The datastore to compute checksum for
 * @returns Promise resolving to a hex-encoded SHA-256 hash
 */
export async function computeDatastoreChecksum(ds: Datastore): Promise<string> {
  const canonicalString = canonicalStringify(ds);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
