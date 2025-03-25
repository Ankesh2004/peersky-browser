import { app, session, ipcMain, protocol as globalProtocol } from "electron";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { createHandler as createIPFSHandler } from "./protocols/ipfs-handler.js";
import { createHandler as createBrowserHandler } from "./protocols/browser-protocol.js";
import { createHandler as createHyperHandler } from "./protocols/hyper-handler.js";
import { createHandler as createWeb3Handler } from "./protocols/web3-handler.js";
import { ipfsOptions, hyperOptions } from "./protocols/config.js";
import { registerShortcuts } from "./actions.js";
import { setupAutoUpdater } from "./auto-updater.js";
import WindowManager from "./window-manager.js";
import { attachContextMenus, setWindowManager } from "./context-menu.js";
import AdmZip from "adm-zip";
import crypto from "crypto";

const __dirname = fileURLToPath(new URL("./", import.meta.url));

const P2P_PROTOCOL = {
  standard: true,
  secure: true,
  allowServiceWorkers: true,
  supportFetchAPI: true,
  bypassCSP: false,
  corsEnabled: true,
  stream: true,
};

const BROWSER_PROTOCOL = {
  standard: false,
  secure: true,
  allowServiceWorkers: false,
  supportFetchAPI: true,
  bypassCSP: false,
  corsEnabled: true,
};

let windowManager;

globalProtocol.registerSchemesAsPrivileged([
  { scheme: "ipfs", privileges: P2P_PROTOCOL },
  { scheme: "ipns", privileges: P2P_PROTOCOL },
  { scheme: "pubsub", privileges: P2P_PROTOCOL },
  { scheme: "hyper", privileges: P2P_PROTOCOL },
  { scheme: "web3", privileges: P2P_PROTOCOL },
  { scheme: "peersky", privileges: BROWSER_PROTOCOL },
]);

// User extensions storage location
const userExtensionsDir = path.join(app.getPath('userData'), 'user-extensions');
// Store for extension metadata
const extensionsStore = path.join(app.getPath('userData'), 'extensions-meta.json');

// Ensure directories exist at startup
function ensureDirectories() {
  try {
    fs.ensureDirSync(userExtensionsDir);
    console.log(`Ensured user extensions directory exists: ${userExtensionsDir}`);
    fs.ensureDirSync(path.dirname(extensionsStore));
    console.log(`Ensured extensions metadata directory exists: ${path.dirname(extensionsStore)}`);
  } catch (error) {
    console.error('Error ensuring directories:', error);
  }
}

// Ensure extension metadata file is properly initialized
// Ensure extension metadata file is properly initialized
function initExtensionStore() {
  try {
    if (!fs.existsSync(extensionsStore)) {
      console.log('Creating extensions metadata file');
      // Initialize with built-in extensions
      const builtInDir = path.join(__dirname, '..', 'extensions');
      let initialMetadata = { extensions: [] };
      
      if (fs.existsSync(builtInDir)) {
        const items = fs.readdirSync(builtInDir, { withFileTypes: true });
        initialMetadata.extensions = items
          .filter(item => item.isDirectory())
          .map(item => {
            const extPath = path.join(builtInDir, item.name);
            let manifest = { name: item.name, version: '1.0.0' };
            try {
              const manifestPath = path.join(extPath, 'manifest.json');
              if (fs.existsSync(manifestPath)) {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              }
            } catch (e) {
              console.error(`Error reading manifest for ${item.name}:`, e);
            }
            return {
              id: item.name, // Use directory name as ID for built-ins
              name: manifest.name || item.name,
              version: manifest.version || '1.0.0',
              description: manifest.description || '',
              path: extPath,
              enabled: true,
              builtIn: true,
            };
          });
      }
      
      saveExtensionsMetadata(initialMetadata);
      console.log(`Initialized extensions metadata with ${initialMetadata.extensions.length} built-in extensions`);
    } else {
      // Validate the file content
      try {
        const content = fs.readFileSync(extensionsStore, 'utf8');
        JSON.parse(content);
        console.log('Extensions metadata file exists and is valid JSON');
      } catch (e) {
        console.error('Extensions metadata file exists but is invalid, resetting it');
        saveExtensionsMetadata({ extensions: [] });
      }
    }
  } catch (error) {
    console.error('Error initializing extensions store:', error);
    saveExtensionsMetadata({ extensions: [] }); // Fallback to empty file
  }
}

