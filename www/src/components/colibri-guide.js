/**
 * COMPONENTE: Colibrí Guía Emocional
 *
 * Este componente maneja la presencia del colibrí como acompañante visual
 * y guía pasiva en las diferentes pantallas de la aplicación.
 * El colibrí NO es un chatbot ni recibe entradas del usuario.
 */

class ColibriGuide {
  /**
   * Constructor del componente Colibrí
   * @param {HTMLElement} container - Contenedor donde se renderizará el colibrí
   */
  constructor(container) {
    this.container = container;
    this.currentState = 'calm';
    this.lastMessage = null; // Para evitar mensajes repetidos
    this.lastMessageTime = 0; // Para controlar frecuencia de mensajes
    this.minTimeBetweenMessages = 5000; // 5 segundos mínimo entre mensajes
    this.init();
  }

  /**
   * Inicializa el componente creando la estructura HTML
   */
  init() {
    this.container.innerHTML = `
      <div class="colibri-guide-container">
        <img
          src="assets/images/colibri-logo.png"
          alt="Colibrí guía"
          class="colibri-guide-image"
          id="colibri-guide-img"
        />
        <div class="colibri-message" id="colibri-message"></div>
      </div>
    `;

    this.imageElement = this.container.querySelector('.colibri-guide-image') || document.getElementById('colibri-guide-img');
    this.messageElement = this.container.querySelector('.colibri-message') || document.getElementById('colibri-message');

    // Configurar posición fija en esquina inferior derecha
    this.container.classList.add('colibri-corner-bottom');
  }

  /**
   * Verifica si el colibrí puede mostrarse en la página actual
   * No aparece en chats, mapas, listas largas ni panel docente
   */
  canShowInCurrentPage() {
    const currentPage = AppState?.currentPage || '';
    const restrictedPages = [
      'chat', 'adulto-mayor-chat', 'universitario-chat',
      'rutas', 'universitario-rutas',
      'historial', 'universitario-historial',
      'docente-panel', 'docente-registro',
      'admin-panel', 'agendar-acompanamiento'
    ];

    return !restrictedPages.some(page => currentPage.includes(page));
  }

  /**
   * Muestra un mensaje emocional según el estado
   * El colibrí aparece con animación suave, muestra mensaje y desaparece automáticamente
   * @param {string} state - Estado del colibrí
   * @param {string} customMessage - Mensaje personalizado opcional
   */
  showMessage(state, customMessage = null) {
    // Verificar si puede mostrarse en esta página
    if (!this.canShowInCurrentPage()) {
      return;
    }

    // Evitar mensajes repetidos muy seguidos
    const now = Date.now();
    if (state === this.lastMessage && (now - this.lastMessageTime) < this.minTimeBetweenMessages) {
      return;
    }

    const messages = {
      'welcome': {
        text: 'Bienvenido a PulseVision. Estamos aquí para acompañarte.',
        animation: 'calm'
      },
      'registration-success': {
        text: '¡Perfecto! Ya estás registrado y listo para comenzar.',
        animation: 'celebrating'
      },
      'help-sent': {
        text: 'Tu solicitud fue enviada. Pronto alguien se pondrá en contacto contigo.',
        animation: 'calm'
      },
      'accompaniment-accepted': {
        text: 'Has aceptado este acompañamiento. Ya puedes comunicarte a través del chat.',
        animation: 'celebrating'
      },
      'accompaniment-completed': {
        text: 'Gracias por tu dedicación. Has hecho una gran diferencia hoy.',
        animation: 'celebrating'
      },
      'album-empty': {
        text: 'Este álbum se compartirá cuando tengas un acompañante asignado.',
        animation: 'calm'
      },
      'week-active': {
        text: '¡Felicitaciones! Has completado una semana activa. Sigue así.',
        animation: 'celebrating'
      },
      'completed': {
        text: 'Excelente trabajo. Estás haciendo la diferencia en la vida de otros.',
        animation: 'celebrating'
      }
    };

    const messageData = customMessage
      ? { text: customMessage, animation: state || 'calm' }
      : messages[state];

    if (!messageData) return;

    // Actualizar estado y control de repetición
    this.currentState = messageData.animation;
    this.lastMessage = state;
    this.lastMessageTime = now;

    // Mostrar el contenedor del colibrí
    this.container.classList.remove('hidden');

    // Aplicar animación de entrada suave (fade + slide)
    this.imageElement.className = `colibri-guide-image colibri-fly-in colibri-${messageData.animation}`;

    // Mostrar mensaje con animación después de la entrada
    setTimeout(() => {
      this.messageElement.textContent = messageData.text;
      this.messageElement.classList.add('show');
    }, 600);

    // Ocultar mensaje y colibrí después de 3.5 segundos
    setTimeout(() => {
      this.messageElement.classList.remove('show');
      this.imageElement.classList.add('colibri-fade-out');

      // Ocultar completamente después de la animación de salida
      setTimeout(() => {
        this.container.classList.add('hidden');
        this.imageElement.className = 'colibri-guide-image';
        this.messageElement.textContent = '';
      }, 500);
    }, 3500); // 3.5 segundos totales (600ms entrada + 2900ms visible + 500ms salida)
  }

  /**
   * Oculta el mensaje del colibrí inmediatamente
   */
  hideMessage() {
    if (this.messageElement) {
      this.messageElement.classList.remove('show');
    }
    if (this.imageElement) {
      this.imageElement.classList.add('colibri-fade-out');
      setTimeout(() => {
        this.container.classList.add('hidden');
        this.imageElement.className = 'colibri-guide-image';
      }, 500);
    }
  }
}

// Hacer disponible globalmente para uso en main.js
window.ColibriGuide = ColibriGuide;
