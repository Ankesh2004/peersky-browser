export class TabManager {
    constructor() {
      this.tabs = new Map(); // windowId -> array of tab objects
    }

    init() {
        // Initialize any global state or event listeners
        console.log("Tab Manager initialized");
        
        // You could add app-level event listeners here if needed
        // For example, listening for window creation events to initialize tabs
        window.Electron.receive('window-created', (windowId) => {
            this.initWindow(windowId);
          });
      }
    
    initWindow(windowId) {
      this.tabs.set(windowId, []);
    }
    
    addTab(windowId, tabData = { url: "peersky://home" }) {
      const tabs = this.tabs.get(windowId) || [];
      const newTab = {
        id: crypto.randomUUID(),
        url: tabData.url,
        title: tabData.title || "New Tab",
        favicon: tabData.favicon || null,
        isLoading: false,
        isActive: tabs.length === 0,
        canGoBack: false,
        canGoForward: false
      };
      
      // If this is a new tab, set it as active
      if (tabData.setActive) {
        this.deactivateAllTabs(windowId);
        newTab.isActive = true;
      }
      
      tabs.push(newTab);
      this.tabs.set(windowId, tabs);
      return newTab;
    }
    
    removeTab(windowId, tabId) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return null;
      
      const tabIndex = tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return null;
      
      const removedTab = tabs.splice(tabIndex, 1)[0];
      
      // If we removed the active tab, activate the next one
      if (removedTab.isActive && tabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, tabs.length - 1);
        tabs[newActiveIndex].isActive = true;
      }
      
      this.tabs.set(windowId, tabs);
      return { removedTab, newActiveTabId: tabs.length > 0 ? tabs.find(tab => tab.isActive)?.id : null };
    }
    
    activateTab(windowId, tabId) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return false;
      
      this.deactivateAllTabs(windowId);
      
      const tab = tabs.find(tab => tab.id === tabId);
      if (tab) {
        tab.isActive = true;
        return true;
      }
      return false;
    }
    
    deactivateAllTabs(windowId) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return;
      
      tabs.forEach(tab => { tab.isActive = false; });
    }
    
    updateTab(windowId, tabId, updates) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return null;
      
      const tab = tabs.find(tab => tab.id === tabId);
      if (!tab) return null;
      
      Object.assign(tab, updates);
      return tab;
    }
    
    getActiveTab(windowId) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return null;
      
      return tabs.find(tab => tab.isActive);
    }
    
    getAllTabs(windowId) {
      return this.tabs.get(windowId) || [];
    }
    
    moveTab(windowId, tabId, newIndex) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return false;
      
      const oldIndex = tabs.findIndex(tab => tab.id === tabId);
      if (oldIndex === -1) return false;
      
      const [movedTab] = tabs.splice(oldIndex, 1);
      tabs.splice(newIndex, 0, movedTab);
      
      return true;
    }
    
    saveTabState(windowId) {
      const tabs = this.tabs.get(windowId);
      if (!tabs) return;
      
      localStorage.setItem(`peersky-tabs-${windowId}`, JSON.stringify(tabs));
    }
    
    loadTabState(windowId) {
      const savedTabs = localStorage.getItem(`peersky-tabs-${windowId}`);
      if (!savedTabs) return [];
      
      try {
        const parsedTabs = JSON.parse(savedTabs);
        this.tabs.set(windowId, parsedTabs);
        return parsedTabs;
      } catch (e) {
        console.error("Error loading saved tabs", e);
        return [];
      }
    }
  }
  
  export const tabManager = new TabManager();