// Get stored extension metadata or initialize empty
function getExtensionsMetadata() {
  try {
    if (fs.existsSync(extensionsStore)) {
      return JSON.parse(fs.readFileSync(extensionsStore, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading extensions metadata:', error);
  }
  return { extensions: [] };
}

// Save extension metadata with better error handling
function saveExtensionsMetadata(metadata) {
  try {
    if (!metadata || typeof metadata !== 'object') {
      console.error('Invalid metadata format, resetting to default');
      metadata = { extensions: [] };
    }
    
    if (!Array.isArray(metadata.extensions)) {
      console.error('Invalid extensions format, resetting to empty array');
      metadata.extensions = [];
    }
    
    const jsonStr = JSON.stringify(metadata, null, 2);
    const storeDir = path.dirname(extensionsStore);
    fs.ensureDirSync(storeDir); // Ensure directory before writing
    fs.writeFileSync(extensionsStore, jsonStr, 'utf8');
    console.log(`Saved extensions metadata: ${metadata.extensions.length} extensions`);
    return true;
  } catch (error) {
    console.error('Error saving extensions metadata:', error);
    return false;
  }
}

// Validate extension manifest
function validateExtension(extPath) {
  const manifestPath = path.join(extPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Invalid extension: manifest.json not found');
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.name) throw new Error('Extension name is required');
    if (!manifest.version) throw new Error('Extension version is required');
    if (manifest.manifest_version && ![2, 3].includes(manifest.manifest_version)) {
      throw new Error('Only manifest_version 2 or 3 is supported');
    }
    return manifest;
  } catch (error) {
    throw new Error(`Invalid manifest.json: ${error.message}`);
  }
}

app.whenReady().then(async () => {
  ensureDirectories(); // Add this to ensure directories exist early
  windowManager = new WindowManager();
  setWindowManager(windowManager);

  await setupProtocols(session.defaultSession);
  initExtensionStore();
  await windowManager.openSavedWindows();
  if (windowManager.all.length === 0) {
    windowManager.open({ isMainWindow: true });
  }

  registerShortcuts(windowManager);
  windowManager.startSaver();
  await loadExtensions(session.defaultSession);

  // Initialize AutoUpdater after windowManager is ready
  // console.log("App is prepared, setting up AutoUpdater...");
  // setupAutoUpdater();
});

let isQuitting = false;

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();

  console.log("Before quit: Saving window states...");
  isQuitting = true;
  windowManager.setQuitting(true);

  windowManager
    .saveOpened()
    .then(() => {
      console.log("Window states saved successfully.");
      windowManager.stopSaver();
      app.quit();
    })
    .catch((error) => {
      console.error("Error saving window states on quit:", error);
      windowManager.stopSaver();
      app.quit();
    });
});

