const { ipcRenderer } = require('electron');

class TitleBar extends HTMLElement {
  constructor() {
    super();
    this.buildTitleBar();
  }

  buildTitleBar() {
    this.id = "titlebar";
    this.className = "titlebar";
    
    // Left side - App icon
    const appIcon = document.createElement("div");
    appIcon.className = "app-icon";
    
    // Middle - Tabs container
    this.tabsContainer = document.createElement("div");
    this.tabsContainer.id = "tabbar-container";
    this.tabsContainer.className = "tabbar-container";
    
    // Right side - Window controls
    const windowControls = document.createElement("div");
    windowControls.className = "window-controls";
    
    // Create window control buttons
    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "window-control minimize";
    minimizeBtn.innerHTML = "&#8211;";
    minimizeBtn.title = "Minimize";
    
    const maximizeBtn = document.createElement("button");
    maximizeBtn.className = "window-control maximize";
    maximizeBtn.innerHTML = "&#10065;";
    maximizeBtn.title = "Maximize";
    
    const closeBtn = document.createElement("button");
    closeBtn.className = "window-control close";
    closeBtn.innerHTML = "&#10005;";
    closeBtn.title = "Close";
    
    // Add event listeners
    minimizeBtn.addEventListener("click", () => {
      ipcRenderer.send("window-control", "minimize");
    });
    
    maximizeBtn.addEventListener("click", () => {
      ipcRenderer.send("window-control", "maximize");
    });
    
    closeBtn.addEventListener("click", () => {
      ipcRenderer.send("window-control", "close");
    });
    
    // Append window controls
    windowControls.appendChild(minimizeBtn);
    windowControls.appendChild(maximizeBtn);
    windowControls.appendChild(closeBtn);
    
    // Append all elements to titlebar
    this.appendChild(appIcon);
    this.appendChild(this.tabsContainer);
    this.appendChild(windowControls);
  }
  
  connectTabBar(tabBar) {
    // Add the tabBar to our container
    if (tabBar) {
      this.tabsContainer.appendChild(tabBar);
    }
  }
}

customElements.define('title-bar', TitleBar);