class NavBox extends HTMLElement {
  constructor() {
    super();
    this.isLoading = false;
    this.buildNavBox();
    this.attachEvents();
  }

  buildNavBox() {
    this.id = "navbox";
    const buttons = [
      { id: "back", svg: "left.svg", position: "start" },
      { id: "forward", svg: "right.svg", position: "start" },
      { id: "refresh", svg: "reload.svg", position: "start" },
      { id: "home", svg: "home.svg", position: "start" },
      { id: "plus", svg: "plus.svg", position: "end" },
    ];

    this.buttonElements = {};

    // Create buttons that should appear before the URL input
    buttons
      .filter((btn) => btn.position === "start")
      .forEach((button) => {
        const btnElement = this.createButton(
          button.id,
          `peersky://static/assets/svg/${button.svg}`
        );
        this.appendChild(btnElement);
        this.buttonElements[button.id] = btnElement;
      });

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.id = "url";
    urlInput.placeholder = "Search with DuckDuckGo or type a P2P URL";
    this.appendChild(urlInput);

    // Create buttons that should appear after the URL input
    buttons
      .filter((btn) => btn.position === "end")
      .forEach((button) => {
        const btnElement = this.createButton(
          button.id,
          `peersky://static/assets/svg/${button.svg}`
        );
        this.appendChild(btnElement);
        this.buttonElements[button.id] = btnElement;
      });

    // extension ui button
    this.extensionButton = document.createElement('button');
    this.extensionButton.className = 'nav-button extensions-button';
    this.extensionButton.title = 'Extensions';
    this.extensionButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1"></rect>
        <rect x="13" y="3" width="8" height="8" rx="1"></rect>
        <rect x="3" y="13" width="8" height="8" rx="1"></rect>
        <rect x="13" y="13" width="8" height="8" rx="1"></rect>
      </svg>
    `;
    this.navContainer.appendChild(this.extensionButton);
    
    // Create the extension popup
    this.extensionPopup = document.createElement('div');
    this.extensionPopup.className = 'extension-popup hidden';
    this.extensionPopup.innerHTML = `
      <div class="extension-popup-header">
        <h3>Extensions</h3>
        <a href="peersky://settings" class="settings-link">Manage</a>
      </div>
      <ul class="extension-list"></ul>
    `;
    document.body.appendChild(this.extensionPopup);
  }

  createButton(id, svgPath) {
    const button = document.createElement("button");
    button.className = "nav-button";
    button.id = id;

    // Create a container for the SVG to manage icons
    const svgContainer = document.createElement("div");
    svgContainer.className = "svg-container";
    button.appendChild(svgContainer);

    this.loadSVG(svgContainer, svgPath);

    return button;
  }

  loadSVG(container, svgPath) {
    fetch(svgPath)
      .then((response) => response.text())
      .then((svgContent) => {
        container.innerHTML = svgContent;
        const svgElement = container.querySelector("svg");
        if (svgElement) {
          svgElement.setAttribute("width", "18");
          svgElement.setAttribute("height", "18");
          svgElement.setAttribute("fill", "currentColor");
        }
      })
      .catch((error) => {
        console.error(`Error loading SVG from ${svgPath}:`, error);
      });
  }

  updateButtonIcon(button, svgFileName) {
    const svgPath = `peersky://static/assets/svg/${svgFileName}`;
    const svgContainer = button.querySelector(".svg-container");
    if (svgContainer) {
      this.loadSVG(svgContainer, svgPath);
    } else {
      console.error("SVG container not found within the button.");
    }
  }

  setLoading(isLoading) {
    this.isLoading = isLoading;
    const refreshButton = this.buttonElements["refresh"];
    if (refreshButton) {
      if (isLoading) {
        this.updateButtonIcon(refreshButton, "close.svg");
      } else {
        this.updateButtonIcon(refreshButton, "reload.svg");
      }
    } else {
      console.error("Refresh button not found.");
    }
  }

  setNavigationButtons(canGoBack, canGoForward) {
    const backButton = this.buttonElements["back"];
    const forwardButton = this.buttonElements["forward"];

    if (backButton) {
      if (canGoBack) {
        backButton.classList.add("active");
        backButton.removeAttribute("disabled");
      } else {
        backButton.classList.remove("active");
        backButton.setAttribute("disabled", "true");
      }
    }

    if (forwardButton) {
      if (canGoForward) {
        forwardButton.classList.add("active");
        forwardButton.removeAttribute("disabled");
      } else {
        forwardButton.classList.remove("active");
        forwardButton.setAttribute("disabled", "true");
      }
    }
  }

  attachEvents() {
    this.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) {
        if (button.id === "refresh") {
          if (this.isLoading) {
            this.dispatchEvent(new CustomEvent("stop"));
          } else {
            this.dispatchEvent(new CustomEvent("reload"));
          }
        } else if (button.id === "plus") {
          this.dispatchEvent(new CustomEvent("new-window"));
        } else if (!button.disabled) {
          this.navigate(button.id);
        }
      }
    });

    const urlInput = this.querySelector("#url");
    if (urlInput) {
      urlInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
          const url = event.target.value.trim();
          this.dispatchEvent(new CustomEvent("navigate", { detail: { url } }));
        }
      });
    } else {
      console.error("URL input not found within nav-box.");
    }

// Toggle extension popup
this.extensionButton.addEventListener('click', () => {
  // Fetch and display extensions
  this.fetchExtensions();
  
  // Toggle popup visibility
  this.extensionPopup.classList.toggle('hidden');
});

// Close popup when clicking outside
document.addEventListener('click', (e) => {
  if (!this.extensionPopup.contains(e.target) && 
      !this.extensionButton.contains(e.target) &&
      !this.extensionPopup.classList.contains('hidden')) {
    this.extensionPopup.classList.add('hidden');
  }
});
  }

  navigate(action) {
    this.dispatchEvent(new CustomEvent(action));
  }

  // extension ui button
  fetchExtensions() {
    const { ipcRenderer } = require('electron');
    const extensionList = this.extensionPopup.querySelector('.extension-list');
    
    ipcRenderer.invoke('get-installed-extensions')
      .then(extensions => {
        extensionList.innerHTML = '';
        
        if (extensions.length === 0) {
          extensionList.innerHTML = '<li class="no-extensions">No extensions installed</li>';
          return;
        }
        
        extensions.forEach(ext => {
          const item = document.createElement('li');
          item.className = `extension-item ${ext.enabled ? 'enabled' : 'disabled'}`;
          
          item.innerHTML = `
            <div class="extension-info">
              <span class="extension-name">${ext.name}</span>
              <span class="extension-version">${ext.version}</span>
            </div>
            <label class="switch">
              <input type="checkbox" ${ext.enabled ? 'checked' : ''} data-id="${ext.id}">
              <span class="slider round"></span>
            </label>
          `;
          
          const toggle = item.querySelector('input[type="checkbox"]');
          toggle.addEventListener('change', (e) => {
            ipcRenderer.invoke('toggle-extension', e.target.dataset.id, e.target.checked)
              .then(() => this.fetchExtensions());
          });
          
          extensionList.appendChild(item);
        });
      })
      .catch(err => {
        console.error('Failed to fetch extensions:', err);
        extensionList.innerHTML = '<li class="error">Failed to load extensions</li>';
      });
  }

}

customElements.define("nav-box", NavBox);
