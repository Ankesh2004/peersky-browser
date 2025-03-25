import { app, BrowserWindow, globalShortcut } from "electron";
import WindowManager from './window-manager.js';

export function createActions(windowManager) {
  const actions = {
    OpenDevTools: {
      label: "Open Dev Tools",
      accelerator: "CommandOrControl+Shift+I",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.openDevTools({ mode: "detach" });
        }
      },
    },
    NewWindow: {
      label: "New Window",
      accelerator: "CommandOrControl+N",
      click: () => {
        windowManager.open();
      },
    },
    Forward: {
      label: "Forward",
      accelerator: "CommandOrControl+]",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`{
            const webview = document.querySelector('webview');
            if (webview && webview.canGoForward()) {
              webview.goForward();
            }
          }`);
        }
      },
    },
    Back: {
      label: "Back",
      accelerator: "CommandOrControl+[",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`{
            const webview = document.querySelector('webview');
            if (webview && webview.canGoBack()) {
              webview.goBack();
            }
          }`);
        }
      },
    },
    FocusURLBar: {
      label: "Focus URL Bar",
      accelerator: "CommandOrControl+L",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            document.getElementById('url').focus();
          `);
        }
      },
    },
    Reload: {
      label: "Reload",
      accelerator: "CommandOrControl+R",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`{
              const webview = document.querySelector('webview');
              if (webview) {
                webview.reload();
              }
            }`);
        }
      },
    },
    Minimize: {
      label: "Minimize",
      accelerator: "CommandOrControl+M",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.minimize();
        }
      },
    },
    Close: {
      label: "Close",
      accelerator: "CommandOrControl+W",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.close();
        }
      },
    },
    FullScreen: {
      label: "Toggle Full Screen",
      accelerator: "F11",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
        }
      },
    },
    FindInPage: {
      label: "Find in Page",
      accelerator: "CommandOrControl+F",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            var findMenu = document.querySelector('find-menu');
            if (findMenu) {
              findMenu.toggle();
              setTimeout(() => {
                var input = findMenu.querySelector('.find-menu-input');
                if (input) {
                  input.focus();
                }
              }, 100); // Timeout to ensure the menu is visible and ready to receive focus
            }
          `);
        }
      },
    },
    NewTab: {
      label: "New Tab",
      accelerator: "CommandOrControl+T",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            document.querySelector('tab-bar').createNewTab();
          `);
        }
      },
    },
    CloseTab: {
      label: "Close Tab",
      accelerator: "CommandOrControl+W",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            const tabBar = document.querySelector('tab-bar');
            const windowId = tabBar.windowId;
            const activeTab = window.tabManager.getActiveTab(windowId);
            if (activeTab) {
              tabBar.closeTab(activeTab.id);
            }
          `);
        }
      },
    },
    NextTab: {
      label: "Next Tab",
      accelerator: "CommandOrControl+Tab",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            const tabBar = document.querySelector('tab-bar');
            const windowId = tabBar.windowId;
            const tabs = window.tabManager.getAllTabs(windowId);
            const activeTab = window.tabManager.getActiveTab(windowId);
            
            if (tabs.length <= 1 || !activeTab) return;
            
            const currentIndex = tabs.findIndex(tab => tab.id === activeTab.id);
            const nextIndex = (currentIndex + 1) % tabs.length;
            tabBar.activateTab(tabs[nextIndex].id);
          `);
        }
      },
    },
    PreviousTab: {
      label: "Previous Tab",
      accelerator: "CommandOrControl+Shift+Tab",
      click: (focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.webContents.executeJavaScript(`
            const tabBar = document.querySelector('tab-bar');
            const windowId = tabBar.windowId;
            const tabs = window.tabManager.getAllTabs(windowId);
            const activeTab = window.tabManager.getActiveTab(windowId);
            
            if (tabs.length <= 1 || !activeTab) return;
            
            const currentIndex = tabs.findIndex(tab => tab.id === activeTab.id);
            const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            tabBar.activateTab(tabs[prevIndex].id);
          `);
        }
      },
    },
  };

  return actions;
}

export function registerShortcuts(windowManager) {
  const actions = createActions(windowManager);

  const registerFindShortcut = (focusedWindow) => {
    if (focusedWindow) {
      globalShortcut.register("CommandOrControl+F", () => {
        actions.FindInPage.click(focusedWindow);
      });
    }
  };

  const unregisterFindShortcut = () => {
    globalShortcut.unregister("CommandOrControl+F");
  };

  // Register and unregister `Ctrl+F` based on focus
  app.on("browser-window-focus", (event, win) => {
    registerFindShortcut(win);
  });

  app.on("browser-window-blur", () => {
    unregisterFindShortcut();
  });

  // Register remaining shortcuts
  Object.keys(actions).forEach((key) => {
    const action = actions[key];
    if (key !== "FindInPage") {
      // Register other shortcuts except `Ctrl+F`
      globalShortcut.register(action.accelerator, () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) action.click(focusedWindow);
      });
    }
  });
}
