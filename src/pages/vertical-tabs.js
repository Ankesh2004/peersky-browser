const BaseTabBar = customElements.get('tab-bar');

export default class VerticalTabs extends BaseTabBar {
  constructor() {
    super();
    this.isExpanded = false;
    this.expandOnHover = false;
  }

  buildTabBar() {
    super.buildTabBar();
    this.classList.add('vertical-tabs');
    if (this.tabContainer) {
      this.tabContainer.classList.add('vertical-tabs-container');
    }
    
    // Create toggle button for manual expand/collapse
    this.createToggleButton();
    
    // Initially set up based on current setting
    this.setupExpandBehavior();
    
    // Ensure CSS is loaded before applying styles
    this.loadVerticalTabsCSS();
  }
  
  createToggleButton() {
    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'vertical-tabs-toggle';
    this.toggleButton.innerHTML = '◀'; // Left arrow when collapsed
    this.toggleButton.title = 'Expand tabs';
    this.toggleButton.style.display = 'none'; // Hidden by default
    
    // Position at the top of the vertical tabs
    this.insertBefore(this.toggleButton, this.tabContainer);
    
    // Add click event listener
    this.toggleButton.addEventListener('click', () => {
      this.toggleExpansion();
    });
  }

  async setupExpandBehavior() {
    try {
      const { ipcRenderer } = require('electron');
      this.expandOnHover = await ipcRenderer.invoke('settings-get', 'verticalTabsExpandOnHover');
      console.log('VerticalTabs: expandOnHover setting:', this.expandOnHover);
      this.updateExpandBehavior();
    } catch (error) {
      console.error('Failed to get verticalTabsExpandOnHover setting:', error);
      this.expandOnHover = true;
      this.updateExpandBehavior();
    }
  }
  
  updateExpandBehavior() {
    console.log('VerticalTabs: Updating expand behavior, expandOnHover:', this.expandOnHover);
    
    if (this.expandOnHover) {
      // Enable hover behavior
      this.enableHoverExpansion();
      if (this.toggleButton) {
        this.toggleButton.style.display = 'none';
      }
      this.classList.remove('manual-toggle');
      // Also remove expanded class when switching to hover mode
      this.classList.remove('expanded');
    } else {
      // Disable hover behavior and show toggle button
      this.disableHoverExpansion();
      if (this.toggleButton) {
        this.toggleButton.style.display = 'block';
      }
      this.classList.add('manual-toggle');
      // Start in collapsed state
      this.isExpanded = false;
      this.classList.remove('expanded');
      if (this.toggleButton) {
        this.toggleButton.innerHTML = '◀';
        this.toggleButton.title = 'Expand tabs';
      }
    }
  }
  
  enableHoverExpansion() {
    // Remove any existing listeners first
    this.removeEventListener('mouseenter', this.handleMouseEnter);
    this.removeEventListener('mouseleave', this.handleMouseLeave);
    
    // Add hover event listeners
    this.handleMouseEnter = () => {
      this.isExpanded = true;
      this.classList.add('expanded');
    };
    
    this.handleMouseLeave = () => {
      this.isExpanded = false;
      this.classList.remove('expanded');
    };
    
    this.addEventListener('mouseenter', this.handleMouseEnter);
    this.addEventListener('mouseleave', this.handleMouseLeave);
  }
  
  disableHoverExpansion() {
    // Remove hover event listeners
    this.removeEventListener('mouseenter', this.handleMouseEnter);
    this.removeEventListener('mouseleave', this.handleMouseLeave);
  }
  
  toggleExpansion() {
    this.isExpanded = !this.isExpanded;
    
    if (this.isExpanded) {
      this.classList.add('expanded');
      this.toggleButton.innerHTML = '▶'; // Right arrow when expanded
      this.toggleButton.title = 'Collapse tabs';
    } else {
      this.classList.remove('expanded');
      this.toggleButton.innerHTML = '◀'; // Left arrow when collapsed
      this.toggleButton.title = 'Expand tabs';
    }
  }
  
  // Handle setting change from main process
  onExpandOnHoverChanged(enabled) {
    console.log('VerticalTabs: onExpandOnHoverChanged called with:', enabled);
    this.expandOnHover = enabled;
    this.updateExpandBehavior();
  }

  loadVerticalTabsCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="vertical-tabs.css"]')) {
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'browser://theme/vertical-tabs.css';
    link.onload = () => {
      // Force a reflow to apply styles
      this.style.display = 'none';
      this.offsetHeight; // Trigger reflow
      this.style.display = '';
    };
    document.head.appendChild(link);
  }

  // Override tab creation to ensure proper favicon handling
  addTabWithId(tabId, url = "peersky://home", title = "Home") {
    const result = super.addTabWithId(tabId, url, title);
    
    // Ensure favicon is properly sized for vertical tabs
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
      const favicon = tabElement.querySelector('.tab-favicon');
      if (favicon && !favicon.style.backgroundImage || favicon.style.backgroundImage === 'none') {
        favicon.style.backgroundImage = "url(peersky://static/assets/icon16.png)";
      }
    }
    
    return result;
  }
}

customElements.define('vertical-tabs', VerticalTabs);