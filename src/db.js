/**
 * Caveman Notes - Database Module
 * Pure IndexedDB logic
 */
export class Vault {
  constructor() {
    this.dbName = 'CavemanVault_2';
    this.db = null;
  }

  async init() {
    if (this.db) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, 2);
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('notes')) {
            db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('images')) {
            db.createObjectStore('images', { keyPath: 'id' });
          }
        };

        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve();
        };

        request.onerror = (e) => {
          console.error("Vault activation error:", e.target.error);
          reject(e.target.error);
        };

        request.onblocked = () => {
          console.warn("Vault upgrade blocked. Please close other instances of this monolith.");
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  async getNotes() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async saveNote(note) {
    return new Promise((resolve, reject) => {
      try {
        // Deep copy to ensure no non-serializable objects (like HTMLImageElement) leak into IndexedDB
        const cleanNote = JSON.parse(JSON.stringify(note));
        const tx = this.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.put(cleanNote);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
      } catch (e) {
        console.error("Critical: Failed to serialize note for storage", e);
        reject(e);
      }
    });
  }

  async deleteNote(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
    });
  }

  async saveImage(id, dataUrl) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      const request = store.put({ id, data: dataUrl });
      request.onsuccess = () => resolve();
    });
  }

  async getImage(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
    });
  }

  async deleteImage(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
    });
  }

  async getAllImages() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes', 'images'], 'readwrite');
      tx.objectStore('notes').clear();
      tx.objectStore('images').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }
}
