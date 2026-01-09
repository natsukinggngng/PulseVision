/**
 * COMPONENTE: Sistema de Navegación Interna
 * Maneja el historial de navegación y controla el botón de retroceso
 */

class NavigationManager {
  constructor() {
    this.history = [];
    this.currentIndex = -1;
    this.isNavigating = false;
    this.init();
  }

  init() {
    // Interceptar el botón de retroceso del navegador
    window.addEventListener('popstate', (e) => {
      if (!this.isNavigating) {
        this.handleBrowserBack();
      }
    });

    // Agregar estado inicial si no existe
    if (this.history.length === 0) {
      this.pushState('role-selection', 'role-selection');
    }
  }

  /**
   * Agrega un nuevo estado al historial
   * @param {string} pageId - ID de la página
   * @param {string} viewId - ID de la vista específica
   * @param {Object} data - Datos adicionales del estado
   */
  pushState(pageId, viewId, data = {}) {
    // Si estamos navegando hacia adelante, eliminar estados futuros
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const state = {
      pageId,
      viewId,
      data,
      timestamp: Date.now()
    };

    this.history.push(state);
    this.currentIndex = this.history.length - 1;

    // Actualizar URL sin recargar
    const url = `#${viewId}`;
    window.history.pushState({ index: this.currentIndex }, '', url);
  }

  /**
   * Navega hacia atrás en el historial
   * @returns {boolean} - true si pudo retroceder, false si está en el inicio
   */
  goBack() {
    if (this.currentIndex > 0) {
      this.isNavigating = true;
      this.currentIndex--;
      const state = this.history[this.currentIndex];
      
      // Actualizar URL
      window.history.pushState({ index: this.currentIndex }, '', `#${state.viewId}`);
      
      // Restaurar vista
      this.restoreState(state);
      
      setTimeout(() => {
        this.isNavigating = false;
      }, 100);
      
      return true;
    }
    return false;
  }

  /**
   * Maneja el retroceso del navegador
   */
  handleBrowserBack() {
    if (this.currentIndex > 0) {
      this.isNavigating = true;
      this.currentIndex--;
      const state = this.history[this.currentIndex];
      this.restoreState(state);
      
      setTimeout(() => {
        this.isNavigating = false;
      }, 100);
    } else {
      // Si está en el inicio, prevenir salida de la app
      // En PWA, esto mantiene al usuario dentro
      if (window.history.state && window.history.state.index === 0) {
        // Ya estamos en el inicio, no hacer nada
        return;
      }
      window.history.pushState({ index: 0 }, '', '#role-selection');
    }
  }

  /**
   * Restaura un estado del historial
   * @param {Object} state - Estado a restaurar
   */
  restoreState(state) {
    const { pageId, viewId, data } = state;
    
    // Ocultar todas las páginas
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.add('hidden');
    });
    
    // Ocultar selección de rol si no es la vista actual
    const roleSelection = document.getElementById('role-selection');
    if (viewId !== 'role-selection' && roleSelection) {
      roleSelection.classList.add('hidden');
    }
    
    // Mostrar la vista correspondiente
    if (viewId === 'role-selection') {
      if (roleSelection) {
        roleSelection.classList.remove('hidden');
      }
    } else {
      const page = document.getElementById(pageId);
      if (page) {
        page.classList.remove('hidden');
        AppState.currentPage = pageId;
        
        // Inicializar la página si es necesario
        this.initializePage(pageId);
      }
    }
    
    // Actualizar navegación inferior si existe
    if (AppState.bottomNav && pageId) {
      const navMap = {
        'adulto-mayor-home': 'home',
        'adulto-mayor-chat': 'chat',
        'adulto-mayor-album': 'album',
        'adulto-mayor-perfil': 'perfil',
        'universitario-home': 'home',
        'universitario-solicitudes': 'solicitudes',
        'universitario-rutas': 'rutas',
        'universitario-puntaje': 'puntaje',
        'universitario-perfil': 'perfil'
      };
      
      const navId = navMap[pageId];
      if (navId) {
        AppState.bottomNav.setActive(navId);
      }
    }
  }

  /**
   * Inicializa una página después de restaurar su estado
   * @param {string} pageId - ID de la página
   */
  initializePage(pageId) {
    // Esta función será llamada desde main.js para inicializar páginas específicas
    // Se puede extender según sea necesario
    if (typeof window.initializePageCallback === 'function') {
      window.initializePageCallback(pageId);
    }
  }

  /**
   * Obtiene el estado actual
   * @returns {Object} - Estado actual
   */
  getCurrentState() {
    return this.history[this.currentIndex] || null;
  }

  /**
   * Verifica si puede retroceder
   * @returns {boolean}
   */
  canGoBack() {
    return this.currentIndex > 0;
  }

  /**
   * Limpia el historial (útil para cerrar sesión)
   */
  clearHistory() {
    this.history = [];
    this.currentIndex = -1;
    this.pushState('role-selection', 'role-selection');
  }
}

// Exportar instancia global
window.NavigationManager = NavigationManager;
window.navigationManager = null;

