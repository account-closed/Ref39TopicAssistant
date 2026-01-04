import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface FileConnection {
  datastoreHandle?: FileSystemFileHandle;
  lockHandle?: FileSystemFileHandle;
  refreshHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
  connected: boolean;
}

export class FileConnectionError extends Error {
  constructor(
    message: string,
    public readonly germanMessage: string,
    public readonly code: 'NOT_CONNECTED' | 'READ_ERROR' | 'WRITE_ERROR' | 'PERMISSION_DENIED' | 'FILE_NOT_FOUND'
  ) {
    super(message);
    this.name = 'FileConnectionError';
  }
}

const INDEXEDDB_NAME = 'RaciTopicFinderDB';
const INDEXEDDB_STORE = 'fileHandles';
const INDEXEDDB_VERSION = 1;

@Injectable({
  providedIn: 'root'
})
export class FileConnectionService {
  private connectionSubject = new BehaviorSubject<FileConnection>({
    connected: false
  });

  public connection$: Observable<FileConnection> = this.connectionSubject.asObservable();

  constructor() {
    this.loadFromIndexedDB();
  }

  /**
   * Connect to a folder via File System Access API.
   * Creates data files if they don't exist.
   */
  async connectToFolder(): Promise<void> {
    try {
      // Check if File System Access API is available
      if (!('showDirectoryPicker' in window)) {
        throw new FileConnectionError(
          'File System Access API not supported',
          'Ihr Browser unterstützt die File System Access API nicht. Bitte verwenden Sie Chrome, Edge oder einen anderen Chromium-basierten Browser.',
          'PERMISSION_DENIED'
        );
      }

      // Request directory picker
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      // Get file handles for the three data files in parallel (create if missing)
      const [datastoreHandle, lockHandle, refreshHandle] = await Promise.all([
        directoryHandle.getFileHandle('datastore.json', { create: true }),
        directoryHandle.getFileHandle('lock.json', { create: true }),
        directoryHandle.getFileHandle('refresh.json', { create: true })
      ]);

      const connection: FileConnection = {
        datastoreHandle,
        lockHandle,
        refreshHandle,
        directoryHandle,
        connected: true
      };

      this.connectionSubject.next(connection);
      // Save to IndexedDB in background - don't block connection
      this.saveToIndexedDB(directoryHandle).catch(err => 
        console.warn('Failed to save directory handle to IndexedDB:', err)
      );
    } catch (error: any) {
      if (error instanceof FileConnectionError) {
        throw error;
      }
      if (error.name === 'AbortError') {
        throw new FileConnectionError(
          'User cancelled folder selection',
          'Ordnerauswahl wurde abgebrochen.',
          'PERMISSION_DENIED'
        );
      }
      console.error('Failed to connect to folder:', error);
      throw new FileConnectionError(
        'Failed to connect to folder: ' + error.message,
        'Verbindung zum Ordner fehlgeschlagen: ' + error.message,
        'PERMISSION_DENIED'
      );
    }
  }

