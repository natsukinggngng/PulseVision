/**
 * SISTEMA DE ÍCONOS VECTORIALES
 * 
 * Íconos SVG lineales y profesionales estilo Uber/apps reales
 * Reemplazo de emojis por íconos vectoriales accesibles
 */

const Icons = {
  /**
   * Genera un ícono SVG con atributos de accesibilidad
   */
  createIcon: function(path, viewBox = "0 0 24 24", className = "icon") {
    return `<svg class="${className}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${path}
    </svg>`;
  },

  // Navegación
  home: function(className = "icon") {
    return this.createIcon(
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
      "0 0 24 24",
      className
    );
  },

  chat: function(className = "icon") {
    return this.createIcon(
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
      "0 0 24 24",
      className
    );
  },

  album: function(className = "icon") {
    return this.createIcon(
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
      "0 0 24 24",
      className
    );
  },

  profile: function(className = "icon") {
    return this.createIcon(
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
      "0 0 24 24",
      className
    );
  },

  // Tipos de ayuda
  company: function(className = "icon") {
    return this.createIcon(
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      "0 0 24 24",
      className
    );
  },

  medicine: function(className = "icon") {
    return this.createIcon(
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="12" y1="9" x2="12" y2="15"></line>',
      "0 0 24 24",
      className
    );
  },

  shopping: function(className = "icon") {
    return this.createIcon(
      '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
      "0 0 24 24",
      className
    );
  },

  hospital: function(className = "icon") {
    return this.createIcon(
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline><line x1="12" y1="8" x2="12" y2="12"></line><line x1="10" y1="10" x2="14" y2="10"></line>',
      "0 0 24 24",
      className
    );
  },

  technology: function(className = "icon") {
    return this.createIcon(
      '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',
      "0 0 24 24",
      className
    );
  },

  help: function(className = "icon") {
    return this.createIcon(
      '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>',
      "0 0 24 24",
      className
    );
  },

  // Acciones
  add: function(className = "icon") {
    return this.createIcon(
      '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',
      "0 0 24 24",
      className
    );
  },

  edit: function(className = "icon") {
    return this.createIcon(
      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>',
      "0 0 24 24",
      className
    );
  },

  refresh: function(className = "icon") {
    return this.createIcon(
      '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
      "0 0 24 24",
      className
    );
  },

  close: function(className = "icon") {
    return this.createIcon(
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
      "0 0 24 24",
      className
    );
  },

  check: function(className = "icon") {
    return this.createIcon(
      '<polyline points="20 6 9 17 4 12"></polyline>',
      "0 0 24 24",
      className
    );
  },

  // Universitario
  requests: function(className = "icon") {
    return this.createIcon(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
      "0 0 24 24",
      className
    );
  },

  routes: function(className = "icon") {
    return this.createIcon(
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
      "0 0 24 24",
      className
    );
  },

  score: function(className = "icon") {
    return this.createIcon(
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
      "0 0 24 24",
      className
    );
  },

  // Docente
  users: function(className = "icon") {
    return this.createIcon(
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      "0 0 24 24",
      className
    );
  },

  handshake: function(className = "icon") {
    return this.createIcon(
      '<path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14"></path><path d="M7 18h1a2 2 0 0 0 2-2v-5"></path><path d="M14 12h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3"></path><path d="M7 8h.01"></path><path d="M7 12h.01"></path>',
      "0 0 24 24",
      className
    );
  },

  star: function(className = "icon") {
    return this.createIcon(
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
      "0 0 24 24",
      className
    );
  }
};

// Hacer disponible globalmente
window.Icons = Icons;







