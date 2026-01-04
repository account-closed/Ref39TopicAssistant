import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface FileConnection {
  datastoreHandle?: FileSystemFileHandle;
  lockHandle?: FileSystemFileHandle;
  refreshHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
  connected: boolean;
}

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

  async connectToFolder(): Promise<void> {
    try {
      // Request directory picker
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      // Get file handles for the three data files
      const datastoreHandle = await directoryHandle.getFileHandle('datastore.json', { create: true });
      const lockHandle = await directoryHandle.getFileHandle('lock.json', { create: true });
      const refreshHandle = await directoryHandle.getFileHandle('refresh.json', { create: true });

      const connection: FileConnection = {
        datastoreHandle,
        lockHandle,
        refreshHandle,
        directoryHandle,
        connected: true
      };

      this.connectionSubject.next(connection);
      await this.saveToIndexedDB(connection);
    } catch (error) {
      console.error('Failed to connect to folder:', error);
      throw error;
    }
  }

  async readFile(handle: FileSystemFileHandle): Promise<string> {
    try {
      const file = await handle.getFile();
      return await file.text();
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  }

  async writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
    try {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      console.error('Failed to write file:', error);
      throw error;
    }
  }

  async readDatastore(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.datastoreHandle) {
      throw new Error('Datastore not connected');
    }
    return this.readFile(connection.datastoreHandle);
  }

  async writeDatastore(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.datastoreHandle) {
      throw new Error('Datastore not connected');
    }
    return this.writeFile(connection.datastoreHandle, content);
  }

  async readLock(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.lockHandle) {
      throw new Error('Lock file not connected');
    }
    return this.readFile(connection.lockHandle);
  }

  async writeLock(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.lockHandle) {
      throw new Error('Lock file not connected');
    }
    return this.writeFile(connection.lockHandle, content);
  }

  async readRefresh(): Promise<string> {
    const connection = this.connectionSubject.value;
    if (!connection.refreshHandle) {
      throw new Error('Refresh file not connected');
    }
    return this.readFile(connection.refreshHandle);
  }

  async writeRefresh(content: string): Promise<void> {
    const connection = this.connectionSubject.value;
    if (!connection.refreshHandle) {
      throw new Error('Refresh file not connected');
    }
    return this.writeFile(connection.refreshHandle, content);
  }

  isConnected(): boolean {
    return this.connectionSubject.value.connected;
  }

  getConnection(): FileConnection {
    return this.connectionSubject.value;
  }

  private async loadFromIndexedDB(): Promise<void> {
    // IndexedDB persistence is limited for file handles
    // For now, we'll require users to reconnect on each session
    // This could be enhanced with IndexedDB in the future
  }

  private async saveToIndexedDB(connection: FileConnection): Promise<void> {
    // IndexedDB persistence is limited for file handles
    // For now, we'll require users to reconnect on each session
    // This could be enhanced with IndexedDB in the future
  }
}
