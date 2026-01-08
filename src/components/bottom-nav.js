/**
 * COMPONENTE: Barra de Navegación Inferior
 * 
 * Componente reutilizable para la navegación inferior
 * con iconos y etiquetas claras para adultos mayores
 */

class BottomNavigation {
  /**
   * Constructor de la barra de navegación
   * @param {HTMLElement} container - Contenedor donde se renderizará
   * @param {Array} items - Array de objetos con {id, label, icon}
   * @param {Function} onNavigate - Callback cuando se selecciona un item
   */
  constructor(container, items, onNavigate) {
    this.container = container;
    this.items = items;
    this.onNavigate = onNavigate;
    this.activeItem = items[0]?.id || null;
    this.init();
  }

  /**
   * Inicializa el componente creando la estructura HTML
   */
  init() {
    // Mapeo de IDs a íconos SVG
    const iconMap = {
      'home': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
      'chat': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      'album': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
      'perfil': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      'solicitudes': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
      'rutas': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
      'puntaje': '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
    };

    this.container.innerHTML = `
      <nav class="bottom-nav">
        ${this.items.map(item => `
          <button 
            class="bottom-nav-item ${this.activeItem === item.id ? 'active' : ''}" 
            data-nav="${item.id}"
            aria-label="${item.label}"
          >
            <span class="nav-icon">${iconMap[item.id] || item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </button>
        `).join('')}
      </nav>
    `;

    // Agregar event listeners
    this.container.querySelectorAll('.bottom-nav-item').forEach(button => {
      button.addEventListener('click', (e) => {
        const navId = e.currentTarget.getAttribute('data-nav');
        this.setActive(navId);
        if (this.onNavigate) {
          this.onNavigate(navId);
        }
      });
    });
  }

  /**
   * Establece el item activo
   * @param {string} itemId - ID del item a activar
   */
  setActive(itemId) {
    this.activeItem = itemId;
    this.container.querySelectorAll('.bottom-nav-item').forEach(button => {
      if (button.getAttribute('data-nav') === itemId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }

  /**
   * Obtiene el item activo actual
   * @returns {string} ID del item activo
   */
  getActive() {
    return this.activeItem;
  }
}

// Hacer disponible globalmente para uso en main.js
window.BottomNavigation = BottomNavigation;