async function setupProtocols(session) {
  const { protocol: sessionProtocol } = session;

  app.setAsDefaultProtocolClient("ipfs");
  app.setAsDefaultProtocolClient("ipns");
  app.setAsDefaultProtocolClient("hyper");
  app.setAsDefaultProtocolClient("web3");
  app.setAsDefaultProtocolClient("peersky");

  const ipfsProtocolHandler = await createIPFSHandler(ipfsOptions, session);
  sessionProtocol.registerStreamProtocol("ipfs", ipfsProtocolHandler, P2P_PROTOCOL);
  sessionProtocol.registerStreamProtocol("ipns", ipfsProtocolHandler, P2P_PROTOCOL);
  sessionProtocol.registerStreamProtocol("pubsub", ipfsProtocolHandler, P2P_PROTOCOL);

  const hyperProtocolHandler = await createHyperHandler(hyperOptions, session);
  sessionProtocol.registerStreamProtocol("hyper", hyperProtocolHandler, P2P_PROTOCOL);

  const web3ProtocolHandler = await createWeb3Handler();
  sessionProtocol.registerStreamProtocol("web3", web3ProtocolHandler, P2P_PROTOCOL);

  const browserProtocolHandler = await createBrowserHandler();
  sessionProtocol.registerStreamProtocol("peersky", browserProtocolHandler, BROWSER_PROTOCOL);
}

// Load extension
// async function loadExtensions(session) {
//   try {
//     const extensionsDir = path.join(__dirname, '..', 'extensions');
//     const exists = await fs.pathExists(extensionsDir);
//     
//     if (!exists) {
//       console.log('Extensions directory does not exist. Skipping extension loading.');
//       return;
//     }
//     
//     // Read all subdirectories in the extensions directory
//     const items = await fs.readdir(extensionsDir, { withFileTypes: true });
//     const extensionFolders = items
//       .filter(item => item.isDirectory())
//       .map(item => path.join(extensionsDir, item.name));
//     
//     console.log(`Found ${extensionFolders.length} extensions to load.`);
//     
//     // Load each extension
//     for (const extPath of extensionFolders) {
//       try {
//         const extension = await session.loadExtension(extPath, { allowFileAccess: true });
//         console.log(`Loaded extension successfully: ${path.basename(extPath)} (ID: ${extension.id})`);
//       } catch (err) {
//         console.error(`Failed to load extension from ${path.basename(extPath)}:`, err);
//       }
//     }
//   } catch (error) {
//     console.error('Error loading extensions:', error);
//   }
// }

// version 2
// async function loadExtensions(session) {
//   try {
//     const extensionsDir = path.join(__dirname, '..', 'extensions');
//     const exists = await fs.pathExists(extensionsDir);
//     
//     if (!exists) {
//       console.log('Extensions directory does not exist. Skipping extension loading.');
//       return;
//     }
//     
//     const items = await fs.readdir(extensionsDir, { withFileTypes: true });
//     const extensionFolders = items
//       .filter(item => item.isDirectory())
//       .map(item => path.join(extensionsDir, item.name));
//     
//     console.log(`Found ${extensionFolders.length} extensions to load.`);
//     
//     const loadPromises = extensionFolders.map(extPath =>
//       session.loadExtension(extPath, { allowFileAccess: true })
//         .then(extension => {
//           console.log(`Loaded extension successfully: ${path.basename(extPath)} (ID: ${extension.id})`);
//           return extension;
//         })
//         .catch(err => {
//           console.error(`Failed to load extension from ${path.basename(extPath)}:`, err);
//           return null;
//         })
//     );
//     
//     await Promise.all(loadPromises);
//   } catch (error) {
//     console.error('Error loading extensions:', error);
//   }
// }

// version 3
async function loadExtensions(session) {
  try {
    // Load built-in extensions
    const extensionsDir = path.join(__dirname, '..', 'extensions');
    if (await fs.pathExists(extensionsDir)) {
      const items = await fs.readdir(extensionsDir, { withFileTypes: true });
      const extensionFolders = items
        .filter(item => item.isDirectory())
        .map(item => path.join(extensionsDir, item.name));
      
      console.log(`Found ${extensionFolders.length} built-in extensions to load.`);
      
      const loadPromises = extensionFolders.map(extPath =>
        session.loadExtension(extPath, { allowFileAccess: true })
          .then(extension => {
            console.log(`Loaded built-in extension: ${path.basename(extPath)} (ID: ${extension.id})`);
            return extension;
          })
          .catch(err => {
            console.error(`Failed to load built-in extension from ${path.basename(extPath)}:`, err);
            return null;
          })
      );
      await Promise.all(loadPromises);
    }
    
    // Load user-installed extensions from metadata
    const metadata = getExtensionsMetadata();
    const userLoadPromises = metadata.extensions
      .filter(ext => ext.enabled && fs.existsSync(ext.path))
      .map(ext =>
        session.loadExtension(ext.path, { allowFileAccess: true })
          .then(extension => {
            console.log(`Loaded user extension: ${ext.name} (ID: ${extension.id})`);
            return extension;
          })
          .catch(err => {
            console.error(`Failed to load user extension ${ext.name}:`, err);
            return null;
          })
      );
    await Promise.all(userLoadPromises);
  } catch (error) {
    console.error('Error loading extensions:', error);
  }
}

