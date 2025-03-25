console.log('Settings.js file is being loaded');
// import { ipcRenderer } from "electron";
const { ipcRenderer } = require("electron");

document.addEventListener('DOMContentLoaded', () => {
    console.log('⭐⭐⭐ DOMContentLoaded fired ⭐⭐⭐');
  });
  

// DOM elements
let extensionFile, installButton, updateAllButton, extensionList, uploadStatus;

function initElements() {
  extensionFile = document.getElementById('extension-file');
  installButton = document.getElementById('install-button');
  updateAllButton = document.getElementById('update-all-button');
  extensionList = document.getElementById('extension-list');
  uploadStatus = document.getElementById('upload-status');

  console.log("AAAAAAAAAAAAAA");
  
  if (!extensionFile || !installButton || !updateAllButton || !extensionList || !uploadStatus) {
    console.error('Failed to find required DOM elements:', {
      extensionFile, installButton, updateAllButton, extensionList, uploadStatus
    });
    if (extensionList) {
      extensionList.innerHTML = '<li class="error">Error: Failed to initialize UI elements</li>';
    }
    return false;
  }
  return true;
}

async function loadExtensions() {
  if (!extensionList) {
    console.error('Cannot load extensions - extensionList element not found');
    return;
  }
  
  try {
    console.log('Fetching installed extensions...');
    const extensions = await ipcRenderer.invoke('get-installed-extensions');
    console.log('Received extensions data:', extensions);
    
    extensionList.innerHTML = extensions.length === 0
      ? '<li>No extensions installed</li>'
      : extensions.map(ext => `
          <li class="extension-item" data-id="${ext.id}">
            <div>
              <strong>${ext.name}</strong> (${ext.version})
              <p>${ext.description || 'No description available'}</p>
            </div>
            <div>
              <button class="toggle-button" data-id="${ext.id}" data-enabled="${ext.enabled}">
                ${ext.enabled ? 'Disable' : 'Enable'}
              </button>
              ${ext.builtIn ? '' : `<button class="remove-button" data-id="${ext.id}">Remove</button>`}
            </div>
          </li>
        `).join('');
    
    document.querySelectorAll('.toggle-button').forEach(button => {
      button.addEventListener('click', toggleExtension);
    });
    
    document.querySelectorAll('.remove-button').forEach(button => {
      button.addEventListener('click', removeExtension);
    });
  } catch (error) {
    console.error('Error loading extensions:', error);
    extensionList.innerHTML = `<li class="error">Error loading extensions: ${error.message}</li>`;
  }
}

async function installExtension() {
  if (!extensionFile.files.length) {
    uploadStatus.textContent = 'Please select a zip file first';
    return;
  }
  
  uploadStatus.textContent = 'Installing extension...';
  const filePath = extensionFile.files[0].path;
  
  try {
    const result = await ipcRenderer.invoke('install-extension', filePath);
    uploadStatus.textContent = result.success
      ? `Extension "${result.name}" installed successfully!`
      : `Error: ${result.error}`;
    if (result.success) {
      extensionFile.value = '';
      await loadExtensions();
    }
  } catch (error) {
    uploadStatus.textContent = `Error: ${error.message}`;
  }
}

async function toggleExtension(e) {
  const button = e.currentTarget;
  const id = button.dataset.id;
  const enabled = button.dataset.enabled === 'true';
  
  try {
    const result = await ipcRenderer.invoke('toggle-extension', id, !enabled);
    if (result.success) {
      await loadExtensions();
    } else {
      alert(`Failed to toggle extension: ${result.error}`);
    }
  } catch (error) {
    alert(`Failed to toggle extension: ${error.message}`);
  }
}

async function removeExtension(e) {
  const id = e.currentTarget.dataset.id;
  
  if (!confirm('Are you sure you want to remove this extension?')) return;
  
  try {
    const result = await ipcRenderer.invoke('remove-extension', id);
    if (result.success) {
      await loadExtensions();
    } else {
      alert(`Failed to remove extension: ${result.error}`);
    }
  } catch (error) {
    alert(`Failed to remove extension: ${error.message}`);
  }
}

async function updateAllExtensions() {
  updateAllButton.textContent = 'Updating...';
  updateAllButton.disabled = true;
  
  try {
    const result = await ipcRenderer.invoke('update-all-extensions');
    uploadStatus.textContent = result.success
      ? result.message
      : `Error: ${result.error}`;
  } catch (error) {
    uploadStatus.textContent = `Error: ${error.message}`;
  } finally {
    updateAllButton.textContent = 'Update All Extensions';
    updateAllButton.disabled = false;
    await loadExtensions();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing elements');
  if (initElements()) {
    console.log('Elements initialized, loading extensions');
    loadExtensions();
    installButton.addEventListener('click', installExtension);
    updateAllButton.addEventListener('click', updateAllExtensions);
  }
});