  /**
   * Reconnect using a stored directory handle from IndexedDB.
   * Requires user gesture to request permission.
   */
  async reconnectFromStored(): Promise<boolean> {
    try {
      const directoryHandle = await this.getStoredDirectoryHandle();
      if (!directoryHandle) {
        return false;
      }

      // Request permission (requires user gesture)
      // Use 'any' cast because requestPermission is part of File System Access API
      // but not fully typed in standard TypeScript definitions
      const permission = await (directoryHandle as any).requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        return false;
      }

      // Get file handles in parallel
      const [datastoreHandle, lockHandle, refreshHandle] = await Promise.all([
        directoryHandle.getFileHandle('datastore.json', { create: true }),
        directoryHandle.getFileHandle('lock.json', { create: true }),
        directoryHandle.getFileHandle('refresh.json', { create: true })
      ]);

      const connection: FileConnection = {
        datastoreHandle,
        lockHandle,
        refreshHandle,
        directoryHandle,
        connected: true
      };

      this.connectionSubject.next(connection);
      return true;
    } catch (error) {
      console.error('Failed to reconnect from stored handle:', error);
      return false;
    }
  }

  /**
   * Check if there is a stored directory handle in IndexedDB.
   */
  async hasStoredConnection(): Promise<boolean> {
    const handle = await this.getStoredDirectoryHandle();
    return handle !== null;
  }

  /**
   * Read file content with consistent error handling.
   */
  async readFile(handle: FileSystemFileHandle): Promise<string> {
    try {
      const file = await handle.getFile();
      return await file.text();
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new FileConnectionError(
          'Permission denied reading file',
          'Keine Berechtigung zum Lesen der Datei. Bitte verbinden Sie das Verzeichnis erneut.',
          'PERMISSION_DENIED'
        );
      }
      if (error.name === 'NotFoundError') {
        throw new FileConnectionError(
          'File not found',
          'Datei nicht gefunden.',
          'FILE_NOT_FOUND'
        );
      }
      throw new FileConnectionError(
        'Failed to read file: ' + error.message,
        'Fehler beim Lesen der Datei: ' + error.message,
        'READ_ERROR'
      );
    }
  }

  /**
   * Write file content with consistent error handling.
   * Uses createWritable, write full JSON, close pattern.
   */
  async writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
    try {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new FileConnectionError(
          'Permission denied writing file',
          'Keine Berechtigung zum Schreiben der Datei. Bitte verbinden Sie das Verzeichnis erneut.',
          'PERMISSION_DENIED'
        );
      }
      throw new FileConnectionError(
        'Failed to write file: ' + error.message,
        'Fehler beim Schreiben der Datei: ' + error.message,
        'WRITE_ERROR'
      );
    }
  }

  async readDatastore(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.datastoreHandle) {
      throw new FileConnectionError(
        'Datastore not connected',
        'Keine Verbindung zum Datenspeicher. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.readFile(connection.datastoreHandle);
  }

  async writeDatastore(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.datastoreHandle) {
      throw new FileConnectionError(
        'Datastore not connected',
        'Keine Verbindung zum Datenspeicher. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.writeFile(connection.datastoreHandle, content);
  }

  async readLock(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.lockHandle) {
      throw new FileConnectionError(
        'Lock file not connected',
        'Keine Verbindung zur Sperrdatei. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.readFile(connection.lockHandle);
  }

  async writeLock(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.lockHandle) {
      throw new FileConnectionError(
        'Lock file not connected',
        'Keine Verbindung zur Sperrdatei. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.writeFile(connection.lockHandle, content);
  }

  async readRefresh(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.refreshHandle) {
      throw new FileConnectionError(
        'Refresh file not connected',
        'Keine Verbindung zur Aktualisierungsdatei. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.readFile(connection.refreshHandle);
  }

  async writeRefresh(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.refreshHandle) {
      throw new FileConnectionError(
        'Refresh file not connected',
        'Keine Verbindung zur Aktualisierungsdatei. Bitte wählen Sie ein Datenverzeichnis aus.',
        'NOT_CONNECTED'
      );
    }
    return this.writeFile(connection.refreshHandle, content);
  }

  isConnected(): boolean {
    return this.connectionSubject.value.connected;
  }

  getConnection(): FileConnection {
    return this.connectionSubject.value;
  }

  /**
   * Disconnect and clear stored handle.
   */
  async disconnect(): Promise<void> {
    this.connectionSubject.next({ connected: false });
    await this.clearIndexedDB();
  }

  // IndexedDB persistence methods

  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
          db.createObjectStore(INDEXEDDB_STORE);
        }
      };
    });
  }

  private async saveToIndexedDB(directoryHandle: FileSystemDirectoryHandle): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
      const store = tx.objectStore(INDEXEDDB_STORE);
      store.put(directoryHandle, 'directoryHandle');
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (error) {
      console.warn('Failed to save directory handle to IndexedDB:', error);
      // Non-fatal error - app can still work, just won't persist
    }
  }

  private async getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(INDEXEDDB_STORE, 'readonly');
      const store = tx.objectStore(INDEXEDDB_STORE);
      const request = store.get('directoryHandle');
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('Failed to get directory handle from IndexedDB:', error);
      return null;
    }
  }

  private async clearIndexedDB(): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(INDEXEDDB_STORE, 'readwrite');
      const store = tx.objectStore(INDEXEDDB_STORE);
      store.delete('directoryHandle');
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }

  private async loadFromIndexedDB(): Promise<void> {
    // Auto-loading is not possible without user gesture
    // The reconnectFromStored() method must be called with user gesture
    // Check if we have a stored handle to show "reconnect" option in UI
  }
}
