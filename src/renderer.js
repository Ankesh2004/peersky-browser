import {
  IPFS_PREFIX,
  IPNS_PREFIX,
  HYPER_PREFIX,
  WEB3_PREFIX,
  handleURL,
} from "./utils.js";
const { ipcRenderer } = require("electron");

const DEFAULT_PAGE = "peersky://home";
const webviewContainer = document.querySelector("#webview");
const nav = document.querySelector("#navbox");
const findMenu = document.querySelector("#find");
const pageTitle = document.querySelector("title");

const searchParams = new URL(window.location.href).searchParams;
const toNavigate = searchParams.has("url")
  ? searchParams.get("url")
  : DEFAULT_PAGE;

document.addEventListener("DOMContentLoaded", () => {
  if (webviewContainer && nav) {
    webviewContainer.loadURL(toNavigate);

    focusURLInput();

    // Navigation Button Event Listeners
    nav.addEventListener("back", () => webviewContainer.goBack());
    nav.addEventListener("forward", () => webviewContainer.goForward());
    nav.addEventListener("reload", () => webviewContainer.reload());
    nav.addEventListener("stop", () => webviewContainer.stop());
    nav.addEventListener("home", () => {
      webviewContainer.loadURL("peersky://home");
      nav.querySelector("#url").value = "peersky://home";
    });
    nav.addEventListener("navigate", ({ detail }) => {
      const { url } = detail;
      navigateTo(url);
    });
    nav.addEventListener("new-window", () => {
      ipcRenderer.send("new-window");
    });

    // Handle webview loading events to toggle refresh/stop button
    if (webviewContainer.webviewElement) {
      webviewContainer.webviewElement.addEventListener(
        "did-start-loading",
        () => {
          nav.setLoading(true);
        }
      );

      webviewContainer.webviewElement.addEventListener(
        "did-stop-loading",
        () => {
          nav.setLoading(false);
          updateNavigationButtons();
        }
      );

      webviewContainer.webviewElement.addEventListener("did-fail-load", () => {
        nav.setLoading(false);
        updateNavigationButtons();
      });

      webviewContainer.webviewElement.addEventListener("did-navigate", () => {
        updateNavigationButtons();
      });
    } else {
      console.error("webviewElement not found in webviewContainer");
    }

    const urlInput = nav.querySelector("#url");
    if (urlInput) {
      urlInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
          const rawURL = urlInput.value.trim();
          const url = handleURL(rawURL);
          try {
            webviewContainer.loadURL(url);
          } catch (error) {
            console.error("Error loading URL:", error);
          }
        }
      });
    } else {
      console.error("URL input not found within nav-box.");
    }

    // Update URL input and send navigation event
    webviewContainer.addEventListener("did-navigate", (e) => {
      if (urlInput) {
        urlInput.value = e.detail.url;
      }
      ipcRenderer.send("webview-did-navigate", e.detail.url);
    });

    // Update page title
    webviewContainer.addEventListener("page-title-updated", (e) => {
      pageTitle.innerText = e.detail.title ? `${e.detail.title} - Peersky Browser` : "Peersky Browser";
    });

    // Find Menu Event Listeners
    findMenu.addEventListener("next", ({ detail }) => {
      webviewContainer.executeJavaScript(
        `window.find("${detail.value}", ${detail.findNext})`
      );
    });

    findMenu.addEventListener("previous", ({ detail }) => {
      webviewContainer.executeJavaScript(
        `window.find("${detail.value}", ${detail.findNext}, true)`
      );
    });

    findMenu.addEventListener("hide", () => {
      webviewContainer.focus();
    });

    // Initial update of navigation buttons
    updateNavigationButtons();
  } else {
    console.error("webviewContainer or nav not found");
  }

  // Set up tab-related events
  const tabBar = document.querySelector("#tabbar");
  if (tabBar && webviewContainer) {
    // When a tab is activated, update the URL bar
    tabBar.addEventListener("tab-activated", async ({ detail }) => {
      const { tabId } = detail;
      const windowId = tabBar.windowId;
      
      // Get current tab data
      const tabs = tabManager.getAllTabs(windowId);
      const activeTab = tabs.find(tab => tab.id === tabId);
      
      if (activeTab && nav) {
        const urlInput = nav.querySelector("#url");
        if (urlInput) {
          urlInput.value = activeTab.url;
        }
        
        // Update window title
        document.title = activeTab.title ? `${activeTab.title} - Peersky Browser` : "Peersky Browser";
        
        // Update navigation buttons
        nav.setNavigationButtons(activeTab.canGoBack, activeTab.canGoForward);
      }
    });
    
    // When URL is updated via navigation bar
    nav.addEventListener("navigate", ({ detail }) => {
      const { url } = detail;
      const processedUrl = handleURL(url);
      webviewContainer.loadURL(processedUrl);
    });
    
    // When a webview updates its title
    webviewContainer.addEventListener("page-title-updated", ({ detail }) => {
      const { tabId, title } = detail;
      const windowId = tabBar.windowId;
      
      // Update tab UI to reflect new title
      tabBar.render();
      
      // Update window title if this is the active tab
      const activeTab = tabManager.getActiveTab(windowId);
      if (activeTab && activeTab.id === tabId) {
        document.title = title ? `${title} - Peersky Browser` : "Peersky Browser";
      }
    });
    
    // When a webview updates its URL
    webviewContainer.addEventListener("did-navigate", ({ detail }) => {
      const { tabId, url } = detail;
      const windowId = tabBar.windowId;
      
      // Update URL bar if this is the active tab
      const activeTab = tabManager.getActiveTab(windowId);
      if (activeTab && activeTab.id === tabId && nav) {
        const urlInput = nav.querySelector("#url");
        if (urlInput) {
          urlInput.value = url;
        }
      }
      
      // Save tab state
      tabManager.saveTabState(windowId);
    });
    
    // Keyboard shortcuts for tabs
    document.addEventListener("keydown", (e) => {
      // Ctrl+T: New tab
      if (e.key === "t" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        tabBar.createNewTab();
      }
      
      // Ctrl+W: Close tab
      if (e.key === "w" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const windowId = tabBar.windowId;
        const activeTab = tabManager.getActiveTab(windowId);
        if (activeTab) {
          tabBar.closeTab(activeTab.id);
        }
      }
      
      // Ctrl+Tab: Next tab
      if (e.key === "Tab" && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        const windowId = tabBar.windowId;
        const tabs = tabManager.getAllTabs(windowId);
        const activeTab = tabManager.getActiveTab(windowId);
        
        if (tabs.length <= 1 || !activeTab) return;
        
        const currentIndex = tabs.findIndex(tab => tab.id === activeTab.id);
        const nextIndex = (currentIndex + 1) % tabs.length;
        tabBar.activateTab(tabs[nextIndex].id);
      }
      
      // Ctrl+Shift+Tab: Previous tab
      if (e.key === "Tab" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        const windowId = tabBar.windowId;
        const tabs = tabManager.getAllTabs(windowId);
        const activeTab = tabManager.getActiveTab(windowId);
        
        if (tabs.length <= 1 || !activeTab) return;
        
        const currentIndex = tabs.findIndex(tab => tab.id === activeTab.id);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        tabBar.activateTab(tabs[prevIndex].id);
      }
      
      // Ctrl+1-9: Switch to specific tab
      if (e.key >= "1" && e.key <= "9" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const windowId = tabBar.windowId;
        const tabs = tabManager.getAllTabs(windowId);
        
        if (tabIndex < tabs.length) {
          tabBar.activateTab(tabs[tabIndex].id);
        }
      }
    });
  }
});

function updateNavigationButtons() {
  if (webviewContainer && nav && webviewContainer.webviewElement) {
    const canGoBack = webviewContainer.webviewElement.canGoBack();
    const canGoForward = webviewContainer.webviewElement.canGoForward();
    nav.setNavigationButtons(canGoBack, canGoForward);
  }
}

function navigateTo(url) {
  webviewContainer.loadURL(url);
}

function focusURLInput() {
  const urlInput = nav.querySelector("#url");
  if (urlInput) {
    urlInput.focus();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    findMenu.toggle();
  }
});
