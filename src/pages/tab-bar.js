class TabBar extends HTMLElement {
  constructor() {
    super();
    this.tabs = [];
    this.activeTabId = null;
    this.tabCounter = 0;
    this.webviews = new Map(); // Store webviews by tab ID
    this.webviewContainer = null; // Will be set by connectWebviewContainer
    this.buildTabBar();
  }

  // Connect to the webview container where all webviews will live
  connectWebviewContainer(container) {
    this.webviewContainer = container;
  }

  buildTabBar() {
    this.id = "tabbar";
    this.className = "tabbar";

    // Create add tab button
    const addButton = document.createElement("button");
    addButton.id = "add-tab";
    addButton.className = "add-tab-button";
    addButton.innerHTML = "+";
    addButton.title = "New Tab";
    addButton.addEventListener("click", () => this.addTab());
    
    this.tabContainer = document.createElement("div");
    this.tabContainer.className = "tab-container";
    
    this.appendChild(this.tabContainer);
    this.appendChild(addButton);
    
    // Add first tab automatically
    this.addTab();
  }

  addTab(url = "peersky://home", title = "Home") {
    const tabId = `tab-${this.tabCounter++}`;
    
    // Create tab UI
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.id = tabId;
    tab.dataset.url = url;
    
    const tabTitle = document.createElement("span");
    tabTitle.className = "tab-title";
    tabTitle.textContent = title;
    
    const closeButton = document.createElement("span");
    closeButton.className = "close-tab";
    closeButton.innerHTML = "×";
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });
    
    tab.appendChild(tabTitle);
    tab.appendChild(closeButton);
    
    tab.addEventListener("click", () => this.selectTab(tabId));
    
    this.tabContainer.appendChild(tab);
    this.tabs.push({id: tabId, url, title});
    
    // Create webview for this tab if container exists
    if (this.webviewContainer) {
      this.createWebviewForTab(tabId, url);
    }
    
    this.selectTab(tabId);
    return tabId;
  }

  // Create a new webview for a tab
  createWebviewForTab(tabId, url) {
    // Create webview element
    const webview = document.createElement("webview");
    webview.id = `webview-${tabId}`;
    webview.className = "tab-webview";
    
    // Set important attributes
    webview.setAttribute("src", url);
    webview.setAttribute("allowpopups", "");
    webview.setAttribute("webpreferences", "backgroundThrottling=false");
    webview.setAttribute("nodeintegration", "");
    
    // Set explicit height and width to ensure it fills the container
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.display = "none"; // Hide by default
    
    // Set up event listeners for this webview
    this.setupWebviewEvents(webview, tabId);
    
    // Add to container
    this.webviewContainer.appendChild(webview);
    
    // Store reference
    this.webviews.set(tabId, webview);
    
    return webview;
  }

  // Set up all event handlers for a webview
  setupWebviewEvents(webview, tabId) {
    webview.addEventListener("did-start-loading", () => {
      // Update tab UI to show loading state
      const tabElement = document.getElementById(tabId);
      if (tabElement) tabElement.classList.add("loading");
      
      // Dispatch loading event
      this.dispatchEvent(new CustomEvent("tab-loading", { 
        detail: { tabId, isLoading: true } 
      }));
    });
    
    webview.addEventListener("did-stop-loading", () => {
      // Update tab UI to show loading complete
      const tabElement = document.getElementById(tabId);
      if (tabElement) tabElement.classList.remove("loading");
      
      // Dispatch loading complete event
      this.dispatchEvent(new CustomEvent("tab-loading", { 
        detail: { tabId, isLoading: false } 
      }));
    });
    
    webview.addEventListener("page-title-updated", (e) => {
      const newTitle = e.title || "Untitled";
      this.updateTab(tabId, { title: newTitle });
    });
    
    webview.addEventListener("did-navigate", (e) => {
      const newUrl = e.url;
      this.updateTab(tabId, { url: newUrl });
      
      // Dispatch navigation event
      this.dispatchEvent(new CustomEvent("tab-navigated", { 
        detail: { tabId, url: newUrl } 
      }));
    });
    
    webview.addEventListener("new-window", (e) => {
      // Create a new tab for target URL
      this.addTab(e.url, "New Tab");
    });
  }

  closeTab(tabId) {
    const tabElement = document.getElementById(tabId);
    if (!tabElement) return;
    
    // Get index of tab to close
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove tab from DOM and array
    tabElement.remove();
    this.tabs.splice(tabIndex, 1);
    
    // Remove associated webview
    const webview = this.webviews.get(tabId);
    if (webview) {
      webview.remove();
      this.webviews.delete(tabId);
    }
    
    // If we closed the active tab, select another one
    if (this.activeTabId === tabId) {
      // Select the previous tab, or the next one if there is no previous
      const newTabIndex = Math.max(0, tabIndex - 1);
      if (this.tabs[newTabIndex]) {
        this.selectTab(this.tabs[newTabIndex].id);
      } else if (this.tabs.length === 0) {
        // If no tabs left, create a new one
        this.addTab();
      }
    }
    
    // Dispatch event that tab was closed
    this.dispatchEvent(new CustomEvent("tab-closed", { detail: { tabId } }));
  }

  // Update the selectTab method to handle display properly
  selectTab(tabId) {
    // Don't do anything if this tab is already active
    if (this.activeTabId === tabId) return;
    
    // Remove active class from current active tab
    if (this.activeTabId) {
      const currentActive = document.getElementById(this.activeTabId);
      if (currentActive) {
        currentActive.classList.remove("active");
      }
      
      // Hide the current active webview
      const currentWebview = this.webviews.get(this.activeTabId);
      if (currentWebview) {
        currentWebview.style.display = "none";
      }
    }
    
    // Add active class to new active tab
    const newActive = document.getElementById(tabId);
    if (newActive) {
      newActive.classList.add("active");
      this.activeTabId = tabId;
      
      // Show the newly active webview
      const newWebview = this.webviews.get(tabId);
      if (newWebview) {
        newWebview.style.display = "flex"; // Use flex instead of block
        
        // Force a layout refresh 
        setTimeout(() => {
          if (newWebview.style.display === "flex") {
            // Quick toggle to force redraw
            newWebview.style.display = "none";
            setTimeout(() => {
              newWebview.style.display = "flex";
            }, 0);
          }
        }, 50);
      }
      
      // Find the URL for this tab
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        // Dispatch event that tab was selected with the URL
        this.dispatchEvent(new CustomEvent("tab-selected", { 
          detail: { tabId, url: tab.url } 
        }));
      }
    }
  }

  updateTab(tabId, { url, title }) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    if (url) {
      tab.url = url;
      // Update the webview if URL is updated externally
      const webview = this.webviews.get(tabId);
      if (webview && webview.getAttribute("src") !== url) {
        webview.setAttribute("src", url);
      }
    }
    
    if (title) {
      tab.title = title;
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        const titleElement = tabElement.querySelector(".tab-title");
        if (titleElement) {
          titleElement.textContent = title;
        }
      }
    }
  }

  getActiveTab() {
    return this.tabs.find(tab => tab.id === this.activeTabId);
  }
  
  getActiveWebview() {
    if (!this.activeTabId) return null;
    return this.webviews.get(this.activeTabId);
  }
  
  getWebviewForTab(tabId) {
    return this.webviews.get(tabId);
  }
  
  navigateActiveTab(url) {
    if (!this.activeTabId) return;
    const webview = this.webviews.get(this.activeTabId);
    if (webview) {
      webview.setAttribute("src", url);
      this.updateTab(this.activeTabId, { url });
    }
  }
  
  goBackActiveTab() {
    const webview = this.getActiveWebview();
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  }
  
  goForwardActiveTab() {
    const webview = this.getActiveWebview();
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  }
  
  reloadActiveTab() {
    const webview = this.getActiveWebview();
    if (webview) {
      webview.reload();
    }
  }
  
  stopActiveTab() {
    const webview = this.getActiveWebview();
    if (webview) {
      webview.stop();
    }
  }
}

customElements.define("tab-bar", TabBar);