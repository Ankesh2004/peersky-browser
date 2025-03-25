import { contextBridge,ipcRenderer } from 'electron';

// Expose a limited set of IPC APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Install a new extension from a .zip file
  installExtension: (zipPath) => ipcRenderer.invoke('install-extension', zipPath),
  
  // Get the list of installed extensions
  getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
  
  // Toggle an extension's enabled/disabled state
  toggleExtension: (id, enabled) => ipcRenderer.invoke('toggle-extension', id, enabled),
  
  // Remove an extension
  removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),
  
  // Update (reload) all enabled extensions
  updateAllExtensions: () => ipcRenderer.invoke('update-all-extensions'),
});