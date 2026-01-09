/**
 * COMPONENTE: Botón de Retroceso Interno
 * Agrega botones de retroceso en las vistas que lo necesiten
 */

function addBackButton(container) {
  // Verificar si ya existe un botón de retroceso
  if (container.querySelector('.btn-back-internal')) {
    return;
  }
  
  // Crear botón de retroceso
  const backButton = document.createElement('button');
  backButton.className = 'btn-back btn-back-internal';
  backButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
    <span>Volver</span>
  `;
  
  backButton.addEventListener('click', () => {
    if (window.navigationManager) {
      window.navigationManager.goBack();
    }
  });
  
  // Insertar al inicio del contenedor o después del header
  const header = container.querySelector('.page-header');
  const content = container.querySelector('.page-content') || container.querySelector('.perfil-container') || container.querySelector('.chat-container');
  
  if (header) {
    // Insertar antes del header o dentro del header al inicio
    const headerContent = header.querySelector('.page-title') || header.firstElementChild;
    if (headerContent) {
      header.insertBefore(backButton, headerContent);
    } else {
      header.insertBefore(backButton, header.firstChild);
    }
  } else if (content) {
    container.insertBefore(backButton, content);
  } else {
    container.insertBefore(backButton, container.firstChild);
  }
}

window.addBackButton = addBackButton;

