import { auth, db } from './src/firebase.js';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
/**
 * PULSEVISION - Lógica principal de la aplicación
 * Maneja la transición del splash screen, selección de roles y navegación
 */

// Estado global de la aplicación
const AppState = {
  currentRole: null,
  currentPage: null,
  userData: null,
  colibriGuide: null,
  bottomNav: null,
  voluntarioSeleccionado: null, // Voluntario seleccionado para solicitud
  tipoAyudaSeleccionado: null   // Tipo de ayuda seleccionado
};

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('Service Worker registrado exitosamente:', registration.scope);
      })
      .catch((error) => {
        console.log('Error al registrar Service Worker:', error);
      });
  });
}

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
  // Referencias a los elementos principales
  const splashScreen = document.getElementById('splash-screen');
  const roleSelection = document.getElementById('role-selection');
  
  /**
   * Transición automática del splash screen a la selección de rol
   * Duración: 2.5 segundos (dentro del rango de 2-3 segundos especificado)
   */
  setTimeout(function() {
    // Fade out del splash screen
    splashScreen.style.opacity = '0';
    splashScreen.style.transition = 'opacity 0.5s ease-out';
    
      // Después de la animación de fade out, ocultar y mostrar la selección de rol
    setTimeout(function() {
      splashScreen.classList.add('hidden');
      roleSelection.classList.remove('hidden');
      
      // Mostrar mensaje de bienvenida del colibrí en la pantalla inicial
      const colibriWrapper = document.getElementById('colibri-guide-wrapper');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        const colibriGuide = new ColibriGuide(colibriWrapper);
        colibriGuide.showMessage('welcome');
      }
    }, 500); // Esperar a que termine la animación de fade out
  }, 2500); // 2.5 segundos de visualización del splash
  
  /**
   * Manejo de la selección de rol
   * Cada botón tiene un atributo data-role que identifica el tipo de usuario
   */
  const roleButtons = document.querySelectorAll('.role-btn');
  
  roleButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const selectedRole = this.getAttribute('data-role');
      handleRoleSelection(selectedRole);
    });
  });
  
  /**
   * Función para manejar la selección de rol
   * @param {string} role - El rol seleccionado
   */
  function handleRoleSelection(role) {
    AppState.currentRole = role;
    
    // Ocultar selección de rol
    roleSelection.classList.add('hidden');
    
    // Navegar según el rol seleccionado
    switch(role) {
      case 'adulto-mayor':
        initAdultoMayorFlow();
        break;
      case 'universitario':
        initUniversitarioFlow();
        break;
      case 'docente':
        // Verificar si el docente ya está registrado
        const docenteData = localStorage.getItem('docenteData');
        if (docenteData) {
          initDocenteFlow();
        } else {
          // Mostrar registro del docente
          showPage('docente-registro');
          initDocenteRegistro();
        }
        break;
    }
  }

  /**
   * Inicializa el flujo del Adulto Mayor
   */
  function initAdultoMayorFlow() {
    // Verificar si el usuario ya está registrado
    const userData = localStorage.getItem('adultoMayorData');
    
    if (userData) {
      // Usuario ya registrado, ir al home
      AppState.userData = JSON.parse(userData);
      showPage('adulto-mayor-home');
      initAdultoMayorHome();
    } else {
      // Usuario no registrado, mostrar formulario de registro
      showPage('adulto-mayor-registro');
      initAdultoMayorRegistro();
    }
  }

  /**
   * Inicializa la pantalla de registro del adulto mayor
   */
  function initAdultoMayorRegistro() {
    const registroForm = document.getElementById('registro-form');
    
    registroForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Obtener datos del formulario
      const formData = new FormData(registroForm);
      const nombre = formData.get('nombre') || document.getElementById('nombre').value;
      const edad = formData.get('edad') || document.getElementById('edad').value;
      const telefono = formData.get('telefono') || document.getElementById('telefono').value;
      const zona = formData.get('zona') || document.getElementById('zona').value;
      const necesidades = formData.getAll('necesidades');
      
      // Validaciones
      if (!validateRegistroForm(nombre, edad, telefono, zona, necesidades)) {
        return;
      }
      
      // Guardar datos del usuario
      const userData = {
        nombre: nombre.trim(),
        edad: parseInt(edad),
        telefono: telefono.trim(),
        zona: zona,
        necesidades: necesidades,
        fechaRegistro: new Date().toISOString()
      };
      
      AppState.userData = userData;
      localStorage.setItem('adultoMayorData', JSON.stringify(userData));
      
      // Mostrar colibrí de confirmación de registro (momento emocional)
      const colibriWrapper = document.getElementById('colibri-guide-wrapper');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        const colibriGuide = new ColibriGuide(colibriWrapper);
        colibriGuide.showMessage('registration-success');
      }
      
      // Navegar al home después de mostrar el mensaje
      setTimeout(() => {
        showPage('adulto-mayor-home');
        initAdultoMayorHome();
      }, 4500);
    });
  }

  /**
   * Valida el formulario de registro
   */
  function validateRegistroForm(nombre, edad, telefono, zona, necesidades) {
    let isValid = true;
    
    // Limpiar errores previos
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    
    // Validar nombre
    if (!nombre || nombre.trim().length < 2) {
      document.getElementById('error-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    // Validar edad
    const edadNum = parseInt(edad);
    if (!edad || isNaN(edadNum) || edadNum < 60 || edadNum > 120) {
      document.getElementById('error-edad').textContent = 'La edad debe estar entre 60 y 120 años';
      isValid = false;
    }
    
    // Validar teléfono
    if (!telefono || telefono.trim().length < 8) {
      document.getElementById('error-telefono').textContent = 'Ingresa un teléfono válido';
      isValid = false;
    }
    
    // Validar zona
    if (!zona) {
      document.getElementById('error-zona').textContent = 'Selecciona una zona';
      isValid = false;
    }
    
    // Validar necesidades
    if (!necesidades || necesidades.length === 0) {
      document.getElementById('error-necesidades').textContent = 'Selecciona al menos una necesidad';
      isValid = false;
    }
    
    return isValid;
  }

  /**
   * Inicializa la pantalla principal (Home) del adulto mayor
   */
  function initAdultoMayorHome() {
    // Inicializar colibrí guía emocional (oculto por defecto, aparece solo en momentos emocionales)
    const colibriWrapper = document.getElementById('colibri-guide-wrapper');
    if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
      AppState.colibriGuide = new ColibriGuide(colibriWrapper);
      // El colibrí está oculto por defecto, aparecerá solo cuando se necesite
    }
    
    // Inicializar barra de navegación inferior
    initBottomNavigation('bottom-nav-container', 'home');
    
    // Botón principal de ayuda - actualizar estado inicial
    actualizarEstadoBotonConfirmar();
    
    // Botón principal de ayuda
    const pedirAyudaBtn = document.getElementById('pedir-ayuda-btn');
    if (pedirAyudaBtn) {
      // Remover listeners previos
      const newBtn = pedirAyudaBtn.cloneNode(true);
      pedirAyudaBtn.parentNode.replaceChild(newBtn, pedirAyudaBtn);
      
      document.getElementById('pedir-ayuda-btn').addEventListener('click', function() {
        handlePedirAyuda();
      });
    }
    
    // Botones de tipos de ayuda - mostrar voluntarios disponibles
    document.querySelectorAll('.help-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const tipoAyuda = this.getAttribute('data-help');
        mostrarVoluntariosDisponibles(tipoAyuda);
      });
    });
    
    // Cargar solicitudes activas
    loadSolicitudesActivas();
  }

  /**
   * Inicializa la barra de navegación inferior
   */
  function initBottomNavigation(containerId, activePage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const navItems = [
      { id: 'home', label: 'Inicio', icon: '' },
      { id: 'chat', label: 'Chat', icon: '' },
      { id: 'album', label: 'Álbum', icon: '' },
      { id: 'perfil', label: 'Perfil', icon: '' }
    ];
    
    if (typeof BottomNavigation !== 'undefined') {
      AppState.bottomNav = new BottomNavigation(container, navItems, function(navId) {
        navigateToPage(navId);
      });
      
      // Establecer página activa
      if (activePage) {
        AppState.bottomNav.setActive(activePage);
      }
    }
  }

  /**
   * Navega a una página específica
   */
  function navigateToPage(pageId) {
    const pageMap = {
      'home': 'adulto-mayor-home',
      'chat': 'adulto-mayor-chat',
      'album': 'adulto-mayor-album',
      'perfil': 'adulto-mayor-perfil'
    };
    
    const pageName = pageMap[pageId] || pageId;
    showPage(pageName);
    
    // Inicializar la página correspondiente
    switch(pageId) {
      case 'home':
        initAdultoMayorHome();
        break;
      case 'chat':
        initAdultoMayorChat();
        break;
      case 'album':
        initAdultoMayorAlbum();
        break;
      case 'perfil':
        initAdultoMayorPerfil();
        break;
    }
  }

  /**
   * Muestra una página específica y oculta las demás
   */
  function showPage(pageId) {
    // Ocultar todas las páginas
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.add('hidden');
    });
    
    // Mostrar la página solicitada
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.remove('hidden');
      AppState.currentPage = pageId;
    }
  }

  /**
   * Actualiza el estado del botón "Confirmar solicitud"
   * Se deshabilita hasta que se seleccione tipo de ayuda y voluntario
   */
  function actualizarEstadoBotonConfirmar() {
    const pedirAyudaBtn = document.getElementById('pedir-ayuda-btn');
    if (!pedirAyudaBtn) return;
    
    const tieneSeleccion = AppState.voluntarioSeleccionado && AppState.tipoAyudaSeleccionado;
    
    if (tieneSeleccion) {
      pedirAyudaBtn.disabled = false;
      pedirAyudaBtn.classList.remove('btn-disabled');
    } else {
      pedirAyudaBtn.disabled = true;
      pedirAyudaBtn.classList.add('btn-disabled');
    }
  }

  /**
   * Maneja la acción de confirmar solicitud
   * Crea la solicitud con el voluntario seleccionado y la hace visible a universitarios
   */
  function handlePedirAyuda() {
    // Prevenir múltiples clics
    const pedirAyudaBtn = document.getElementById('pedir-ayuda-btn');
    if (pedirAyudaBtn && pedirAyudaBtn.disabled) return;
    
    // Verificar que se haya seleccionado un voluntario
    if (!AppState.voluntarioSeleccionado || !AppState.tipoAyudaSeleccionado) {
      alert('Por favor, selecciona primero un tipo de ayuda y un voluntario.');
      return;
    }
    
    // Deshabilitar botón inmediatamente para evitar doble envío
    if (pedirAyudaBtn) {
      pedirAyudaBtn.disabled = true;
      pedirAyudaBtn.classList.add('btn-disabled');
    }
    
    // Obtener datos del adulto mayor
    const adultoMayor = AppState.userData;
    if (!adultoMayor) {
      alert('Error: No se encontraron tus datos. Por favor, regístrate nuevamente.');
      if (pedirAyudaBtn) {
        pedirAyudaBtn.disabled = false;
        pedirAyudaBtn.classList.remove('btn-disabled');
      }
      return;
    }
    
    // Crear nueva solicitud con información completa
    const solicitud = {
      id: Date.now(),
      tipo: AppState.tipoAyudaSeleccionado,
      tipoLabel: {
        'compania': 'Compañía',
        'medicamentos': 'Medicamentos',
        'compras': 'Compras',
        'citas': 'Citas médicas',
        'tecnologia': 'Tecnología',
        'otras': 'Otras necesidades'
      }[AppState.tipoAyudaSeleccionado] || 'General',
      fecha: new Date().toISOString(),
      estado: 'pendiente',
      adultoMayorId: adultoMayor.nombre,
      adultoMayorZona: adultoMayor.zona,
      voluntarioSeleccionado: AppState.voluntarioSeleccionado,
      necesidades: adultoMayor.necesidades || []
    };
    
    // Guardar solicitud en localStorage (visible para universitarios)
    const solicitudes = getSolicitudesActivas();
    solicitudes.push(solicitud);
    localStorage.setItem('adultoMayorSolicitudes', JSON.stringify(solicitudes));
    
    // También guardar en una lista global de solicitudes disponibles para universitarios
    const solicitudesDisponibles = JSON.parse(localStorage.getItem('solicitudesDisponibles') || '[]');
    solicitudesDisponibles.push(solicitud);
    localStorage.setItem('solicitudesDisponibles', JSON.stringify(solicitudesDisponibles));
    
    // Mostrar mensaje del colibrí
    if (AppState.colibriGuide) {
      AppState.colibriGuide.showMessage('help-sent');
    }
    
    // Si no hay colibrí inicializado, crear uno nuevo
    if (!AppState.colibriGuide) {
      const colibriWrapper = document.getElementById('colibri-guide-wrapper');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        AppState.colibriGuide = new ColibriGuide(colibriWrapper);
        AppState.colibriGuide.showMessage('help-sent');
      }
    }
    
    // Limpiar selección temporal
    AppState.voluntarioSeleccionado = null;
    AppState.tipoAyudaSeleccionado = null;
    
    // Cerrar pantalla de voluntarios si está abierta
    const voluntariosPage = document.getElementById('voluntarios-disponibles');
    if (voluntariosPage && !voluntariosPage.classList.contains('hidden')) {
      showPage('adulto-mayor-home');
    }
    
    // Recargar solicitudes
    loadSolicitudesActivas();
    
    // Actualizar estado del botón
    actualizarEstadoBotonConfirmar();
    
    // Mostrar UN SOLO mensaje claro y empático
    alert('Tu solicitud ya fue enviada.\nEn breve alguien se pondrá en contacto contigo.');
    
    // Rehabilitar botón después de un breve delay
    setTimeout(() => {
      if (pedirAyudaBtn) {
        pedirAyudaBtn.disabled = false;
        pedirAyudaBtn.classList.remove('btn-disabled');
      }
    }, 1000);
  }

  /**
   * Muestra la pantalla de voluntarios disponibles filtrados por tipo de ayuda
   * @param {string} tipoAyuda - Tipo de ayuda seleccionado
   */
  function mostrarVoluntariosDisponibles(tipoAyuda) {
    // Ocultar home y mostrar pantalla de voluntarios
    showPage('voluntarios-disponibles');
    
    // Mapeo de tipos de ayuda a etiquetas
    const tiposLabels = {
      'compania': 'Compañía',
      'medicamentos': 'Medicamentos',
      'compras': 'Compras',
      'citas': 'Citas médicas',
      'tecnologia': 'Tecnología',
      'otras': 'Otras necesidades'
    };
    
    // Actualizar título
    document.getElementById('voluntarios-titulo').textContent = 'Personas disponibles para acompañarte';
    document.getElementById('voluntarios-subtitulo').textContent = 'Elige con quién te sientas más cómodo o cómoda';
    
    // Botón volver (remover listeners previos)
    const volverBtn = document.getElementById('volver-ayuda-btn');
    const newVolverBtn = volverBtn.cloneNode(true);
    volverBtn.parentNode.replaceChild(newVolverBtn, volverBtn);
    newVolverBtn.addEventListener('click', function() {
      showPage('adulto-mayor-home');
      initAdultoMayorHome();
    });
    
    // Cargar y filtrar voluntarios
    cargarVoluntariosFiltrados(tipoAyuda);
  }

  /**
   * Carga voluntarios filtrados por tipo de ayuda
   * @param {string} tipoAyuda - Tipo de ayuda
   */
  function cargarVoluntariosFiltrados(tipoAyuda) {
    // Obtener todos los universitarios registrados
    const universitarios = getAllUniversitarios();
    const container = document.getElementById('voluntarios-list');
    
    if (!container) return;
    
    // Filtrar por habilidades relacionadas
    const voluntariosFiltrados = universitarios.filter(uni => {
      // Mapeo de tipo de ayuda a habilidades
      const mapeoHabilidades = {
        'compania': ['compania'],
        'medicamentos': ['medicamentos'],
        'compras': ['compras'],
        'citas': ['citas'],
        'tecnologia': ['tecnologia'],
        'otras': ['movilidad', 'otras']
      };
      
      const habilidadesRequeridas = mapeoHabilidades[tipoAyuda] || [];
      return uni.habilidades && uni.habilidades.some(h => habilidadesRequeridas.includes(h));
    });
    
    if (voluntariosFiltrados.length === 0) {
      container.innerHTML = `
        <div class="voluntarios-empty">
          <p>Por ahora no hay personas disponibles para este tipo de ayuda.</p>
          <p class="voluntarios-empty-hint">Puedes intentar con otra opción o volver más tarde.</p>
        </div>
      `;
    } else {
      container.innerHTML = voluntariosFiltrados.map(vol => `
        <div class="voluntario-card">
          <div class="voluntario-header">
            <div class="voluntario-nombre">${vol.nombre}</div>
            <div class="voluntario-calificacion">
              ${(vol.calificacionPromedio || 0).toFixed(1)} 
              <svg class="icon icon-inline" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
          </div>
          <div class="voluntario-info">
            <p><strong>Universidad:</strong> ${vol.universidad}</p>
            <p><strong>Carrera:</strong> ${vol.carrera}</p>
            <p><strong>Zona:</strong> ${vol.zona}</p>
            <p><strong>Acompañamientos:</strong> ${vol.acompanamientos || 0}</p>
          </div>
          <button class="btn-primary btn-seleccionar-voluntario" data-voluntario-id="${vol.nombre}" data-tipo-ayuda="${tipoAyuda}">
            Seleccionar este voluntario
          </button>
        </div>
      `).join('');
      
      // Event listeners para seleccionar voluntario
      container.querySelectorAll('.btn-seleccionar-voluntario').forEach(btn => {
        btn.addEventListener('click', function() {
          const voluntarioId = this.getAttribute('data-voluntario-id');
          const tipoAyuda = this.getAttribute('data-tipo-ayuda');
          seleccionarVoluntario(voluntarioId, tipoAyuda);
        });
      });
    }
  }

  /**
   * Obtiene todos los universitarios registrados
   */
  function getAllUniversitarios() {
    const universitarioData = localStorage.getItem('universitarioData');
    if (universitarioData) {
      return [JSON.parse(universitarioData)];
    }
    return [];
  }

  /**
   * Selecciona un voluntario y guarda la selección para confirmar después
   */
  function seleccionarVoluntario(voluntarioId, tipoAyuda) {
    // Guardar selección temporalmente en AppState
    AppState.voluntarioSeleccionado = voluntarioId;
    AppState.tipoAyudaSeleccionado = tipoAyuda;
    
    // Mostrar mensaje de confirmación
    alert('Has elegido a esta persona para acompañarte.\nCuando estés listo, puedes enviar la solicitud.');
    
    // Volver al home
    showPage('adulto-mayor-home');
    initAdultoMayorHome();
    
    // Actualizar estado del botón
    actualizarEstadoBotonConfirmar();
  }

  /**
   * Obtiene las solicitudes activas del localStorage
   */
  function getSolicitudesActivas() {
    const solicitudes = localStorage.getItem('adultoMayorSolicitudes');
    return solicitudes ? JSON.parse(solicitudes) : [];
  }

  /**
   * Carga y muestra las solicitudes activas
   * Solo muestra últimas 5, solo activas/pendientes
   */
  function loadSolicitudesActivas() {
    const todasSolicitudes = getSolicitudesActivas();
    const container = document.getElementById('solicitudes-activas');
    const list = document.getElementById('solicitudes-list');
    
    if (!container || !list) return;
    
    // Filtrar solo activas y pendientes
    const solicitudesFiltradas = todasSolicitudes.filter(sol => 
      sol.estado === 'activo' || sol.estado === 'pendiente'
    );
    
    // Ordenar por fecha (más recientes primero) y tomar solo últimas 5
    const solicitudesOrdenadas = solicitudesFiltradas
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 5);
    
    if (solicitudesOrdenadas.length > 0) {
      container.classList.remove('hidden');
      
      const tipoLabels = {
        'compania': 'Compañía',
        'medicamentos': 'Medicamentos',
        'compras': 'Compras',
        'citas': 'Citas médicas',
        'tecnologia': 'Tecnología',
        'otras': 'Otras necesidades'
      };
      
      list.innerHTML = solicitudesOrdenadas.map(sol => {
        const tipoLabel = sol.tipoLabel || tipoLabels[sol.tipo] || sol.tipo;
        const estadoLabel = sol.estado === 'pendiente' ? 'Pendiente' : 'Activa';
        const fechaFormateada = new Date(sol.fecha).toLocaleDateString('es-ES', { 
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        
        return `
          <div class="solicitud-card">
            <p class="solicitud-info-line"><strong>Solicitud:</strong> ${tipoLabel}</p>
            <p class="solicitud-info-line"><strong>Estado:</strong> ${estadoLabel}</p>
            <p class="solicitud-info-line"><strong>Fecha:</strong> ${fechaFormateada}</p>
          </div>
        `;
      }).join('');
    } else {
      container.classList.add('hidden');
    }
  }

  /**
   * Inicializa la pantalla de Chat del Adulto Mayor
   * Chat sincronizado usando localStorage compartido
   */
  function initAdultoMayorChat() {
    initBottomNavigation('bottom-nav-container-chat', 'chat');
    
    // Verificar si hay voluntario asignado
    const voluntario = localStorage.getItem('adultoMayorVoluntario');
    
    if (!voluntario) {
      // No hay voluntario, mostrar estado vacío
      document.getElementById('chat-messages').innerHTML = `
        <div class="chat-empty-state">
          <p>Aún no hay mensajes.</p>
          <p class="chat-empty-hint">Puedes iniciar la conversación cuando quieras.</p>
        </div>
      `;
      return;
    }
    
    // Verificar si hay desvinculación reciente
    const desvinculacion = JSON.parse(localStorage.getItem('acompanamientoDesvinculado') || 'null');
    if (desvinculacion && desvinculacion.adultoMayor === AppState.userData?.nombre) {
      // Si este adulto mayor desvinculó, limpiar estado
      localStorage.removeItem('adultoMayorVoluntario');
      document.getElementById('chat-messages').innerHTML = `
        <div class="chat-empty-state">
          <p>El acompañamiento ha sido finalizado</p>
          <p class="chat-empty-hint">Ya no puedes chatear con este voluntario</p>
        </div>
      `;
      document.getElementById('chat-input-container').classList.add('hidden');
      
      // Limpiar chat compartido si existe
      const voluntarioData = JSON.parse(voluntario);
      const chatId = `chat_${AppState.userData.nombre}_${voluntarioData.nombre}`;
      localStorage.removeItem(chatId);
      
      // Limpiar desvinculación
      localStorage.removeItem('acompanamientoDesvinculado');
      return;
    }
    
    const voluntarioData = JSON.parse(voluntario);
    const infoContainer = document.getElementById('chat-voluntario-info');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <p><strong>Tu acompañante:</strong> ${voluntarioData.nombre}</p>
        <p><strong>Universidad:</strong> ${voluntarioData.universidad}</p>
      `;
    }
    
    // Guardar ID de conversación compartida
    AppState.chatId = `chat_${AppState.userData.nombre}_${voluntarioData.nombre}`;
    
    // Mostrar input de chat
    document.getElementById('chat-input-container').classList.remove('hidden');
    
    // Cargar mensajes sincronizados
    loadChatMessages();
    
    // Marcar mensajes como vistos
    marcarMensajesComoVistos();
    
    // Event listener para enviar mensaje
    const sendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    
    if (sendBtn && chatInput) {
      // Remover listeners previos
      const newSendBtn = sendBtn.cloneNode(true);
      sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
      const newChatInput = chatInput.cloneNode(true);
      chatInput.parentNode.replaceChild(newChatInput, chatInput);
      
      document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
      document.getElementById('chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          sendChatMessage();
        }
      });
    }
    
    // Polling para actualizar mensajes (simulación de sincronización en tiempo real)
    if (AppState.chatInterval) clearInterval(AppState.chatInterval);
    AppState.chatInterval = setInterval(() => {
      loadChatMessages();
      marcarMensajesComoVistos();
    }, 2000);
  }

  /**
   * Envía un mensaje de chat (sincronizado)
   */
  function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (!message || !AppState.chatId) return;
    
    // Obtener mensajes existentes del localStorage compartido
    const messages = JSON.parse(localStorage.getItem(AppState.chatId) || '[]');
    
    // Agregar nuevo mensaje
    const nuevoMensaje = {
      id: Date.now(),
      text: message,
      sender: 'adulto-mayor',
      timestamp: new Date().toISOString(),
      estado: 'enviado',
      visto: false
    };
    
    messages.push(nuevoMensaje);
    localStorage.setItem(AppState.chatId, JSON.stringify(messages));
    
    // Limpiar input
    chatInput.value = '';
    
    // Recargar mensajes para mostrar el nuevo
    loadChatMessages();
    
    // Scroll al final
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Carga los mensajes del chat sincronizados desde localStorage compartido
   */
  function loadChatMessages() {
    if (!AppState.chatId) return;
    
    const messages = JSON.parse(localStorage.getItem(AppState.chatId) || '[]');
    const container = document.getElementById('chat-messages');
    
    if (!container) return;
    
    if (messages.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <p>Aún no hay mensajes.</p>
          <p class="chat-empty-hint">Puedes iniciar la conversación cuando quieras.</p>
        </div>
      `;
      return;
    }
    
    // Mostrar mensajes con burbujas, visto pequeño y hora clara
    container.innerHTML = messages.map(msg => {
      const esEnviado = msg.sender === 'adulto-mayor';
      const vistoIcon = esEnviado && msg.visto 
        ? '<svg class="icon icon-visto-small" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : esEnviado 
        ? '<svg class="icon icon-enviado-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '';
      
      const hora = new Date(msg.timestamp).toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      return `
        <div class="chat-message-wrapper ${esEnviado ? 'sent-wrapper' : 'received-wrapper'}">
          <div class="chat-message ${esEnviado ? 'sent' : 'received'}">
            <div class="message-text">${msg.text}</div>
            <div class="message-footer">
              <span class="message-time">${hora}</span>
              ${vistoIcon}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Scroll al final
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Marca los mensajes como vistos cuando el usuario abre el chat
   */
  function marcarMensajesComoVistos() {
    if (!AppState.chatId) return;
    
    const messages = JSON.parse(localStorage.getItem(AppState.chatId) || '[]');
    const currentUser = AppState.currentRole === 'adulto-mayor' ? 'adulto-mayor' : 'universitario';
    
    // Marcar mensajes del otro usuario como vistos
    let actualizado = false;
    const mensajesActualizados = messages.map(msg => {
      if (msg.sender !== currentUser && !msg.visto) {
        actualizado = true;
        return { ...msg, visto: true };
      }
      return msg;
    });
    
    if (actualizado) {
      localStorage.setItem(AppState.chatId, JSON.stringify(mensajesActualizados));
      loadChatMessages(); // Recargar para mostrar el cambio
    }
  }

  /**
   * Inicializa la pantalla de Álbum
   */
  function initAdultoMayorAlbum() {
    initBottomNavigation('bottom-nav-container-album', 'album');
    
    // Cargar fotos existentes
    loadAlbumPhotos();
    
    const addPhotoBtn = document.getElementById('add-photo-btn');
    const photoInput = document.getElementById('photo-input');
    
    if (addPhotoBtn && photoInput) {
      // Remover listeners previos clonando elementos
      const newAddPhotoBtn = addPhotoBtn.cloneNode(true);
      addPhotoBtn.parentNode.replaceChild(newAddPhotoBtn, addPhotoBtn);
      
      const newPhotoInput = photoInput.cloneNode(true);
      photoInput.parentNode.replaceChild(newPhotoInput, photoInput);
      
      // Agregar listener al botón para abrir selector
      document.getElementById('add-photo-btn').addEventListener('click', () => {
        document.getElementById('photo-input').click();
      });
      
      // Agregar listener al input para procesar archivos seleccionados
      document.getElementById('photo-input').addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
          if (file.type.startsWith('image/')) {
            addPhotoToAlbum(file);
          }
        });
        // Limpiar input para permitir seleccionar el mismo archivo nuevamente
        this.value = '';
      });
    }
    
    // Escuchar eventos de actualización del álbum para sincronización
    window.addEventListener('albumUpdated', function() {
      loadAlbumPhotos();
    });
    
    // Polling para sincronización automática (cada 2 segundos)
    if (AppState.albumInterval) clearInterval(AppState.albumInterval);
    AppState.albumInterval = setInterval(() => {
      if (AppState.currentPage === 'adulto-mayor-album') {
        loadAlbumPhotos();
      }
    }, 2000);
  }

  /**
   * Agrega una foto al álbum compartido
   */
  function addPhotoToAlbum(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const photoData = {
        id: Date.now(),
        url: e.target.result,
        fecha: new Date().toISOString()
      };
      
      // Guardar foto en localStorage con clave única albumRecuerdos
      const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
      photos.push(photoData);
      localStorage.setItem('albumRecuerdos', JSON.stringify(photos));
      
      // Recargar álbum inmediatamente
      loadAlbumPhotos();
      
      // Disparar evento de actualización para sincronización
      window.dispatchEvent(new CustomEvent('albumUpdated'));
    };
    
    reader.readAsDataURL(file);
  }

  /**
   * Carga las fotos del álbum compartido
   */
  function loadAlbumPhotos() {
    const grid = document.getElementById('album-grid');
    if (!grid) return;
    
    // Obtener fotos de localStorage con clave única albumRecuerdos
    const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
    
    if (photos.length === 0) {
      grid.innerHTML = `
        <div class="album-empty-state">
          <p>Aún no hay recuerdos aquí.</p>
          <p class="album-empty-hint">Cuando compartas una foto, aparecerá en este espacio.</p>
        </div>
      `;
      
      // Mostrar mensaje del colibrí solo si NO hay voluntario asignado (para adulto mayor)
      const voluntario = localStorage.getItem('adultoMayorVoluntario');
      if (!voluntario && AppState.currentPage === 'adulto-mayor-album') {
        const colibriWrapper = document.getElementById('colibri-guide-wrapper');
        if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
          if (!AppState.colibriGuide) {
            AppState.colibriGuide = new ColibriGuide(colibriWrapper);
          }
          AppState.colibriGuide.showMessage('album-empty');
        }
      }
    } else {
      grid.innerHTML = photos.map(photo => `
        <div class="album-photo-container">
          <img src="${photo.url}" alt="Foto del álbum" class="album-photo" />
          <button class="btn-eliminar-foto" data-photo-id="${photo.id}" aria-label="Eliminar foto">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `).join('');
      
      // Event listeners para eliminar fotos
      grid.querySelectorAll('.btn-eliminar-foto').forEach(btn => {
        btn.addEventListener('click', function() {
          const photoId = parseInt(this.getAttribute('data-photo-id'));
          eliminarFotoAlbum(photoId);
        });
      });
    }
  }

  /**
   * Elimina una foto del álbum compartido
   */
  function eliminarFotoAlbum(photoId) {
    if (!confirm('¿Estás seguro que quieres eliminar esta foto?')) {
      return;
    }
    
    const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
    const photosActualizadas = photos.filter(p => p.id !== photoId);
    localStorage.setItem('albumRecuerdos', JSON.stringify(photosActualizadas));
    
    // Recargar álbum inmediatamente
    loadAlbumPhotos();
    
    // Disparar evento de actualización para sincronización
    window.dispatchEvent(new CustomEvent('albumUpdated'));
  }

  /**
   * Inicializa la pantalla de Perfil
   */
  function initAdultoMayorPerfil() {
    initBottomNavigation('bottom-nav-container-perfil', 'perfil');
    
    // Cargar datos del perfil
    loadPerfilData();
    
    // Event listeners
    document.getElementById('editar-perfil-btn')?.addEventListener('click', editarPerfil);
    document.getElementById('cambiar-acompanante-btn')?.addEventListener('click', cambiarAcompanante);
    document.getElementById('anular-acompanante-btn')?.addEventListener('click', anularAcompanante);
    document.getElementById('enviar-calificacion-btn')?.addEventListener('click', enviarCalificacion);
    document.getElementById('cerrar-sesion-btn')?.addEventListener('click', cerrarSesion);
    
    // Estrellas de calificación
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const rating = parseInt(this.getAttribute('data-rating'));
        selectRating(rating);
      });
    });
  }

  /**
   * Carga los datos del perfil
   */
  function loadPerfilData() {
    if (!AppState.userData) return;
    
    document.getElementById('perfil-nombre').textContent = AppState.userData.nombre;
    document.getElementById('perfil-edad').textContent = AppState.userData.edad + ' años';
    document.getElementById('perfil-zona').textContent = AppState.userData.zona;
    document.getElementById('perfil-telefono').textContent = AppState.userData.telefono;
    
    // Verificar si hay acompañante
    const voluntario = localStorage.getItem('adultoMayorVoluntario');
    const acompananteSection = document.getElementById('acompanante-section');
    
    if (voluntario) {
      const voluntarioData = JSON.parse(voluntario);
      const acompananteInfo = document.getElementById('acompanante-info');
      const acompananteActions = document.getElementById('acompanante-actions');
      
      // Mostrar sección de acompañante
      if (acompananteSection) {
        acompananteSection.classList.remove('hidden');
      }
      
      if (acompananteInfo) {
        acompananteInfo.innerHTML = `
          <p><strong>Nombre:</strong> ${voluntarioData.nombre}</p>
          <p><strong>Universidad:</strong> ${voluntarioData.universidad}</p>
          <p><strong>Carrera:</strong> ${voluntarioData.carrera}</p>
        `;
        acompananteInfo.classList.remove('acompanante-empty');
      }
      
      if (acompananteActions) {
        acompananteActions.classList.remove('hidden');
      }
      
      // Mostrar formulario de calificación
      document.getElementById('calificacion-form').classList.remove('hidden');
      document.getElementById('calificacion-empty').classList.add('hidden');
    } else {
      // Ocultar completamente la sección de acompañante si no hay uno
      if (acompananteSection) {
        acompananteSection.classList.add('hidden');
      }
      
      // Ocultar formulario de calificación
      document.getElementById('calificacion-form').classList.add('hidden');
      document.getElementById('calificacion-empty').classList.remove('hidden');
    }
  }

  /**
   * Edita el perfil
   */
  function editarPerfil() {
    // Por ahora, redirigir al registro para editar
    showPage('adulto-mayor-registro');
    initAdultoMayorRegistro();
    
    // Prellenar formulario
    if (AppState.userData) {
      document.getElementById('nombre').value = AppState.userData.nombre;
      document.getElementById('edad').value = AppState.userData.edad;
      document.getElementById('telefono').value = AppState.userData.telefono;
      document.getElementById('zona').value = AppState.userData.zona;
      
      // Marcar checkboxes de necesidades
      AppState.userData.necesidades.forEach(nec => {
        const checkbox = document.querySelector(`input[value="${nec}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  }

  /**
   * Cambia el acompañante
   */
  function cambiarAcompanante() {
    if (confirm('¿Estás seguro de que deseas cambiar de acompañante?')) {
      localStorage.removeItem('adultoMayorVoluntario');
      loadPerfilData();
      alert('Tu solicitud para cambiar de acompañante ha sido registrada.');
    }
  }

  /**
   * Anula el acompañante - Corregido para desvincular correctamente
   */
  function anularAcompanante() {
    if (confirm('¿Deseas finalizar este acompañamiento?')) {
      // Obtener datos del voluntario actual
      const voluntario = JSON.parse(localStorage.getItem('adultoMayorVoluntario') || 'null');
      
      if (voluntario) {
        const voluntarioData = typeof voluntario === 'string' ? JSON.parse(voluntario) : voluntario;
        const adultoMayorData = AppState.userData;
        
        // Actualizar acompañamientos del universitario (marcar como finalizado/anulado)
        const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
        const acompanamientosActualizados = acompanamientos.map(acomp => {
          if (acomp.estado === 'activo') {
            // Verificar si corresponde a este acompañamiento
            const solicitud = acomp.solicitud;
            if (solicitud && solicitud.adultoMayorId === adultoMayorData?.nombre) {
              return { ...acomp, estado: 'anulado', fechaFin: new Date().toISOString() };
            }
          }
          return acomp;
        });
        localStorage.setItem('universitarioAcompanamientos', JSON.stringify(acompanamientosActualizados));
        
        // Eliminar relación del adulto mayor
        localStorage.removeItem('adultoMayorVoluntario');
        
        // Limpiar chat compartido si existe
        const chatId = `chat_${adultoMayorData?.nombre}_${voluntarioData.nombre}`;
        localStorage.removeItem(chatId);
        if (AppState.chatId) {
          AppState.chatId = null;
        }
        
        // Limpiar álbum compartido si existe
        const albumId = `album_${adultoMayorData?.nombre}_${voluntarioData.nombre}`;
        localStorage.removeItem(albumId);
        
        // Limpiar intervalo de chat si existe
        if (AppState.chatInterval) {
          clearInterval(AppState.chatInterval);
          AppState.chatInterval = null;
        }
        
        // Marcar desvinculación para sincronización bidireccional
        localStorage.setItem('acompanamientoDesvinculado', JSON.stringify({
          adultoMayor: adultoMayorData?.nombre,
          voluntario: voluntarioData.nombre,
          fecha: new Date().toISOString()
        }));
      }
      
      // Recargar datos del perfil (ocultará la sección de acompañante)
      loadPerfilData();
      
      // Si estamos en la página de chat, redirigir al home
      if (AppState.currentPage === 'adulto-mayor-chat') {
        showPage('adulto-mayor-home');
        initAdultoMayorHome();
      }
      
      // Mostrar mensaje del colibrí al finalizar acompañamiento
      if (AppState.colibriGuide) {
        AppState.colibriGuide.showMessage('accompaniment-completed');
      }
      
      alert('El acompañamiento ha terminado.\nEstamos aquí si necesitas volver a pedir apoyo.');
    }
  }

  /**
   * Selecciona una calificación con estrellas
   */
  let selectedRating = 0;
  function selectRating(rating) {
    selectedRating = rating;
    document.querySelectorAll('.star-btn').forEach((btn, index) => {
      if (index < rating) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Envía la calificación y actualiza el puntaje del universitario
   */
  function enviarCalificacion() {
    if (selectedRating === 0) {
      alert('Por favor, selecciona una calificación');
      return;
    }
    
    // Obtener datos del voluntario actual
    const voluntario = JSON.parse(localStorage.getItem('adultoMayorVoluntario') || 'null');
    if (!voluntario) {
      alert('Error: No se encontró información del voluntario');
      return;
    }
    
    const comentario = document.getElementById('calificacion-comentario').value;
    
    const calificacion = {
      rating: selectedRating,
      comentario: comentario,
      fecha: new Date().toISOString(),
      estudiante: voluntario.nombre,
      adultoMayor: AppState.userData.nombre
    };
    
    // Guardar calificación
    const calificaciones = JSON.parse(localStorage.getItem('calificacionesVoluntarios') || '[]');
    calificaciones.push(calificacion);
    localStorage.setItem('calificacionesVoluntarios', JSON.stringify(calificaciones));
    
      // Marcar acompañamiento como completado en universitario
      const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
      const acompanamientoActivo = acompanamientos.find(a => 
        a.estado === 'activo' && 
        a.solicitud && 
        a.solicitud.adultoMayorId === AppState.userData?.nombre
      );
      
      if (acompanamientoActivo) {
        acompanamientoActivo.estado = 'completado';
        acompanamientoActivo.fechaFin = new Date().toISOString();
        localStorage.setItem('universitarioAcompanamientos', JSON.stringify(acompanamientos));
      }
      
      // Actualizar puntaje y calificación del universitario
      const universitarios = getAllUniversitarios();
      const universitario = universitarios.find(u => u.nombre === voluntario.nombre);
      
      if (universitario) {
        // Calcular nueva calificación promedio
        const calificacionesEstudiante = calificaciones.filter(c => c.estudiante === voluntario.nombre);
        const sumaCalificaciones = calificacionesEstudiante.reduce((sum, c) => sum + c.rating, 0);
        const nuevaCalificacionPromedio = calificacionesEstudiante.length > 0 
          ? sumaCalificaciones / calificacionesEstudiante.length 
          : 0;
        
        // Actualizar puntaje (10 puntos por acompañamiento + bonus opcional por calificación)
        // Los puntos son solo motivacionales y no representan horas ni semanas activas
        const puntosBase = 10; // 10 puntos por acompañamiento completado
        const puntosBonus = selectedRating === 5 ? 5 : 0; // Bonus opcional por calificación positiva
        const nuevoPuntaje = (universitario.puntaje || 0) + puntosBase + puntosBonus;
        
        // Actualizar datos del universitario
        universitario.puntaje = nuevoPuntaje;
        universitario.calificacionPromedio = nuevaCalificacionPromedio;
        universitario.acompanamientos = (universitario.acompanamientos || 0) + 1;
        
        // Guardar actualización
        localStorage.setItem('universitarioData', JSON.stringify(universitario));
        
        // Agregar al historial del universitario
        const historial = JSON.parse(localStorage.getItem('universitarioHistorial') || '[]');
        historial.push({
          estudiante: voluntario.nombre,
          titulo: 'Acompañamiento completado',
          tipo: 'puntos', // Indica que suma puntos
          puntos: puntosBase + puntosBonus,
          fecha: new Date().toISOString()
        });
        localStorage.setItem('universitarioHistorial', JSON.stringify(historial));
        
        // Verificar si se completó una semana activa (5 acompañamientos en la misma semana)
        const semanasActivas = calcularSemanasActivas(voluntario.nombre);
        const acompanamientosCompletados = universitario.acompanamientos || 0;
        const semanasEsperadas = Math.floor(acompanamientosCompletados / 5);
        
        // Si se alcanzó un nuevo múltiplo de 5 acompañamientos, registrar semana activa
        if (acompanamientosCompletados % 5 === 0 && acompanamientosCompletados > 0) {
          const historialSemana = JSON.parse(localStorage.getItem('universitarioHistorial') || '[]');
          historialSemana.push({
            estudiante: voluntario.nombre,
            titulo: 'Semana activa completada',
            tipo: 'horas', // Indica que suma horas/semanas (cumplimiento académico)
            horas: 5, // 5 horas = 1 semana activa
            fecha: new Date().toISOString()
          });
          localStorage.setItem('universitarioHistorial', JSON.stringify(historialSemana));
          
          // Mostrar mensaje del colibrí al completar semana activa
          const colibriWrapperUni = document.getElementById('colibri-guide-wrapper-uni');
          if (colibriWrapperUni && typeof ColibriGuide !== 'undefined') {
            if (!AppState.colibriGuide || AppState.colibriGuide.container.id !== 'colibri-guide-wrapper-uni') {
              AppState.colibriGuide = new ColibriGuide(colibriWrapperUni);
            }
            AppState.colibriGuide.showMessage('week-active');
          }
        }
      }
    
    // Mostrar mensaje del colibrí
    if (AppState.colibriGuide) {
      AppState.colibriGuide.showMessage('completed');
    }
    
    alert('¡Gracias por tu calificación! El puntaje del voluntario ha sido actualizado.');
    
    // Resetear formulario
    selectedRating = 0;
    document.querySelectorAll('.star-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('calificacion-comentario').value = '';
  }

  /**
   * Cierra la sesión del usuario actual
   * Limpia el estado y redirige a la pantalla de selección de rol
   */
  function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      // Limpiar estado de sesión
      AppState.currentRole = null;
      AppState.currentPage = null;
      AppState.userData = null;
      AppState.voluntarioSeleccionado = null;
      AppState.tipoAyudaSeleccionado = null;
      AppState.chatId = null;
      
      // Limpiar intervalos
      if (AppState.chatInterval) {
        clearInterval(AppState.chatInterval);
        AppState.chatInterval = null;
      }
      
      // Limpiar localStorage (excepto docenteData si es docente)
      const docenteData = localStorage.getItem('docenteData');
      localStorage.clear();
      if (docenteData) {
        localStorage.setItem('docenteData', docenteData);
      }
      
      // Redirigir a pantalla de selección de rol
      showPage('role-selection');
      document.getElementById('role-selection').classList.remove('hidden');
    }
  }

  /**
   * ============================================
   * FLUJO UNIVERSITARIO
   * ============================================
   */

  /**
   * Inicializa el flujo del Universitario
   */
  function initUniversitarioFlow() {
    // Verificar si el usuario ya está registrado
    const userData = localStorage.getItem('universitarioData');
    
    if (userData) {
      // Usuario ya registrado, ir al home
      AppState.userData = JSON.parse(userData);
      showPage('universitario-home');
      initUniversitarioHome();
    } else {
      // Usuario no registrado, mostrar formulario de registro
      showPage('universitario-registro');
      initUniversitarioRegistro();
    }
  }

  /**
   * Inicializa la pantalla de registro del universitario
   */
  function initUniversitarioRegistro() {
    const registroForm = document.getElementById('registro-universitario-form');
    
    registroForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Obtener datos del formulario
      const nombre = document.getElementById('uni-nombre').value.trim();
      const universidad = document.getElementById('universidad').value.trim();
      const carrera = document.getElementById('carrera').value.trim();
      const telefono = document.getElementById('uni-telefono').value.trim();
      const zona = document.getElementById('uni-zona').value;
      const habilidades = Array.from(document.querySelectorAll('input[name="habilidades"]:checked')).map(cb => cb.value);
      
      // Validaciones
      if (!validateUniversitarioRegistroForm(nombre, universidad, carrera, telefono, zona, habilidades)) {
        return;
      }
      
      // Guardar datos del usuario
      const userData = {
        nombre: nombre,
        universidad: universidad,
        carrera: carrera,
        telefono: telefono,
        zona: zona,
        habilidades: habilidades,
        fechaRegistro: new Date().toISOString(),
        puntaje: 0,
        acompanamientos: 0,
        calificacionPromedio: 0
      };
      
      AppState.userData = userData;
      localStorage.setItem('universitarioData', JSON.stringify(userData));
      
      // Mostrar colibrí de confirmación de registro (momento emocional)
      const colibriWrapper = document.getElementById('colibri-guide-wrapper-uni');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        const colibriGuide = new ColibriGuide(colibriWrapper);
        colibriGuide.showMessage('registration-success');
      }
      
      // Navegar al home después de mostrar el mensaje
      setTimeout(() => {
        showPage('universitario-home');
        initUniversitarioHome();
      }, 4500);
    });
  }

  /**
   * Valida el formulario de registro del universitario
   */
  function validateUniversitarioRegistroForm(nombre, universidad, carrera, telefono, zona, habilidades) {
    let isValid = true;
    
    // Limpiar errores previos
    document.querySelectorAll('[id^="error-uni"]').forEach(el => el.textContent = '');
    
    // Validar nombre
    if (!nombre || nombre.length < 2) {
      document.getElementById('error-uni-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    // Validar universidad
    if (!universidad || universidad.length < 2) {
      document.getElementById('error-universidad').textContent = 'Ingresa el nombre de tu universidad';
      isValid = false;
    }
    
    // Validar carrera
    if (!carrera || carrera.length < 2) {
      document.getElementById('error-carrera').textContent = 'Ingresa tu carrera';
      isValid = false;
    }
    
    // Validar teléfono
    if (!telefono || telefono.length < 8) {
      document.getElementById('error-uni-telefono').textContent = 'Ingresa un teléfono válido';
      isValid = false;
    }
    
    // Validar zona
    if (!zona) {
      document.getElementById('error-uni-zona').textContent = 'Selecciona una zona';
      isValid = false;
    }
    
    // Validar habilidades
    if (!habilidades || habilidades.length === 0) {
      document.getElementById('error-uni-habilidades').textContent = 'Selecciona al menos una habilidad';
      isValid = false;
    }
    
    return isValid;
  }

  /**
   * Inicializa la pantalla principal (Home) del universitario
   */
  function initUniversitarioHome() {
    // Inicializar colibrí guía emocional (oculto por defecto)
    const colibriWrapper = document.getElementById('colibri-guide-wrapper-uni');
    if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
      AppState.colibriGuide = new ColibriGuide(colibriWrapper);
      // El colibrí está oculto por defecto, aparecerá solo cuando se necesite
    }
    
    // Inicializar barra de navegación inferior
    initBottomNavigationUni('bottom-nav-container-uni', 'solicitudes');
    
    // Filtro de zona
    const filtroZona = document.getElementById('filtro-zona');
    if (filtroZona) {
      filtroZona.addEventListener('change', function() {
        loadSolicitudesDisponibles(this.value);
      });
    }
    
    // Cargar solicitudes disponibles
    loadSolicitudesDisponibles('todas');
    
    // Cargar acompañamientos activos
    loadAcompanamientosActivos();
  }

  /**
   * Inicializa la barra de navegación inferior del universitario
   */
  function initBottomNavigationUni(containerId, activePage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const navItems = [
      { id: 'solicitudes', label: 'Solicitudes', icon: '' },
      { id: 'rutas', label: 'Rutas', icon: '' },
      { id: 'album', label: 'Álbum', icon: '' },
      { id: 'puntaje', label: 'Puntaje', icon: '' },
      { id: 'perfil', label: 'Perfil', icon: '' }
    ];
    
    if (typeof BottomNavigation !== 'undefined') {
      AppState.bottomNav = new BottomNavigation(container, navItems, function(navId) {
        navigateToPageUni(navId);
      });
      
      // Establecer página activa
      if (activePage) {
        AppState.bottomNav.setActive(activePage);
      }
    }
  }

  /**
   * Navega a una página específica del universitario
   */
  window.navigateToPageUni = function(pageId) {
    const pageMap = {
      'solicitudes': 'universitario-home',
      'rutas': 'universitario-rutas',
      'album': 'universitario-album',
      'puntaje': 'universitario-puntaje',
      'perfil': 'universitario-perfil'
    };
    
    const pageName = pageMap[pageId] || pageId;
    showPage(pageName);
    
    // Inicializar la página correspondiente
    switch(pageId) {
      case 'solicitudes':
        initUniversitarioHome();
        break;
      case 'rutas':
        initUniversitarioRutas();
        break;
      case 'album':
        initUniversitarioAlbum();
        break;
      case 'puntaje':
        initUniversitarioPuntaje();
        break;
      case 'perfil':
        initUniversitarioPerfil();
        break;
      case 'chat':
        initUniversitarioChat();
        showPage('universitario-chat');
        break;
    }
  }

  /**
   * Obtiene las solicitudes disponibles para universitarios
   * Usa la lista global de solicitudes disponibles
   */
  function getSolicitudesDisponibles() {
    // Obtener solicitudes disponibles del localStorage (creadas por adultos mayores)
    const solicitudesDisponibles = localStorage.getItem('solicitudesDisponibles');
    const solicitudes = solicitudesDisponibles ? JSON.parse(solicitudesDisponibles) : [];
    
    // Filtrar solo las pendientes
    return solicitudes.filter(s => s.estado === 'pendiente');
  }

  /**
   * Carga y muestra las solicitudes disponibles
   */
  function loadSolicitudesDisponibles(filtroZona = 'todas') {
    const solicitudes = getSolicitudesDisponibles();
    const container = document.getElementById('solicitudes-universitario');
    
    if (!container) return;
    
    // Filtrar por zona si es necesario
    let solicitudesFiltradas = solicitudes;
    if (filtroZona !== 'todas') {
      // Obtener datos de adultos mayores para filtrar por zona
      const adultosMayores = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
      solicitudesFiltradas = solicitudes.filter(s => {
        // En una implementación real, esto se haría con IDs
        return true; // Por ahora, mostrar todas
      });
    }
    
    if (solicitudesFiltradas.length === 0) {
      container.innerHTML = `
        <div class="solicitudes-empty-state">
          <p>No hay solicitudes disponibles en este momento</p>
          <p class="solicitudes-empty-hint">Las nuevas solicitudes aparecerán aquí</p>
        </div>
      `;
    } else {
      // Obtener datos de adultos mayores para mostrar información
      const adultosMayores = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
      
      container.innerHTML = solicitudesFiltradas.map(sol => {
        const necesidadesLabels = {
          'compania': 'Compañía',
          'medicamentos': 'Medicamentos',
          'compras': 'Compras',
          'citas': 'Citas médicas',
          'tecnologia': 'Tecnología',
          'otras': 'Otras'
        };
        
        const necesidades = sol.necesidades || [];
        const necesidadesDisplay = necesidades.map(n => necesidadesLabels[n] || n).join(', ');
        
        return `
          <div class="solicitud-card-uni" data-solicitud-id="${sol.id}">
            <div class="solicitud-header">
              <div class="solicitud-nombre">${adultosMayores.nombre || 'Adulto Mayor'}</div>
              <span class="solicitud-zona">${adultosMayores.zona || 'Zona'}</span>
            </div>
            <div class="solicitud-info">
              <p><strong>Tipo de ayuda:</strong> ${necesidadesDisplay || 'General'}</p>
              <p><strong>Fecha:</strong> ${new Date(sol.fecha).toLocaleDateString()}</p>
              ${sol.esNocturno ? '<p class="solicitud-nocturna"><svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Solicitud nocturna</p>' : ''}
            </div>
            <div class="solicitud-actions">
              <button class="btn-aceptar" onclick="aceptarAcompanamiento(${sol.id})">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Aceptar
              </button>
              <button class="btn-rechazar" onclick="rechazarSolicitud(${sol.id})">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Rechazar
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  /**
   * Acepta un acompañamiento
   */
  window.aceptarAcompanamiento = function(solicitudId) {
    const solicitudes = getSolicitudesDisponibles();
    const solicitud = solicitudes.find(s => s.id === solicitudId);
    
    if (!solicitud) return;
    
    // Actualizar estado de la solicitud (sincronizado en ambos perfiles)
    solicitud.estado = 'aceptada';
    solicitud.aceptadaPor = AppState.userData.nombre;
    solicitud.fechaAceptacion = new Date().toISOString();
    
    // Actualizar en solicitudesDisponibles (eliminar de la lista)
    const todasSolicitudesDisponibles = JSON.parse(localStorage.getItem('solicitudesDisponibles') || '[]');
    const solicitudesDisponiblesActualizadas = todasSolicitudesDisponibles.filter(s => s.id !== solicitudId);
    localStorage.setItem('solicitudesDisponibles', JSON.stringify(solicitudesDisponiblesActualizadas));
    
    // Actualizar en adultoMayorSolicitudes (sincronizar estado)
    const todasSolicitudes = JSON.parse(localStorage.getItem('adultoMayorSolicitudes') || '[]');
    const index = todasSolicitudes.findIndex(s => s.id === solicitudId);
    if (index !== -1) {
      todasSolicitudes[index] = solicitud;
      localStorage.setItem('adultoMayorSolicitudes', JSON.stringify(todasSolicitudes));
    }
    
    // Guardar acompañamiento activo
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    acompanamientos.push({
      id: solicitudId,
      solicitud: solicitud,
      fechaInicio: new Date().toISOString(),
      estado: 'activo'
    });
    localStorage.setItem('universitarioAcompanamientos', JSON.stringify(acompanamientos));
    
    // Asignar voluntario al adulto mayor (simulado)
    const voluntarioData = {
      nombre: AppState.userData.nombre,
      universidad: AppState.userData.universidad,
      carrera: AppState.userData.carrera
    };
    localStorage.setItem('adultoMayorVoluntario', JSON.stringify(voluntarioData));
    
    // Actualizar estadísticas del universitario
    if (AppState.userData) {
      AppState.userData.acompanamientos = (AppState.userData.acompanamientos || 0) + 1;
      localStorage.setItem('universitarioData', JSON.stringify(AppState.userData));
    }
    
    // Mostrar mensaje del colibrí al aceptar acompañamiento
    const colibriWrapperUni = document.getElementById('colibri-guide-wrapper-uni');
    if (colibriWrapperUni && typeof ColibriGuide !== 'undefined') {
      if (!AppState.colibriGuide || AppState.colibriGuide.container.id !== 'colibri-guide-wrapper-uni') {
        AppState.colibriGuide = new ColibriGuide(colibriWrapperUni);
      }
      AppState.colibriGuide.showMessage('accompaniment-accepted');
    }
    
    alert('Has aceptado este acompañamiento.\nYa puedes comunicarte a través del chat.');
    
    // Recargar solicitudes y acompañamientos
    loadSolicitudesDisponibles();
    loadAcompanamientosActivos();
  };

  /**
   * Rechaza una solicitud
   */
  window.rechazarSolicitud = function(solicitudId) {
    if (confirm('¿Estás seguro de que deseas rechazar esta solicitud?')) {
      // Obtener la solicitud para actualizar su estado
      const todasSolicitudesDisponibles = JSON.parse(localStorage.getItem('solicitudesDisponibles') || '[]');
      const solicitud = todasSolicitudesDisponibles.find(s => s.id === solicitudId);
      
      if (solicitud) {
        // Actualizar estado a "rechazada" (sincronizado en ambos perfiles)
        solicitud.estado = 'rechazada';
        solicitud.fechaRechazo = new Date().toISOString();
        
        // Eliminar de solicitudesDisponibles (no aparece más para universitarios)
        const solicitudesDisponiblesActualizadas = todasSolicitudesDisponibles.filter(s => s.id !== solicitudId);
        localStorage.setItem('solicitudesDisponibles', JSON.stringify(solicitudesDisponiblesActualizadas));
        
        // Actualizar estado en adultoMayorSolicitudes (sincronizar)
        const todasSolicitudes = JSON.parse(localStorage.getItem('adultoMayorSolicitudes') || '[]');
        const index = todasSolicitudes.findIndex(s => s.id === solicitudId);
        if (index !== -1) {
          todasSolicitudes[index] = solicitud;
          localStorage.setItem('adultoMayorSolicitudes', JSON.stringify(todasSolicitudes));
        }
      }
      
      // Recargar solicitudes (ya no aparecerá en la lista)
      loadSolicitudesDisponibles();
    }
  };

  /**
   * Carga los acompañamientos activos del universitario
   * Verifica desvinculación bidireccional
   */
  function loadAcompanamientosActivos() {
    // Verificar si hay desvinculación reciente
    const desvinculacion = JSON.parse(localStorage.getItem('acompanamientoDesvinculado') || 'null');
    if (desvinculacion && desvinculacion.voluntario === AppState.userData?.nombre) {
      // Si este universitario fue desvinculado, limpiar estado
      const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
      const acompanamientosActualizados = acompanamientos.map(acomp => {
        if (acomp.estado === 'activo') {
          return { ...acomp, estado: 'anulado', fechaFin: new Date().toISOString() };
        }
        return acomp;
      });
      localStorage.setItem('universitarioAcompanamientos', JSON.stringify(acompanamientosActualizados));
      
      // Limpiar chat compartido si existe
      const adultoMayor = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
      const chatId = `chat_${adultoMayor.nombre || 'adulto'}_${AppState.userData.nombre}`;
      localStorage.removeItem(chatId);
      
      // Limpiar desvinculación
      localStorage.removeItem('acompanamientoDesvinculado');
    }
    
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const activos = acompanamientos.filter(a => a.estado === 'activo');
    const container = document.getElementById('acompanamientos-activos');
    const list = document.getElementById('acompanamientos-list');
    
    if (!container || !list) return;
    
    if (activos.length > 0) {
      container.classList.remove('hidden');
      
      const adultosMayores = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
      
      list.innerHTML = activos.map(acomp => `
        <div class="acompanamiento-card">
          <div class="acompanamiento-header">
            <div class="acompanamiento-nombre">${adultosMayores.nombre || 'Adulto Mayor'}</div>
            <span class="acompanamiento-estado">Activo</span>
          </div>
          <div class="acompanamiento-info">
            <p>Desde: ${new Date(acomp.fechaInicio).toLocaleDateString()}</p>
          </div>
          <div class="acompanamiento-actions">
            <button class="btn-primary" onclick="window.navigateToPageUni('chat')">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Ir al chat
            </button>
          </div>
        </div>
      `).join('');
    } else {
      // Mostrar mensaje neutro cuando no hay acompañamientos
      container.classList.remove('hidden');
      list.innerHTML = `
        <div class="acompanamiento-empty">
          <p>No tienes acompañamientos activos</p>
        </div>
      `;
    }
  }

  /**
   * Inicializa la pantalla de Rutas Seguras con Google Maps embebido
   * Muestra el mapa directamente centrado en Guayaquil, Ecuador
   */
  function initUniversitarioRutas() {
    initBottomNavigationUni('bottom-nav-container-rutas', 'rutas');
    
    const visualizacion = document.getElementById('ruta-visualizacion');
    const buscarBtn = document.getElementById('ruta-buscar-btn');
    const buscarInput = document.getElementById('ruta-buscar-destino');
    const iframe = document.getElementById('ruta-map-iframe');
    
    // Mostrar mapa directamente al entrar (ya no está oculto)
    if (visualizacion) {
      visualizacion.classList.remove('hidden');
    }
    
    // Cargar mapa centrado en Guayaquil, Ecuador
    // Coordenadas: -2.1709979, -79.9223592 (Guayaquil, Guayas, Ecuador)
    if (iframe) {
      try {
        // Google Maps Embed centrado en Guayaquil, Ecuador
        const guayaquilCoords = '-2.1709979,-79.9223592';
        iframe.src = `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d15924.5!2d-79.9223592!3d-2.1709979!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1ses!2sec!4v1234567890`;
      } catch (error) {
        // Manejar error de API de forma amigable
        iframe.style.display = 'none';
        const errorMsg = document.createElement('div');
        errorMsg.className = 'ruta-error';
        errorMsg.innerHTML = `
          <p>No se pudo cargar el mapa en este momento.</p>
          <p class="ruta-error-hint">Puedes usar la búsqueda para encontrar tu destino.</p>
        `;
        if (iframe.parentNode) {
          iframe.parentNode.insertBefore(errorMsg, iframe);
        }
      }
    }
    
    // Búsqueda directa en el mapa
    if (buscarBtn && buscarInput) {
      buscarBtn.addEventListener('click', function() {
        const destino = buscarInput.value.trim();
        if (destino) {
          buscarDestinoEnMapa(destino);
        }
      });
      
      buscarInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          const destino = buscarInput.value.trim();
          if (destino) {
            buscarDestinoEnMapa(destino);
          }
        }
      });
    }
    
    // Inicializar carrusel de consejos
    initRutasTipsCarousel();
  }
  
  /**
   * Inicializa el carrusel de consejos de seguridad en rutas
   * Solo indicadores tipo punto, auto-play, sin botones laterales
   */
  function initRutasTipsCarousel() {
    const carousel = document.getElementById('rutas-tips-carousel');
    const prevBtn = document.getElementById('tip-prev');
    const nextBtn = document.getElementById('tip-next');
    const indicators = document.querySelector('.tip-indicators');
    
    if (!carousel) return;
    
    // Ocultar botones laterales
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    
    const slides = carousel.querySelectorAll('.tip-slide');
    let currentSlide = 0;
    
    // Crear indicadores tipo punto
    if (indicators) {
      indicators.innerHTML = '';
      slides.forEach((_, index) => {
        const indicator = document.createElement('button');
        indicator.className = 'tip-indicator' + (index === 0 ? ' active' : '');
        indicator.setAttribute('aria-label', `Consejo ${index + 1}`);
        indicator.addEventListener('click', () => goToSlide(index));
        indicators.appendChild(indicator);
      });
    }
    
    function updateCarousel() {
      slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentSlide);
      });
      
      if (indicators) {
        const indicatorBtns = indicators.querySelectorAll('.tip-indicator');
        indicatorBtns.forEach((indicator, index) => {
          indicator.classList.toggle('active', index === currentSlide);
        });
      }
    }
    
    function goToSlide(index) {
      currentSlide = index;
      updateCarousel();
    }
    
    function nextSlide() {
      currentSlide = (currentSlide + 1) % slides.length;
      updateCarousel();
    }
    
    // Auto-avanzar cada 5 segundos
    if (AppState.rutasCarouselInterval) clearInterval(AppState.rutasCarouselInterval);
    AppState.rutasCarouselInterval = setInterval(nextSlide, 5000);
    
    // Pausar auto-play al hacer hover
    if (carousel) {
      carousel.addEventListener('mouseenter', () => {
        if (AppState.rutasCarouselInterval) {
          clearInterval(AppState.rutasCarouselInterval);
        }
      });
      carousel.addEventListener('mouseleave', () => {
        AppState.rutasCarouselInterval = setInterval(nextSlide, 5000);
      });
    }
  }


  /**
   * Busca un destino personalizado usando geocodificación real con OpenStreetMap Nominatim
   * Calcula distancia y tiempo estimado
   * @param {string} destino - Texto de búsqueda del destino
   */
  function buscarDestinoEnMapa(destino) {
    const iframe = document.getElementById('ruta-map-iframe');
    const distanciaEl = document.getElementById('ruta-distancia');
    const tiempoEl = document.getElementById('ruta-tiempo');
    const seguridadEl = document.getElementById('ruta-seguridad');
    
    if (!iframe) return;
    
    // Mostrar estado de carga
    if (distanciaEl) distanciaEl.textContent = 'Calculando...';
    if (tiempoEl) tiempoEl.textContent = 'Calculando...';
    if (seguridadEl) seguridadEl.textContent = 'Calculando...';
    
    // Coordenadas de origen (Guayaquil, Ecuador) -2.1709979, -79.9223592
    const origenLat = -2.1709979;
    const origenLng = -79.9223592;
    
    // Usar OpenStreetMap Nominatim para geocodificación
    const query = encodeURIComponent(destino + ', Guayaquil, Ecuador');
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`;
    
    fetch(nominatimUrl)
      .then(response => response.json())
      .then(data => {
        if (data && data.length > 0) {
          const resultado = data[0];
          const destinoLat = parseFloat(resultado.lat);
          const destinoLng = parseFloat(resultado.lon);
          
          // Calcular distancia usando fórmula de Haversine (en km)
          const distancia = calcularDistancia(origenLat, origenLng, destinoLat, destinoLng);
          
          // Calcular tiempo estimado (promedio de velocidad urbana ~30 km/h)
          const velocidadPromedio = 30; // km/h
          const tiempoHoras = distancia / velocidadPromedio;
          const tiempoMinutos = Math.round(tiempoHoras * 60);
          
          // Actualizar detalles con valores reales
          if (distanciaEl) {
            distanciaEl.textContent = distancia < 1 
              ? `${Math.round(distancia * 1000)} m` 
              : `${distancia.toFixed(2)} km`;
          }
          if (tiempoEl) {
            tiempoEl.textContent = tiempoMinutos < 60 
              ? `${tiempoMinutos} min` 
              : `${Math.floor(tiempoMinutos / 60)}h ${tiempoMinutos % 60}min`;
          }
          if (seguridadEl) {
            // Evaluar seguridad basada en distancia y hora (simplificado)
            const ahora = new Date();
            const hora = ahora.getHours();
            const esDia = hora >= 6 && hora < 20;
            const esSeguro = distancia < 10 && esDia;
            seguridadEl.textContent = esSeguro ? 'Alta' : distancia < 5 ? 'Media' : 'Media-Baja';
          }
          
          // Actualizar iframe con coordenadas reales
          // Usar Google Maps Embed con coordenadas específicas
          const mapUrl = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3989.0!2d${destinoLng}!3d${destinoLat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z!5e0!3m2!1ses!2sec!4v${Date.now()}`;
          iframe.src = mapUrl;
          iframe.style.display = 'block';
          
          // Ocultar mensaje de error si existe
          const errorMsg = iframe.parentNode.querySelector('.ruta-error');
          if (errorMsg) {
            errorMsg.remove();
          }
        } else {
          // No se encontró el destino
          iframe.style.display = 'none';
          const errorMsg = document.createElement('div');
          errorMsg.className = 'ruta-error';
          errorMsg.innerHTML = `
            <p>No se encontró el destino "${destino}".</p>
            <p class="ruta-error-hint">Intenta con otro término de búsqueda o una dirección más específica.</p>
          `;
          if (iframe.parentNode) {
            const existingError = iframe.parentNode.querySelector('.ruta-error');
            if (existingError) existingError.remove();
            iframe.parentNode.insertBefore(errorMsg, iframe);
          }
          
          if (distanciaEl) distanciaEl.textContent = '-';
          if (tiempoEl) tiempoEl.textContent = '-';
          if (seguridadEl) seguridadEl.textContent = '-';
        }
      })
      .catch(error => {
        console.error('Error en geocodificación:', error);
        // Manejar error de forma amigable
        iframe.style.display = 'none';
        const errorMsg = document.createElement('div');
        errorMsg.className = 'ruta-error';
        errorMsg.innerHTML = `
          <p>No se pudo buscar el destino en este momento.</p>
          <p class="ruta-error-hint">Intenta nuevamente más tarde.</p>
        `;
        if (iframe.parentNode) {
          const existingError = iframe.parentNode.querySelector('.ruta-error');
          if (existingError) existingError.remove();
          iframe.parentNode.insertBefore(errorMsg, iframe);
        }
        
        if (distanciaEl) distanciaEl.textContent = '-';
        if (tiempoEl) tiempoEl.textContent = '-';
        if (seguridadEl) seguridadEl.textContent = '-';
      });
  }
  
  /**
   * Calcula la distancia entre dos puntos usando la fórmula de Haversine
   * @param {number} lat1 - Latitud origen
   * @param {number} lon1 - Longitud origen
   * @param {number} lat2 - Latitud destino
   * @param {number} lon2 - Longitud destino
   * @returns {number} Distancia en kilómetros
   */
  function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Inicializa la pantalla de Álbum del universitario
   */
  function initUniversitarioAlbum() {
    initBottomNavigationUni('bottom-nav-container-album-uni', 'album');
    
    // Cargar fotos existentes
    loadAlbumPhotosUni();
    
    const addPhotoBtn = document.getElementById('add-photo-btn-uni');
    const photoInput = document.getElementById('photo-input-uni');
    
    if (addPhotoBtn && photoInput) {
      // Remover listeners previos clonando elementos
      const newAddPhotoBtn = addPhotoBtn.cloneNode(true);
      addPhotoBtn.parentNode.replaceChild(newAddPhotoBtn, addPhotoBtn);
      
      const newPhotoInput = photoInput.cloneNode(true);
      photoInput.parentNode.replaceChild(newPhotoInput, photoInput);
      
      // Agregar listener al botón para abrir selector
      document.getElementById('add-photo-btn-uni').addEventListener('click', () => {
        document.getElementById('photo-input-uni').click();
      });
      
      // Agregar listener al input para procesar archivos seleccionados
      document.getElementById('photo-input-uni').addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
          if (file.type.startsWith('image/')) {
            addPhotoToAlbumUni(file);
          }
        });
        // Limpiar input para permitir seleccionar el mismo archivo nuevamente
        this.value = '';
      });
    }
    
    // Escuchar eventos de actualización del álbum para sincronización
    window.addEventListener('albumUpdated', function() {
      loadAlbumPhotosUni();
    });
    
    // Polling para sincronización automática (cada 2 segundos)
    if (AppState.albumInterval) clearInterval(AppState.albumInterval);
    AppState.albumInterval = setInterval(() => {
      if (AppState.currentPage === 'universitario-album') {
        loadAlbumPhotosUni();
      }
    }, 2000);
  }

  /**
   * Agrega una foto al álbum compartido del universitario
   */
  function addPhotoToAlbumUni(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const photoData = {
        id: Date.now(),
        url: e.target.result,
        fecha: new Date().toISOString()
      };
      
      // Guardar foto en localStorage con clave única albumRecuerdos
      const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
      photos.push(photoData);
      localStorage.setItem('albumRecuerdos', JSON.stringify(photos));
      
      // Recargar álbum inmediatamente
      loadAlbumPhotosUni();
      
      // Disparar evento de actualización para sincronización
      window.dispatchEvent(new CustomEvent('albumUpdated'));
    };
    
    reader.readAsDataURL(file);
  }

  /**
   * Carga las fotos del álbum compartido del universitario
   */
  function loadAlbumPhotosUni() {
    const grid = document.getElementById('album-grid-uni');
    if (!grid) return;
    
    // Obtener fotos de localStorage con clave única albumRecuerdos
    const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
    
    if (photos.length === 0) {
      grid.innerHTML = `
        <div class="album-empty-state">
          <p>Aún no hay recuerdos aquí.</p>
          <p class="album-empty-hint">Cuando compartas una foto, aparecerá en este espacio.</p>
        </div>
      `;
    } else {
      grid.innerHTML = photos.map(photo => `
        <div class="album-photo-container">
          <img src="${photo.url}" alt="Foto del álbum" class="album-photo" />
          <button class="btn-eliminar-foto" data-photo-id="${photo.id}" aria-label="Eliminar foto">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `).join('');
      
      // Event listeners para eliminar fotos
      grid.querySelectorAll('.btn-eliminar-foto').forEach(btn => {
        btn.addEventListener('click', function() {
          const photoId = parseInt(this.getAttribute('data-photo-id'));
          eliminarFotoAlbumUni(photoId);
        });
      });
    }
  }

  /**
   * Elimina una foto del álbum compartido del universitario
   */
  function eliminarFotoAlbumUni(photoId) {
    if (!confirm('¿Estás seguro que quieres eliminar esta foto?')) {
      return;
    }
    
    const photos = JSON.parse(localStorage.getItem('albumRecuerdos') || '[]');
    const photosActualizadas = photos.filter(p => p.id !== photoId);
    localStorage.setItem('albumRecuerdos', JSON.stringify(photosActualizadas));
    
    // Recargar álbum inmediatamente
    loadAlbumPhotosUni();
    
    // Disparar evento de actualización para sincronización
    window.dispatchEvent(new CustomEvent('albumUpdated'));
  }

  /**
   * Inicializa la pantalla de Puntaje
   */
  function initUniversitarioPuntaje() {
    initBottomNavigationUni('bottom-nav-container-puntaje', 'puntaje');
    
    // Cargar datos del usuario
    if (AppState.userData) {
      // Actualizar puntaje total (gamificación)
      document.getElementById('puntaje-total').textContent = AppState.userData.puntaje || 0;
      
      // Actualizar acompañamientos realizados
      document.getElementById('stat-acompanamientos').textContent = AppState.userData.acompanamientos || 0;
      
      // Actualizar calificación promedio (solo informativa, no afecta cumplimiento)
      document.getElementById('stat-calificacion').textContent = (AppState.userData.calificacionPromedio || 0).toFixed(1);
      
      // Calcular y mostrar semanas activas (cumplimiento académico)
      const semanasActivas = calcularSemanasActivas(AppState.userData.nombre);
      document.getElementById('stat-semanas').textContent = semanasActivas;
      
      // Mostrar indicador visual si cumple semanas pero tiene calificación baja
      mostrarIndicadorCalificacion();
    }
    
    // Cargar historial
    loadHistorialPuntaje();
    
    // Actualizar en tiempo real cada 2 segundos
    if (AppState.puntajeInterval) clearInterval(AppState.puntajeInterval);
    AppState.puntajeInterval = setInterval(() => {
      if (AppState.currentPage === 'universitario-puntaje' && AppState.userData) {
        // Recargar datos
        const userData = JSON.parse(localStorage.getItem('universitarioData') || '{}');
        if (userData.nombre === AppState.userData.nombre) {
          AppState.userData = userData;
          document.getElementById('puntaje-total').textContent = AppState.userData.puntaje || 0;
          document.getElementById('stat-acompanamientos').textContent = AppState.userData.acompanamientos || 0;
          document.getElementById('stat-calificacion').textContent = (AppState.userData.calificacionPromedio || 0).toFixed(1);
          const semanasActivas = calcularSemanasActivas(AppState.userData.nombre);
          document.getElementById('stat-semanas').textContent = semanasActivas;
          loadHistorialPuntaje();
        }
      }
    }, 2000);
  }
  
  /**
   * Calcula las semanas activas basándose en acompañamientos completados
   * REGLA: Una semana activa = 5 acompañamientos completados en la misma semana
   * Cada acompañamiento = 1 hora de vinculación
   * 1 semana activa = 5 horas de vinculación
   * Total requerido: 160 horas = 32 semanas activas
   * 
   * IMPORTANTE: Las semanas activas NO dependen de puntos ni calificaciones por estrellas
   * @param {string} nombreUniversitario - Nombre del universitario
   * @returns {number} Número de semanas activas cumplidas
   */
  function calcularSemanasActivas(nombreUniversitario) {
    // Obtener todos los acompañamientos completados del universitario
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const completados = acompanamientos.filter(a => 
      a.estado === 'completado' || 
      (a.estado === 'activo' && a.fechaFin) // Incluir activos con fechaFin
    );
    
    if (completados.length === 0) return 0;
    
    // Obtener calificaciones para fechas de finalización (solo para obtener fecha, no para afectar el cálculo)
    const calificaciones = JSON.parse(localStorage.getItem('calificacionesVoluntarios') || '[]');
    const calificacionesEstudiante = calificaciones.filter(c => c.estudiante === nombreUniversitario);
    
    // Agrupar acompañamientos por semana calendario (lunes a domingo)
    const semanas = {};
    
    completados.forEach(acomp => {
      // Obtener fecha de finalización del acompañamiento
      let fechaFin = acomp.fechaFin ? new Date(acomp.fechaFin) : null;
      
      // Si no hay fechaFin, buscar en calificaciones (solo para obtener la fecha)
      if (!fechaFin) {
        const calificacion = calificacionesEstudiante.find(c => 
          c.fecha && new Date(c.fecha) >= new Date(acomp.fechaInicio)
        );
        if (calificacion) {
          fechaFin = new Date(calificacion.fecha);
        } else {
          fechaFin = new Date(acomp.fechaInicio); // Usar fechaInicio como fallback
        }
      }
      
      // Calcular semana del año (ISO week: lunes a domingo)
      const semanaAno = getWeekNumber(fechaFin);
      const claveSemana = fechaFin.getFullYear() + '-W' + semanaAno;
      
      if (!semanas[claveSemana]) {
        semanas[claveSemana] = 0;
      }
      semanas[claveSemana]++;
    });
    
    // Contar semanas que cumplen con el mínimo de 5 acompañamientos
    // Una semana activa se considera SOLO si tiene al menos 5 acompañamientos completados
    let semanasActivas = 0;
    Object.values(semanas).forEach(count => {
      if (count >= 5) {
        semanasActivas++;
      }
    });
    
    return semanasActivas;
  }
  
  /**
   * Calcula las horas acumuladas de vinculación
   * Cada acompañamiento completado = 1 hora
   * @param {string} nombreUniversitario - Nombre del universitario
   * @returns {number} Horas acumuladas
   */
  function calcularHorasAcumuladas(nombreUniversitario) {
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const completados = acompanamientos.filter(a => 
      a.estado === 'completado' || 
      (a.estado === 'activo' && a.fechaFin)
    );
    
    // Cada acompañamiento = 1 hora
    return completados.length;
  }
  
  /**
   * Obtiene el número de semana del año (ISO week)
   * @param {Date} date - Fecha
   * @returns {number} Número de semana
   */
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
  
  /**
   * Muestra indicador visual si cumple semanas activas pero tiene calificación baja
   * Aclara que la calificación por estrellas no afecta el cumplimiento académico
   */
  function mostrarIndicadorCalificacion() {
    if (!AppState.userData) return;
    
    const semanasActivas = calcularSemanasActivas(AppState.userData.nombre);
    const calificacionPromedio = AppState.userData.calificacionPromedio || 0;
    
    // Si tiene semanas activas pero calificación menor a 3.5
    if (semanasActivas > 0 && calificacionPromedio > 0 && calificacionPromedio < 3.5) {
      // Buscar contenedor de puntaje para agregar mensaje informativo
      const puntajeContainer = document.querySelector('.puntaje-container');
      if (puntajeContainer) {
        // Verificar si ya existe el mensaje
        let indicador = puntajeContainer.querySelector('.calificacion-indicador');
        if (!indicador) {
          indicador = document.createElement('div');
          indicador.className = 'calificacion-indicador';
          indicador.innerHTML = `
            <p>La calificación por estrellas es un complemento y no afecta el cumplimiento de horas de vinculación.</p>
          `;
          const statsContainer = puntajeContainer.querySelector('.puntaje-stats');
          if (statsContainer) {
            statsContainer.parentNode.insertBefore(indicador, statsContainer.nextSibling);
          }
        }
      }
    } else {
      // Remover indicador si no aplica
      const indicador = document.querySelector('.calificacion-indicador');
      if (indicador) {
        indicador.remove();
      }
    }
  }

  /**
   * Carga el historial de puntaje
   * Diferenciar visualmente entre actividades que suman puntos vs horas/semanas
   */
  function loadHistorialPuntaje() {
    const historial = JSON.parse(localStorage.getItem('universitarioHistorial') || '[]');
    const container = document.getElementById('historial-list');
    
    if (!container) return;
    
    // Filtrar historial del estudiante actual si existe
    const historialFiltrado = AppState.userData 
      ? historial.filter(item => !item.estudiante || item.estudiante === AppState.userData.nombre)
      : historial;
    
    if (historialFiltrado.length === 0) {
      container.innerHTML = `
        <div class="historial-empty">
          <p>Aún no tienes acompañamientos registrados.</p>
          <p class="historial-empty-hint">Cuando completes uno, aparecerá aquí.</p>
        </div>
      `;
    } else {
      container.innerHTML = historialFiltrado.map(item => {
        // Diferenciar entre actividades que suman puntos y las que suman horas
        if (item.tipo === 'horas') {
          // Actividades que suman horas/semanas (cumplimiento académico)
          return `
            <div class="historial-item historial-item-horas">
              <div class="historial-item-header">
                <div class="historial-item-titulo">${item.titulo || 'Semana activa completada'}</div>
                <div class="historial-item-horas">+${item.horas || 5} horas</div>
              </div>
              <div class="historial-item-fecha">${new Date(item.fecha).toLocaleDateString()}</div>
            </div>
          `;
        } else {
          // Actividades que suman puntos (gamificación)
          return `
            <div class="historial-item historial-item-puntos">
              <div class="historial-item-header">
                <div class="historial-item-titulo">${item.titulo || 'Acompañamiento completado'}</div>
                <div class="historial-item-puntos">+${item.puntos || 0} pts</div>
              </div>
              <div class="historial-item-fecha">${new Date(item.fecha).toLocaleDateString()}</div>
            </div>
          `;
        }
      }).join('');
    }
  }

  /**
   * Inicializa la pantalla de Perfil del universitario
   */
  function initUniversitarioPerfil() {
    initBottomNavigationUni('bottom-nav-container-perfil-uni', 'perfil');
    
    loadPerfilUniversitario();
    
    document.getElementById('editar-perfil-uni-btn')?.addEventListener('click', editarPerfilUniversitario);
    document.getElementById('cerrar-sesion-uni-btn')?.addEventListener('click', cerrarSesion);
  }

  /**
   * Carga los datos del perfil del universitario
   */
  function loadPerfilUniversitario() {
    if (!AppState.userData) return;
    
    document.getElementById('perfil-uni-nombre').textContent = AppState.userData.nombre;
    document.getElementById('perfil-uni-universidad').textContent = AppState.userData.universidad;
    document.getElementById('perfil-uni-carrera').textContent = AppState.userData.carrera;
    document.getElementById('perfil-uni-zona').textContent = AppState.userData.zona;
    document.getElementById('perfil-uni-telefono').textContent = AppState.userData.telefono;
    
    // Mostrar habilidades
    const habilidadesContainer = document.getElementById('perfil-habilidades');
    if (habilidadesContainer && AppState.userData.habilidades) {
      const habilidadesLabels = {
        'compania': 'Compañía',
        'medicamentos': 'Medicamentos',
        'compras': 'Compras',
        'citas': 'Citas médicas',
        'tecnologia': 'Tecnología',
        'movilidad': 'Movilidad'
      };
      
      habilidadesContainer.innerHTML = AppState.userData.habilidades.map(h => `
        <span class="habilidad-badge">${habilidadesLabels[h] || h}</span>
      `).join('');
    }
    
    // Mostrar acompañamientos activos
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const activos = acompanamientos.filter(a => a.estado === 'activo');
    const container = document.getElementById('perfil-acompanamientos-activos');
    const acompanamientosSection = document.querySelector('#universitario-perfil .perfil-section:nth-of-type(3)');
    
    if (container) {
      if (activos.length === 0) {
        // Ocultar sección si no hay acompañamientos activos
        if (acompanamientosSection) {
          acompanamientosSection.classList.add('hidden');
        }
        container.innerHTML = '<p style="opacity: 0.7;">No tienes acompañamientos activos</p>';
      } else {
        // Mostrar sección si hay acompañamientos
        if (acompanamientosSection) {
          acompanamientosSection.classList.remove('hidden');
        }
        const adultosMayores = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
        container.innerHTML = activos.map(acomp => `
          <div class="acompanamiento-perfil-item">
            <div class="acompanamiento-perfil-nombre">${adultosMayores.nombre || 'Adulto Mayor'}</div>
            <div class="acompanamiento-perfil-detalle">
              Desde: ${new Date(acomp.fechaInicio).toLocaleDateString()}
            </div>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Edita el perfil del universitario
   */
  function editarPerfilUniversitario() {
    showPage('universitario-registro');
    initUniversitarioRegistro();
    
    // Prellenar formulario
    if (AppState.userData) {
      document.getElementById('uni-nombre').value = AppState.userData.nombre;
      document.getElementById('universidad').value = AppState.userData.universidad;
      document.getElementById('carrera').value = AppState.userData.carrera;
      document.getElementById('uni-telefono').value = AppState.userData.telefono;
      document.getElementById('uni-zona').value = AppState.userData.zona;
      
      // Marcar checkboxes de habilidades
      AppState.userData.habilidades.forEach(hab => {
        const checkbox = document.querySelector(`input[name="habilidades"][value="${hab}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  }

  /**
   * Inicializa el chat del universitario (sincronizado)
   * Verifica desvinculación bidireccional
   */
  function initUniversitarioChat() {
    initBottomNavigationUni('bottom-nav-container-chat-uni', 'chat');
    
    // Verificar si hay desvinculación reciente
    const desvinculacion = JSON.parse(localStorage.getItem('acompanamientoDesvinculado') || 'null');
    if (desvinculacion && desvinculacion.voluntario === AppState.userData?.nombre) {
      // Si este universitario fue desvinculado, mostrar mensaje y no permitir chat
      document.getElementById('chat-messages-uni').innerHTML = `
        <div class="chat-empty-state">
          <p>El acompañamiento ha sido finalizado</p>
          <p class="chat-empty-hint">Ya no puedes chatear con este adulto mayor</p>
        </div>
      `;
      document.getElementById('chat-input-container-uni').classList.add('hidden');
      return;
    }
    
    // Verificar si hay acompañamiento activo
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const activo = acompanamientos.find(a => a.estado === 'activo');
    
    if (activo) {
      const adultosMayores = JSON.parse(localStorage.getItem('adultoMayorData') || '{}');
      const infoContainer = document.getElementById('chat-adulto-info');
      
      if (infoContainer) {
        infoContainer.innerHTML = `
          <p><strong>Estás chateando con:</strong> ${adultosMayores.nombre || 'Adulto Mayor'}</p>
        `;
      }
      
      // Crear ID de conversación compartida
      const voluntarioData = AppState.userData;
      AppState.chatId = `chat_${adultosMayores.nombre || 'adulto'}_${voluntarioData.nombre}`;
      
      document.getElementById('chat-input-container-uni').classList.remove('hidden');
      loadChatMessagesUni();
      
      // Marcar mensajes como vistos
      marcarMensajesComoVistos();
      
      const sendBtn = document.getElementById('chat-send-btn-uni');
      const chatInput = document.getElementById('chat-input-uni');
      
      if (sendBtn && chatInput) {
        // Remover listeners previos
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);
        
        document.getElementById('chat-send-btn-uni').addEventListener('click', sendChatMessageUni);
        document.getElementById('chat-input-uni').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            sendChatMessageUni();
          }
        });
      }
      
      // Polling para actualizar mensajes
      if (AppState.chatInterval) clearInterval(AppState.chatInterval);
      AppState.chatInterval = setInterval(() => {
        loadChatMessagesUni();
        marcarMensajesComoVistos();
      }, 2000);
    } else {
      document.getElementById('chat-messages-uni').innerHTML = `
        <div class="chat-empty-state">
          <p>No tienes conversaciones activas</p>
          <p class="chat-empty-hint">Cuando aceptes un acompañamiento, podrás chatear aquí</p>
        </div>
      `;
    }
  }

  /**
   * Envía un mensaje de chat del universitario (sincronizado)
   */
  function sendChatMessageUni() {
    const chatInput = document.getElementById('chat-input-uni');
    const message = chatInput.value.trim();
    
    if (!message || !AppState.chatId) return;
    
    // Obtener mensajes existentes del localStorage compartido
    const messages = JSON.parse(localStorage.getItem(AppState.chatId) || '[]');
    
    // Agregar nuevo mensaje
    const nuevoMensaje = {
      id: Date.now(),
      text: message,
      sender: 'universitario',
      timestamp: new Date().toISOString(),
      estado: 'enviado',
      visto: false
    };
    
    messages.push(nuevoMensaje);
    localStorage.setItem(AppState.chatId, JSON.stringify(messages));
    
    chatInput.value = '';
    
    // Recargar mensajes
    loadChatMessagesUni();
    
    // Scroll al final
    const messagesContainer = document.getElementById('chat-messages-uni');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Carga los mensajes del chat del universitario sincronizados
   */
  function loadChatMessagesUni() {
    if (!AppState.chatId) return;
    
    const messages = JSON.parse(localStorage.getItem(AppState.chatId) || '[]');
    const container = document.getElementById('chat-messages-uni');
    
    if (!container) return;
    
    if (messages.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <p>Aún no hay mensajes.</p>
          <p class="chat-empty-hint">Puedes iniciar la conversación cuando quieras.</p>
        </div>
      `;
      return;
    }
    
    // Mostrar mensajes con burbujas, visto pequeño y hora clara
    container.innerHTML = messages.map(msg => {
      const esEnviado = msg.sender === 'universitario';
      const vistoIcon = esEnviado && msg.visto 
        ? '<svg class="icon icon-visto-small" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : esEnviado 
        ? '<svg class="icon icon-enviado-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '';
      
      const hora = new Date(msg.timestamp).toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      return `
        <div class="chat-message-wrapper ${esEnviado ? 'sent-wrapper' : 'received-wrapper'}">
          <div class="chat-message ${esEnviado ? 'sent' : 'received'}">
            <div class="message-text">${msg.text}</div>
            <div class="message-footer">
              <span class="message-time">${hora}</span>
              ${vistoIcon}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
  }

  /**
   * ============================================
   * FLUJO DOCENTE
   * ============================================
   */

  /**
   * Inicializa el registro del docente
   */
  function initDocenteRegistro() {
    const registroForm = document.getElementById('registro-docente-form');
    
    if (!registroForm) {
      console.error('Formulario de registro docente no encontrado');
      return;
    }
    
    registroForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Obtener datos del formulario
      const nombre = document.getElementById('doc-nombre').value.trim();
      const correo = document.getElementById('doc-correo').value.trim();
      const universidad = document.getElementById('doc-universidad').value;
      const password = document.getElementById('doc-password').value;
      
      // Validaciones
      if (!validateDocenteRegistroForm(nombre, correo, universidad, password)) {
        return;
      }
      
      // Guardar datos del docente
      const docenteData = {
        nombre: nombre,
        correo: correo,
        universidad: universidad,
        password: password, // En producción, esto estaría hasheado
        fechaRegistro: new Date().toISOString()
      };
      
      localStorage.setItem('docenteData', JSON.stringify(docenteData));
      
      // Navegar al panel
      showPage('docente-panel');
      initDocentePanel();
    });
  }

  /**
   * Valida el formulario de registro del docente
   */
  function validateDocenteRegistroForm(nombre, correo, universidad, password) {
    let isValid = true;
    
    // Limpiar errores previos
    document.querySelectorAll('[id^="error-doc"]').forEach(el => el.textContent = '');
    
    // Validar nombre
    if (!nombre || nombre.length < 2) {
      document.getElementById('error-doc-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    // Validar correo institucional
    // NOTA: Validación institucional se activará en producción
    // Por ahora, aceptamos cualquier correo con formato válido (modo prueba)
    const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correo || !correoRegex.test(correo)) {
      document.getElementById('error-doc-correo').textContent = 'Ingresa un correo válido';
      isValid = false;
    }
    
    // Validar universidad
    if (!universidad) {
      document.getElementById('error-doc-universidad').textContent = 'Selecciona una universidad';
      isValid = false;
    }
    
    // Validar contraseña
    if (!password || password.length < 6) {
      document.getElementById('error-doc-password').textContent = 'La contraseña debe tener al menos 6 caracteres';
      isValid = false;
    }
    
    return isValid;
  }

  /**
   * Inicializa el flujo del Docente
   */
  function initDocenteFlow() {
    // El docente va directo al panel después del registro
    showPage('docente-panel');
    initDocentePanel();
  }

  /**
   * Inicializa el panel administrativo del docente
   */
  function initDocentePanel() {
    // Verificar que el panel existe
    const panel = document.getElementById('docente-panel');
    if (!panel) {
      console.error('Panel docente no encontrado');
      return;
    }
    
    // Asegurar que el panel esté visible
    panel.classList.remove('hidden');
    
    // Cargar resumen general
    loadDocenteResumen();
    
    // Cargar lista de estudiantes
    loadEstudiantes();
    
    // Filtro de búsqueda
    const filtroEstudiantes = document.getElementById('filtro-estudiantes');
    if (filtroEstudiantes) {
      filtroEstudiantes.addEventListener('input', function() {
        filtrarEstudiantes(this.value);
      });
    }
    
    // Botón cerrar detalle
    document.getElementById('cerrar-detalle-btn')?.addEventListener('click', function() {
      document.getElementById('estudiante-detalle-section').classList.add('hidden');
    });
    
    // Cargar actividades recientes
    loadActividadesRecientes();
  }

  /**
   * Carga el resumen general del panel docente
   */
  function loadDocenteResumen() {
    // Obtener todos los estudiantes registrados
    const estudiantes = getAllEstudiantes();
    
    // Calcular estadísticas
    const totalEstudiantes = estudiantes.length;
    let totalAcompanamientos = 0;
    let totalPuntaje = 0;
    
    estudiantes.forEach(est => {
      totalAcompanamientos += est.acompanamientos || 0;
      totalPuntaje += est.puntaje || 0;
    });
    
    const puntajePromedio = totalEstudiantes > 0 ? Math.round(totalPuntaje / totalEstudiantes) : 0;
    
    // Actualizar UI
    document.getElementById('stat-total-estudiantes').textContent = totalEstudiantes;
    document.getElementById('stat-total-acompanamientos').textContent = totalAcompanamientos;
    document.getElementById('stat-puntaje-promedio').textContent = puntajePromedio;
  }

  /**
   * Obtiene todos los estudiantes registrados
   */
  function getAllEstudiantes() {
    // En una implementación real, esto vendría de una base de datos
    // Por ahora, obtenemos del localStorage
    const universitarioData = localStorage.getItem('universitarioData');
    
    if (universitarioData) {
      return [JSON.parse(universitarioData)];
    }
    
    // Si hay múltiples estudiantes, se podrían almacenar en un array
    // Por simplicidad, retornamos un array con el estudiante actual si existe
    return universitarioData ? [JSON.parse(universitarioData)] : [];
  }

  /**
   * Carga la lista de estudiantes con información completa organizada
   */
  function loadEstudiantes() {
    const estudiantes = getAllEstudiantes();
    const container = document.getElementById('estudiantes-list');
    
    if (!container) return;
    
    if (estudiantes.length === 0) {
      container.innerHTML = `
        <div class="estudiantes-empty">
          <p>No hay estudiantes registrados aún</p>
          <p class="estudiantes-empty-hint">Los estudiantes aparecerán aquí cuando se registren</p>
        </div>
      `;
    } else {
      container.innerHTML = estudiantes.map(est => {
        // Calcular semanas activas y horas acumuladas
        const semanasActivas = calcularSemanasActivas(est.nombre);
        const horasAcumuladas = calcularHorasAcumuladas(est.nombre);
        const acompanamientos = est.acompanamientos || 0;
        
        return `
        <div class="estudiante-card" onclick="mostrarDetalleEstudiante('${est.nombre}')">
          <div class="estudiante-card-header">
            <div class="estudiante-nombre">${est.nombre}</div>
            <div class="estudiante-puntaje">${est.puntaje || 0} pts</div>
          </div>
          <div class="estudiante-info">
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Acompañamientos realizados:</span>
              <span>${acompanamientos}</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Semanas activas cumplidas:</span>
              <span>${semanasActivas}</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Horas acumuladas:</span>
              <span>${horasAcumuladas} horas</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Calificación promedio:</span>
              <span>${(est.calificacionPromedio || 0).toFixed(1)} <svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></span>
            </div>
          </div>
        </div>
      `;
      }).join('');
    }
  }
  
  /**
   * Calcula el porcentaje de cumplimiento de acompañamientos
   * Basado en semanas activas cumplidas vs semanas esperadas
   * @param {string} nombreUniversitario - Nombre del universitario
   * @param {number} semanasActivas - Número de semanas activas cumplidas
   * @returns {number} Porcentaje de cumplimiento
   */
  function calcularPorcentajeCumplimiento(nombreUniversitario, semanasActivas) {
    // Obtener fecha de registro del estudiante
    const estudiantes = getAllEstudiantes();
    const estudiante = estudiantes.find(e => e.nombre === nombreUniversitario);
    
    if (!estudiante || !estudiante.fechaRegistro) return 0;
    
    // Calcular semanas transcurridas desde el registro
    const fechaRegistro = new Date(estudiante.fechaRegistro);
    const ahora = new Date();
    const diasTranscurridos = Math.floor((ahora - fechaRegistro) / (1000 * 60 * 60 * 24));
    const semanasTranscurridas = Math.floor(diasTranscurridos / 7);
    
    if (semanasTranscurridas === 0) return 0;
    
    // Calcular porcentaje: (semanas activas / semanas transcurridas) * 100
    const porcentaje = Math.round((semanasActivas / semanasTranscurridas) * 100);
    return Math.min(100, Math.max(0, porcentaje)); // Limitar entre 0 y 100
  }

  /**
   * Filtra estudiantes por nombre
   */
  function filtrarEstudiantes(busqueda) {
    const estudiantes = getAllEstudiantes();
    const container = document.getElementById('estudiantes-list');
    
    if (!container) return;
    
    const filtrados = busqueda.trim() === '' 
      ? estudiantes 
      : estudiantes.filter(est => 
          est.nombre.toLowerCase().includes(busqueda.toLowerCase())
        );
    
    if (filtrados.length === 0) {
      container.innerHTML = `
        <div class="estudiantes-empty">
          <p>No se encontraron estudiantes</p>
        </div>
      `;
    } else {
      container.innerHTML = filtrados.map(est => {
        // Calcular semanas activas y horas acumuladas
        const semanasActivas = calcularSemanasActivas(est.nombre);
        const horasAcumuladas = calcularHorasAcumuladas(est.nombre);
        
        return `
        <div class="estudiante-card" onclick="mostrarDetalleEstudiante('${est.nombre}')">
          <div class="estudiante-card-header">
            <div class="estudiante-nombre">${est.nombre}</div>
            <div class="estudiante-puntaje">${est.puntaje || 0} pts</div>
          </div>
          <div class="estudiante-info">
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Acompañamientos realizados:</span>
              <span>${est.acompanamientos || 0}</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Semanas activas cumplidas:</span>
              <span>${semanasActivas}</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Horas acumuladas:</span>
              <span>${horasAcumuladas} horas</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Calificación promedio:</span>
              <span>${(est.calificacionPromedio || 0).toFixed(1)} <svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></span>
            </div>
          </div>
        </div>
      `;
      }).join('');
    }
  }

  /**
   * Muestra el detalle de un estudiante
   */
  window.mostrarDetalleEstudiante = function(nombreEstudiante) {
    const estudiantes = getAllEstudiantes();
    const estudiante = estudiantes.find(e => e.nombre === nombreEstudiante);
    
    if (!estudiante) return;
    
    // Mostrar sección de detalle
    const detalleSection = document.getElementById('estudiante-detalle-section');
    detalleSection.classList.remove('hidden');
    
    // Actualizar información académica
    document.getElementById('estudiante-detalle-nombre').textContent = estudiante.nombre;
    document.getElementById('detalle-universidad').textContent = estudiante.universidad;
    document.getElementById('detalle-carrera').textContent = estudiante.carrera;
    document.getElementById('detalle-zona').textContent = estudiante.zona;
    document.getElementById('detalle-fecha-registro').textContent = 
      new Date(estudiante.fechaRegistro).toLocaleDateString();
    
    // Calcular semanas activas y horas acumuladas
    const semanasActivas = calcularSemanasActivas(estudiante.nombre);
    const horasAcumuladas = calcularHorasAcumuladas(estudiante.nombre);
    
    // Actualizar estadísticas
    document.getElementById('detalle-puntaje').textContent = estudiante.puntaje || 0;
    document.getElementById('detalle-acompanamientos').textContent = estudiante.acompanamientos || 0;
    document.getElementById('detalle-calificacion').textContent = 
      (estudiante.calificacionPromedio || 0).toFixed(1);
    
    // Actualizar semanas activas si existe el elemento
    const detalleSemanas = document.getElementById('detalle-semanas');
    if (detalleSemanas) {
      detalleSemanas.textContent = semanasActivas;
    }
    
    // Actualizar horas acumuladas si existe el elemento
    const detalleHoras = document.getElementById('detalle-horas');
    if (detalleHoras) {
      detalleHoras.textContent = horasAcumuladas + ' horas';
    }
    
    // Mostrar estado del cumplimiento de la vinculación (160 horas = 32 semanas activas)
    const horasRequeridas = 160;
    const horasRestantes = Math.max(0, horasRequeridas - horasAcumuladas);
    const cumplimientoPorcentaje = Math.round((horasAcumuladas / horasRequeridas) * 100);
    const detalleCumplimiento = document.getElementById('detalle-cumplimiento');
    if (detalleCumplimiento) {
      detalleCumplimiento.textContent = `${cumplimientoPorcentaje}% (${horasAcumuladas}/${horasRequeridas} horas)`;
    }
    
    // Cargar historial
    loadHistorialEstudiante(estudiante);
    
    // Cargar comentarios
    loadComentariosEstudiante(estudiante);
    
    // Scroll al detalle
    detalleSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Carga el historial de actividades de un estudiante
   */
  function loadHistorialEstudiante(estudiante) {
    const historial = JSON.parse(localStorage.getItem('universitarioHistorial') || '[]');
    const container = document.getElementById('detalle-historial');
    
    if (!container) return;
    
    // Filtrar historial del estudiante (por nombre)
    const historialEstudiante = historial.filter(h => 
      h.estudiante === estudiante.nombre || historial.length === 0
    );
    
    if (historialEstudiante.length === 0) {
      container.innerHTML = `
        <div class="historial-empty">
          <p>No hay actividades registradas</p>
        </div>
      `;
    } else {
      container.innerHTML = historialEstudiante.map(item => `
        <div class="historial-detalle-item">
          <div class="historial-detalle-titulo">${item.titulo || 'Actividad'}</div>
          <div class="historial-detalle-fecha">
            ${new Date(item.fecha).toLocaleDateString()} - +${item.puntos || 0} puntos
          </div>
        </div>
      `).join('');
    }
  }

  /**
   * Carga los comentarios de adultos mayores sobre un estudiante
   */
  function loadComentariosEstudiante(estudiante) {
    // Obtener calificaciones del localStorage
    const calificacion = JSON.parse(localStorage.getItem('adultoMayorCalificacion') || 'null');
    const container = document.getElementById('detalle-comentarios');
    
    if (!container) return;
    
    // En una implementación real, esto buscaría todas las calificaciones de este estudiante
    // Por ahora, mostramos la calificación si existe y coincide con el estudiante
    if (calificacion && calificacion.estudiante === estudiante.nombre) {
      container.innerHTML = `
        <div class="comentario-item">
          <div class="comentario-header">
            <div class="comentario-adulto">Adulto Mayor</div>
            <div class="comentario-rating">
              ${Array(calificacion.rating || 0).fill(0).map(() => '<svg class="icon icon-inline" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>').join('')}
            </div>
          </div>
          ${calificacion.comentario ? `
            <div class="comentario-texto">${calificacion.comentario}</div>
          ` : ''}
          <div class="comentario-fecha">
            ${new Date(calificacion.fecha).toLocaleDateString()}
          </div>
        </div>
      `;
    } else {
      // No hay comentarios reales - mostrar solo datos generados por usuarios
      // Obtener todas las calificaciones del estudiante desde localStorage
      const todasCalificaciones = JSON.parse(localStorage.getItem('calificacionesVoluntarios') || '[]');
      const calificacionesEstudiante = todasCalificaciones.filter(c => c.estudiante === estudiante.nombre);
      
      if (calificacionesEstudiante.length === 0) {
        container.innerHTML = `
          <div class="comentarios-empty">
            <p>No hay comentarios aún</p>
            <p class="comentarios-empty-hint">Los comentarios aparecerán cuando los adultos mayores califiquen</p>
          </div>
        `;
      } else {
        container.innerHTML = calificacionesEstudiante.map(cal => `
          <div class="comentario-item">
            <div class="comentario-header">
              <div class="comentario-adulto">${cal.adultoMayor || 'Adulto Mayor'}</div>
              <div class="comentario-rating">
                ${Array(cal.rating || 0).fill(0).map(() => '<svg class="icon icon-inline" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>').join('')}
              </div>
            </div>
            ${cal.comentario ? `
              <div class="comentario-texto">${cal.comentario}</div>
            ` : ''}
            <div class="comentario-fecha">
              ${new Date(cal.fecha).toLocaleDateString()}
            </div>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Carga las actividades recientes agrupadas por estudiante
   */
  function loadActividadesRecientes() {
    const historial = JSON.parse(localStorage.getItem('universitarioHistorial') || '[]');
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const calificaciones = JSON.parse(localStorage.getItem('calificacionesVoluntarios') || '[]');
    const estudiantes = getAllEstudiantes();
    const container = document.getElementById('actividades-recientes');
    
    if (!container) return;
    
    if (estudiantes.length === 0) {
      container.innerHTML = `
        <div class="actividades-empty">
          <p>No hay estudiantes registrados aún</p>
          <p class="actividades-empty-hint">Las actividades de los estudiantes aparecerán aquí</p>
        </div>
      `;
      return;
    }
    
    // Agrupar actividades por estudiante
    const actividadesPorEstudiante = {};
    
    estudiantes.forEach(est => {
      actividadesPorEstudiante[est.nombre] = {
        estudiante: est,
        actividades: [],
        acompanamientosActivos: [],
        acompanamientosCompletados: [],
        calificacionPromedio: est.calificacionPromedio || 0,
        comentarios: []
      };
    });
    
    // Agregar actividades del historial
    historial.forEach(item => {
      const estudiante = item.estudiante || estudiantes[0]?.nombre;
      if (actividadesPorEstudiante[estudiante]) {
        actividadesPorEstudiante[estudiante].actividades.push({
          tipo: 'historial',
          descripcion: item.titulo || 'Actividad completada',
          fecha: item.fecha,
          puntos: item.puntos || 0
        });
      }
    });
    
    // Agregar acompañamientos activos y completados
    acompanamientos.forEach(acomp => {
      // Buscar el estudiante asociado (se asume que hay un estudiante activo)
      const estudiante = estudiantes[0]?.nombre || 'Estudiante';
      if (actividadesPorEstudiante[estudiante]) {
        if (acomp.estado === 'activo') {
          actividadesPorEstudiante[estudiante].acompanamientosActivos.push(acomp);
        } else if (acomp.estado === 'completado' || acomp.estado === 'anulado') {
          actividadesPorEstudiante[estudiante].acompanamientosCompletados.push(acomp);
        }
      }
    });
    
    // Agregar calificaciones como comentarios
    calificaciones.forEach(cal => {
      const estudiante = cal.estudiante;
      if (actividadesPorEstudiante[estudiante]) {
        actividadesPorEstudiante[estudiante].comentarios.push(cal);
      }
    });
    
    // Ordenar comentarios por fecha (más recientes primero) y tomar solo los últimos 3
    Object.keys(actividadesPorEstudiante).forEach(nombre => {
      actividadesPorEstudiante[nombre].comentarios.sort((a, b) => 
        new Date(b.fecha) - new Date(a.fecha)
      );
      actividadesPorEstudiante[nombre].comentarios = 
        actividadesPorEstudiante[nombre].comentarios.slice(0, 3);
    });
    
    // Renderizar actividades agrupadas por estudiante
    container.innerHTML = estudiantes.map(est => {
      const data = actividadesPorEstudiante[est.nombre];
      if (!data) return '';
      
      const semanasActivas = calcularSemanasActivas(est.nombre);
      const horasAcumuladas = calcularHorasAcumuladas(est.nombre);
      const acompanamientosCompletados = data.acompanamientosCompletados.length;
      const acompanamientosActivos = data.acompanamientosActivos.length;
      
      return `
        <div class="actividad-estudiante-group">
          <div class="actividad-estudiante-header">
            <div class="actividad-estudiante-nombre">${est.nombre}</div>
            <div class="actividad-estudiante-stats">
              <span>Acompañamientos: ${est.acompanamientos || 0}</span>
              <span>Semanas activas: ${semanasActivas}</span>
              <span>Horas: ${horasAcumuladas}</span>
              <span>Calificación: ${data.calificacionPromedio.toFixed(1)} ⭐</span>
            </div>
          </div>
          ${acompanamientosActivos > 0 ? `
            <div class="actividad-info">
              <strong>Acompañamientos activos:</strong> ${acompanamientosActivos}
            </div>
          ` : ''}
          ${acompanamientosCompletados > 0 ? `
            <div class="actividad-info">
              <strong>Acompañamientos completados y calificados:</strong> ${acompanamientosCompletados}
            </div>
          ` : ''}
          ${data.comentarios.length > 0 ? `
            <div class="actividad-comentarios">
              <strong>Comentarios recientes:</strong>
              ${data.comentarios.map(com => `
                <div class="actividad-comentario-item">
                  <div class="actividad-comentario-rating">
                    ${Array(com.rating || 0).fill(0).map(() => '⭐').join('')}
                  </div>
                  ${com.comentario ? `<div class="actividad-comentario-texto">${com.comentario}</div>` : ''}
                  <div class="actividad-comentario-fecha">${new Date(com.fecha).toLocaleDateString()}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }
});
