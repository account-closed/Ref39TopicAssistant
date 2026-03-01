import { Injectable } from '@angular/core';
import { EncryptedPayload } from '../models/instance-config.model';

/**
 * EncryptionService - End-to-End Encryption with Web Crypto API
 *
 * Uses AES-GCM (256-bit) for authenticated encryption.
 * The PSK never leaves the client - ensures zero knowledge on the backend.
 */
@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private readonly ALGORITHM = 'AES-GCM';
  private readonly KEY_LENGTH = 256;
  private readonly IV_LENGTH = 12; // 96 bits recommended for GCM
  private readonly VERSION = 1;

  /**
   * Derive a CryptoKey from a PSK string.
   */
  private async deriveKey(psk: string): Promise<CryptoKey> {
    // Hash the PSK to get a proper 256-bit key
    const encoder = new TextEncoder();
    const pskData = encoder.encode(psk);
    const hashBuffer = await crypto.subtle.digest('SHA-256', pskData);

    // Import as AES-GCM key
    return crypto.subtle.importKey(
      'raw',
      hashBuffer,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false, // not extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM with the provided PSK.
   *
   * @param data - The data to encrypt (will be JSON stringified)
   * @param psk - Pre-shared key for encryption
   * @returns Encrypted payload with ciphertext, IV, and tag
   */
  async encrypt(data: unknown, psk: string): Promise<EncryptedPayload> {
    const key = await this.deriveKey(psk);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    // Convert data to bytes
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    // Encrypt with AES-GCM (automatically includes authentication tag)
    const ciphertext = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      plaintext
    );

    // AES-GCM output includes the auth tag at the end (last 16 bytes)
    const ciphertextArray = new Uint8Array(ciphertext);
    const dataLength = ciphertextArray.length - 16;
    const ciphertextOnly = ciphertextArray.slice(0, dataLength);
    const tag = ciphertextArray.slice(dataLength);

    return {
      ciphertext: this.arrayBufferToBase64(ciphertextOnly),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag),
      version: this.VERSION
    };
  }

  /**
   * Decrypt data using AES-GCM with the provided PSK.
   *
   * @param payload - Encrypted payload with ciphertext, IV, and tag
   * @param psk - Pre-shared key for decryption
   * @returns Decrypted data (parsed from JSON)
   */
  async decrypt<T = unknown>(payload: EncryptedPayload, psk: string): Promise<T> {
    if (payload.version !== this.VERSION) {
      throw new Error(`Unsupported encryption version: ${payload.version}`);
    }

    const key = await this.deriveKey(psk);

    // Convert from base64
    const iv = this.base64ToArrayBuffer(payload.iv);
    const ciphertextOnly = this.base64ToArrayBuffer(payload.ciphertext);
    const tag = this.base64ToArrayBuffer(payload.tag);

    // Combine ciphertext and tag for AES-GCM
    const ciphertextArray = new Uint8Array(ciphertextOnly);
    const tagArray = new Uint8Array(tag);
    const ciphertext = new Uint8Array(ciphertextArray.length + tagArray.length);
    ciphertext.set(ciphertextArray, 0);
    ciphertext.set(tagArray, ciphertextArray.length);

    // Decrypt
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv },
        key,
        ciphertext
      );
    } catch (error) {
      throw new Error('Decryption failed - invalid PSK or corrupted data');
    }

    // Convert to string and parse JSON
    const decoder = new TextDecoder();
    const plaintextString = decoder.decode(plaintext);
    return JSON.parse(plaintextString) as T;
  }

  /**
   * Convert ArrayBuffer to base64 string.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer.
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