// IPC handlers for extension management
ipcMain.handle('install-extension', async (event, zipPath) => {
  try {
    const extId = crypto.randomBytes(16).toString('hex');
    const extDir = path.join(userExtensionsDir, extId);
    fs.ensureDirSync(userExtensionsDir);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extDir, true);

    const manifest = validateExtension(extDir);
    const extension = await session.defaultSession.loadExtension(extDir, { allowFileAccess: true });

    const metadata = getExtensionsMetadata();
    metadata.extensions.push({
      id: extension.id, // Use Electron's ID
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      path: extDir,
      enabled: true,
      userInstalled: true,
    });
    saveExtensionsMetadata(metadata);

    return { success: true, name: manifest.name, id: extension.id };
  } catch (error) {
    console.error('Error installing extension:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-installed-extensions', () => {
  try {
    const metadata = getExtensionsMetadata();
    console.log('Returning extensions metadata:', metadata.extensions);
    return metadata.extensions || [];
  } catch (error) {
    console.error('Error getting extensions metadata:', error);
    return [];
  }
});

ipcMain.handle('toggle-extension', async (event, id, enabled) => {
  try {
    const metadata = getExtensionsMetadata();
    const extension = metadata.extensions.find(ext => ext.id === id);
    if (!extension) throw new Error('Extension not found');

    extension.enabled = enabled;
    saveExtensionsMetadata(metadata);

    if (enabled) {
      await session.defaultSession.loadExtension(extension.path, { allowFileAccess: true });
    } else {
      session.defaultSession.removeExtension(id);
    }
    return { success: true };
  } catch (error) {
    console.error('Error toggling extension:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-extension', async (event, id) => {
  try {
    const metadata = getExtensionsMetadata();
    const extIndex = metadata.extensions.findIndex(ext => ext.id === id);
    if (extIndex === -1) throw new Error('Extension not found');

    const extension = metadata.extensions[extIndex];
    session.defaultSession.removeExtension(id);
    metadata.extensions.splice(extIndex, 1);
    saveExtensionsMetadata(metadata);

    if (extension.userInstalled && fs.existsSync(extension.path)) {
      fs.removeSync(extension.path);
    }
    return { success: true };
  } catch (error) {
    console.error('Error removing extension:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-all-extensions', async () => {
  try {
    const metadata = getExtensionsMetadata();
    session.defaultSession.getAllExtensions().forEach(ext => {
      session.defaultSession.removeExtension(ext.id);
    });

    const loadPromises = metadata.extensions
      .filter(ext => ext.enabled && fs.existsSync(ext.path))
      .map(ext =>
        session.defaultSession.loadExtension(ext.path, { allowFileAccess: true })
          .catch(err => console.error(`Error reloading ${ext.name}:`, err))
      );
    await Promise.all(loadPromises);

    return { success: true, message: `Updated ${loadPromises.length} extension(s)` };
  } catch (error) {
    console.error('Error updating extensions:', error);
    return { success: false, error: error.message };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (windowManager.all.length === 0) {
    windowManager.open({ isMainWindow: true });
  }
});

export { windowManager };