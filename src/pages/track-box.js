import { tabManager } from "../tab-manager.js";
const path = require("path");

class TrackedBox extends HTMLElement {
  constructor() {
    super();
    this.observer = new ResizeObserver(() => this.emitResize());
    this.webviews = new Map(); // tabId -> webview
    this.windowId = null;
  }
  
  connectedCallback() {
    this.observer.observe(this);
    
    // Initialize container for webviews
    this.innerHTML = `<div class="webviews-container"></div>`;
    this.container = this.querySelector('.webviews-container');
    
    // Get window ID from IPC or other means
    window.addEventListener('set-window-id', (e) => {
      this.windowId = e.detail.windowId;
      
      // Load saved tabs or create a default tab
      const savedTabs = tabManager.loadTabState(this.windowId);
      if (savedTabs.length === 0) {
        tabManager.addTab(this.windowId, { url: "peersky://home", setActive: true });
      }
      
      // Initialize webviews for all tabs
      tabManager.getAllTabs(this.windowId).forEach(tab => {
        this.createWebView(tab.id, tab.url);
      });
      
      this.updateVisibility();
    });
    
    // Listen for tab events
    document.addEventListener('tab-created', (e) => {
      const { tab } = e.detail;
      this.createWebView(tab.id, tab.url);
      this.updateVisibility();
    });
    
    document.addEventListener('tab-closed', (e) => {
      const { removedTabId, newActiveTabId } = e.detail;
      this.removeWebView(removedTabId);
      this.updateVisibility();
    });
    
    document.addEventListener('tab-activated', (e) => {
      const { tabId } = e.detail;
      this.updateVisibility();
    });
    
    this.emitResize();
  }
  
  disconnectedCallback() {
    this.observer.unobserve(this);
    
    // Clean up all webviews
    this.webviews.forEach((webview, tabId) => {
      this.removeWebView(tabId);
    });
  }
  
  createWebView(tabId, url) {
    // Skip if webview already exists
    if (this.webviews.has(tabId)) return;
    
    const webview = document.createElement("webview");
    webview.setAttribute("allowpopups", "true");
    webview.style.height = "100%";
    webview.style.width = "100%";
    webview.style.display = "flex";
    
    // Dynamically resolve the preload script path
    webview.preload = "file://" + path.join(__dirname, "preload.js");
    
    // Set initial URL
    webview.src = url;
    
    // Store reference
    this.webviews.set(tabId, webview);
    
    // Add to container
    this.container.appendChild(webview);
    
    // Set up event listeners
    this.setupWebViewEvents(webview, tabId);
    
    return webview;
  }
  
  removeWebView(tabId) {
    const webview = this.webviews.get(tabId);
    if (!webview) return;
    
    // Remove from DOM
    if (webview.parentNode) {
      webview.parentNode.removeChild(webview);
    }
    
    // Remove from map
    this.webviews.delete(tabId);
  }
  
  setupWebViewEvents(webview, tabId) {
    webview.addEventListener("did-start-loading", () => {
      tabManager.updateTab(this.windowId, tabId, { isLoading: true });
      this.dispatchEvent(new CustomEvent("did-start-loading", { detail: { tabId } }));
    });
    
    webview.addEventListener("did-stop-loading", () => {
      tabManager.updateTab(this.windowId, tabId, { 
        isLoading: false,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward()
      });
      this.dispatchEvent(new CustomEvent("did-stop-loading", { detail: { tabId } }));
    });
    
    webview.addEventListener("page-title-updated", (e) => {
      tabManager.updateTab(this.windowId, tabId, { title: e.title });
      this.dispatchEvent(new CustomEvent("page-title-updated", { 
        detail: { tabId, title: e.title } 
      }));
    });
    
    webview.addEventListener("page-favicon-updated", (e) => {
      if (e.favicons && e.favicons.length > 0) {
        tabManager.updateTab(this.windowId, tabId, { favicon: e.favicons[0] });
        this.dispatchEvent(new CustomEvent("page-favicon-updated", { 
          detail: { tabId, favicon: e.favicons[0] } 
        }));
      }
    });
    
    webview.addEventListener("did-navigate", (e) => {
      tabManager.updateTab(this.windowId, tabId, { 
        url: e.url,
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward()
      });
      this.dispatchEvent(new CustomEvent("did-navigate", { 
        detail: { tabId, url: e.url } 
      }));
    });
  }
  
  updateVisibility() {
    if (!this.windowId) return;
    
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return;
    
    // Hide all webviews
    this.webviews.forEach(webview => {
      webview.style.display = 'none';
    });
    
    // Show only the active tab's webview
    const activeWebview = this.webviews.get(activeTab.id);
    if (activeWebview) {
      activeWebview.style.display = 'flex';
    }
  }
  
  emitResize() {
    const { x, y, width, height } = this.getBoundingClientRect();
    this.dispatchEvent(
      new CustomEvent("resize", { detail: { x, y, width, height } })
    );
  }
  
  // Public methods for controlling active webview
  goBack() {
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return;
    
    const webview = this.webviews.get(activeTab.id);
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  }
  
  goForward() {
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return;
    
    const webview = this.webviews.get(activeTab.id);
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  }
  
  reload() {
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return;
    
    const webview = this.webviews.get(activeTab.id);
    if (webview) {
      webview.reload();
    }
  }
  
  stop() {
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return;
    
    const webview = this.webviews.get(activeTab.id);
    if (webview) {
      webview.stop();
    }
  }
  
  loadURL(url) {
    const activeTab = tabManager.getActiveTab(this.windowId);
    
    // If no active tab, create a new one
    if (!activeTab) {
      const newTab = tabManager.addTab(this.windowId, { url, setActive: true });
      this.createWebView(newTab.id, url);
      this.updateVisibility();
      return;
    }
    
    // Update existing tab
    tabManager.updateTab(this.windowId, activeTab.id, { url });
    
    // Load URL in webview
    const webview = this.webviews.get(activeTab.id);
    if (webview) {
      webview.src = url;
    }
  }
  
  get webviewElement() {
    const activeTab = tabManager.getActiveTab(this.windowId);
    if (!activeTab) return null;
    
    return this.webviews.get(activeTab.id);
  }
  
  executeJavaScript(script) {
    const webview = this.webviewElement;
    if (webview) {
      return webview.executeJavaScript(script);
    }
    return Promise.reject(new Error("No active webview"));
  }
}

customElements.define("tracked-box", TrackedBox);
