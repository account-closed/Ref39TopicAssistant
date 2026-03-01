/**
 * Configuration for a backend instance with E2E encryption.
 */
export interface InstanceConfig {
  /**
   * Unique identifier for this instance.
   */
  instanceId: string;

  /**
   * Base URL of the backend API.
   * Example: 'https://api.example.com' or 'http://localhost:3000'
   */
  apiUrl: string;

  /**
   * API key for authenticating with the backend.
   * This is used in the Authorization header.
   */
  apiKey: string;

  /**
   * Pre-shared key (PSK) for end-to-end encryption.
   * This key is used to encrypt all data before sending to the backend.
   * The backend never has access to this key - zero knowledge.
   */
  psk: string;
}

/**
 * Encrypted payload wrapper for backend communication.
 */
export interface EncryptedPayload {
  /**
   * The encrypted data as base64 string.
   */
  ciphertext: string;

  /**
   * Initialization vector (IV) as base64 string.
   */
  iv: string;

  /**
   * Authentication tag (for AES-GCM) as base64 string.
   */
  tag: string;

  /**
   * Version of the encryption algorithm used.
   */
  version: number;
}
