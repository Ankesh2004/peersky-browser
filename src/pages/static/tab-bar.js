import { tabManager } from "../tab-manager.js";

class TabBar extends HTMLElement {
  constructor() {
    super();
    this.windowId = null;
    this.dragTab = null;
    this.dragOverTab = null;
  }
  
  connectedCallback() {
    // Initialize tab bar UI
    this.innerHTML = `
      <div class="tab-container">
        <div class="tabs-scroll">
          <div class="tabs-inner"></div>
        </div>
        <button class="new-tab-button" title="New Tab">+</button>
      </div>
    `;
    
    // Get window ID from IPC or other means
    window.addEventListener('set-window-id', (e) => {
      this.windowId = e.detail.windowId;
      this.render();
    });
    
    // Add event listeners
    this.querySelector('.new-tab-button').addEventListener('click', () => {
      this.createNewTab();
    });
    
    // Set up event delegation for tab actions
    this.addEventListener('click', this.handleClick);
    
    // Set up drag and drop
    this.setupDragAndDrop();
  }
  
  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
  }
  
  handleClick = (event) => {
    const tabEl = event.target.closest('.tab');
    if (!tabEl) return;
    
    // Handle close button click
    if (event.target.classList.contains('tab-close')) {
      this.closeTab(tabEl.dataset.tabId);
      event.stopPropagation();
      return;
    }
    
    // Handle tab click (activate tab)
    this.activateTab(tabEl.dataset.tabId);
  }
  
  createNewTab(url = "peersky://home") {
    const newTab = tabManager.addTab(this.windowId, { url, setActive: true });
    this.render();
    this.dispatchEvent(new CustomEvent('tab-created', { detail: { tab: newTab } }));
    return newTab;
  }
  
  closeTab(tabId) {
    const result = tabManager.removeTab(this.windowId, tabId);
    if (result) {
      this.render();
      this.dispatchEvent(new CustomEvent('tab-closed', { 
        detail: { 
          removedTabId: tabId, 
          newActiveTabId: result.newActiveTabId 
        }
      }));
    }
  }
  
  activateTab(tabId) {
    const success = tabManager.activateTab(this.windowId, tabId);
    if (success) {
      this.render();
      this.dispatchEvent(new CustomEvent('tab-activated', { detail: { tabId } }));
    }
  }
  
  render() {
    if (!this.windowId) return;
    
    const tabs = tabManager.getAllTabs(this.windowId);
    const tabsInner = this.querySelector('.tabs-inner');
    
    tabsInner.innerHTML = '';
    
    tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${tab.isActive ? 'active' : ''}`;
      tabEl.dataset.tabId = tab.id;
      tabEl.draggable = true;
      
      const favicon = tab.favicon 
        ? `<img src="${tab.favicon}" class="tab-favicon" />`
        : `<div class="tab-favicon default"></div>`;
      
      const loadingIndicator = tab.isLoading
        ? `<div class="tab-loading"></div>`
        : '';
      
      tabEl.innerHTML = `
        ${favicon}
        ${loadingIndicator}
        <span class="tab-title">${tab.title}</span>
        <button class="tab-close" title="Close tab">×</button>
      `;
      
      tabsInner.appendChild(tabEl);
    });
  }
  
  setupDragAndDrop() {
    this.addEventListener('dragstart', (e) => {
      if (!e.target.classList.contains('tab')) return;
      
      this.dragTab = e.target;
      e.dataTransfer.setData('text/plain', e.target.dataset.tabId);
      e.dataTransfer.effectAllowed = 'move';
    });
    
    this.addEventListener('dragover', (e) => {
      e.preventDefault();
      const tab = e.target.closest('.tab');
      if (!tab || tab === this.dragTab) return;
      
      this.dragOverTab = tab;
      
      // Visual indicator for drop position
      const tabsInner = this.querySelector('.tabs-inner');
      const tabs = Array.from(tabsInner.querySelectorAll('.tab'));
      const dragTabIndex = tabs.indexOf(this.dragTab);
      const dropTabIndex = tabs.indexOf(tab);
      
      tabs.forEach(t => t.classList.remove('drag-over-before', 'drag-over-after'));
      
      if (dragTabIndex < dropTabIndex) {
        tab.classList.add('drag-over-after');
      } else {
        tab.classList.add('drag-over-before');
      }
    });
    
    this.addEventListener('dragleave', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) {
        tab.classList.remove('drag-over-before', 'drag-over-after');
      }
    });
    
    this.addEventListener('drop', (e) => {
      e.preventDefault();
      
      const tabId = e.dataTransfer.getData('text/plain');
      const tab = e.target.closest('.tab');
      
      if (!tab || tab.dataset.tabId === tabId) return;
      
      // Calculate new index
      const tabsInner = this.querySelector('.tabs-inner');
      const tabs = Array.from(tabsInner.querySelectorAll('.tab'));
      const newIndex = tabs.indexOf(tab);
      
      // Move tab in the model
      tabManager.moveTab(this.windowId, tabId, newIndex);
      
      // Clean up
      tabs.forEach(t => t.classList.remove('drag-over-before', 'drag-over-after'));
      this.render();
    });
    
    this.addEventListener('dragend', () => {
      const tabs = this.querySelectorAll('.tab');
      tabs.forEach(t => t.classList.remove('drag-over-before', 'drag-over-after'));
      
      this.dragTab = null;
      this.dragOverTab = null;
    });
  }
}

customElements.define('tab-bar', TabBar);