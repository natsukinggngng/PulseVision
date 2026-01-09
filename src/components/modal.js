/**
 * COMPONENTE: Sistema de Modales Internos
 * Reemplaza alert(), confirm() y prompt() del navegador
 * Integra el colibrí como elemento visual
 */

class Modal {
  constructor() {
    this.container = null;
    this.currentModal = null;
    this.init();
  }

  init() {
    // Crear contenedor de modal si no existe
    if (!document.getElementById('modal-container')) {
      const modalContainer = document.createElement('div');
      modalContainer.id = 'modal-container';
      modalContainer.className = 'modal-container hidden';
      modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-colibri">
            <img 
              src="assets/images/colibri-logo.png" 
              alt="Colibrí" 
              class="modal-colibri-image"
            />
          </div>
          <div class="modal-body">
            <h3 class="modal-title" id="modal-title"></h3>
            <p class="modal-message" id="modal-message"></p>
          </div>
          <div class="modal-actions" id="modal-actions"></div>
        </div>
      `;
      document.body.appendChild(modalContainer);
      this.container = modalContainer;
      
      // Cerrar al hacer clic en overlay
      this.container.querySelector('.modal-overlay').addEventListener('click', () => {
        this.close();
      });
    } else {
      this.container = document.getElementById('modal-container');
    }
  }

  /**
   * Muestra un modal de información (reemplaza alert)
   * @param {string} message - Mensaje a mostrar
   * @param {string} title - Título opcional
   * @returns {Promise} - Se resuelve cuando el usuario cierra el modal
   */
  showAlert(message, title = '') {
    return new Promise((resolve) => {
      this.show({
        title: title || 'Información',
        message: message,
        buttons: [
          {
            text: 'Entendido',
            action: () => {
              this.close();
              resolve(true);
            },
            primary: true
          }
        ]
      });
    });
  }

  /**
   * Muestra un modal de confirmación (reemplaza confirm)
   * @param {string} message - Mensaje a mostrar
   * @param {string} title - Título opcional
   * @returns {Promise<boolean>} - true si acepta, false si cancela
   */
  showConfirm(message, title = '') {
    return new Promise((resolve) => {
      this.show({
        title: title || 'Confirmar',
        message: message,
        buttons: [
          {
            text: 'Cancelar',
            action: () => {
              this.close();
              resolve(false);
            },
            primary: false
          },
          {
            text: 'Aceptar',
            action: () => {
              this.close();
              resolve(true);
            },
            primary: true
          }
        ]
      });
    });
  }

  /**
   * Muestra un modal personalizado
   * @param {Object} options - Opciones del modal
   * @param {string} options.title - Título del modal
   * @param {string} options.message - Mensaje del modal
   * @param {Array} options.buttons - Array de botones {text, action, primary}
   */
  show(options) {
    const { title, message, buttons = [] } = options;
    
    // Actualizar contenido
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    
    // Crear botones
    const actionsContainer = document.getElementById('modal-actions');
    actionsContainer.innerHTML = '';
    
    buttons.forEach((button, index) => {
      const btn = document.createElement('button');
      btn.className = `modal-btn ${button.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
      btn.textContent = button.text;
      btn.addEventListener('click', button.action);
      actionsContainer.appendChild(btn);
    });
    
    // Mostrar modal
    this.container.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Bloquear scroll
    
    // Animación de entrada
    setTimeout(() => {
      this.container.querySelector('.modal-content').classList.add('modal-show');
    }, 10);
    
    this.currentModal = { resolve: null };
  }

  /**
   * Cierra el modal actual
   */
  close() {
    const modalContent = this.container.querySelector('.modal-content');
    modalContent.classList.remove('modal-show');
    
    setTimeout(() => {
      this.container.classList.add('hidden');
      document.body.style.overflow = ''; // Restaurar scroll
    }, 300);
    
    this.currentModal = null;
  }
}

// Exportar instancia global
window.Modal = Modal;
window.modalInstance = null;


