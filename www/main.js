import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

/**
 * PULSEVISION - Lógica principal de la aplicación
 * Maneja la transición del splash screen, selección de roles y navegación
 */

/** Archivos de documentos capturados (cámara nativa o input file en web) */
const docPhotoFiles = {};
let locationWatchIsNative = false;
let geoPermissionsRequested = false;

function getCapacitor() {
  return typeof window !== 'undefined' ? window.Capacitor : null;
}

const AppState = {
  currentRole: null,
  currentPage: null,
  userData: null,
  colibriGuide: null,
  bottomNav: null,
  voluntarioSeleccionado: null,
  tipoAyudaSeleccionado: null,
  perfilSolicitudActivaId: null
};
window.AppState = AppState;

let authStateResolved = false;
let initialAuthUser = null;
let pendingVerificationCredentials = null;
let pendingLoginMessage = null;
let emailVerificationInitialized = false;
let registrationInProgress = false;
let awaitingEmailVerification = false;
let solicitudesPendientesCache = [];
let solicitudesProgramadasCache = [];
let solicitudesDisponiblesUnsubscribe = null;
let solicitudesProgramadasUnsubscribe = null;
let solicitudesActivasUnsubscribe = null;
let acompanamientosActivosUnsubscribe = null;
let recordatorioIntervalId = null;
let recordatorioSolicitudesCache = [];
let historialAcompanamientosUnsubscribe = null;
let acompanamientosAnterioresUnsubscribe = null;
let puntajeSolicitudesUnsubscribe = null;
let chatMensajesUnsubscribe = null;
let chatBadgeSolicitudesUnsubscribe = null;
let chatBadgeMensajesUnsubscribe = null;
let chatBadgeSolicitudId = null;
let chatBadgeUnreadCount = 0;
let albumFotosUnsubscribe = null;
let albumCurrentSolicitudId = null;
let albumCanUpload = false;
/** Evita aplicar datos de una suscripción vieja al cambiar de solicitud */
let chatSubscribeGeneration = 0;
let albumSubscribeGeneration = 0;
let aprobacionUnsubscribe = null;
let adminPendientesUnsubscribe = null;
let adminAprobadosUnsubscribe = null;
let docenteEstudiantesUnsubscribe = null;
let docenteSolicitudesUnsubscribe = null;
let docenteEstudiantesCache = [];
let docenteSolicitudesFinalizadasCache = [];
let docenteFiltroBusqueda = '';
let docenteDetalleEstudianteId = null;

/** Seguimiento GPS en vivo (en_camino / en_curso) */
let locationWatchId = null;
let locationTrackedSolicitudId = null;
let locationWatchField = null; // 'ubicacionVoluntario' | 'ubicacionAdultoMayor'
let lastLocationWriteAt = 0;
const LOCATION_WRITE_MIN_INTERVAL_MS = 8000;
const ESTADOS_UBICACION_EN_VIVO = ['en_camino', 'en_curso'];

/** Mapas en vivo: clave "adulto-{id}" | "uni-{id}" → { map, markers, container, points } */
const liveMapsByKey = {};
let lastAdultoSolicitudesStructureKey = null;
let lastUniAcompanamientosStructureKey = null;

const TIPO_AYUDA_LABELS = {
  compania: 'Compañía',
  medicamentos: 'Medicamentos',
  compras: 'Compras',
  citas: 'Citas médicas',
  tecnologia: 'Tecnología',
  otras: 'Otras necesidades'
};

/** Estados de acompañamiento activos (no finalizados) */
const ESTADOS_ACOMPANAMIENTO_ACTIVOS = ['aceptada', 'en_camino', 'en_curso'];
/** Estados en los que el álbum del menú permite ver/subir (acompañamiento activo) */
const ESTADOS_ALBUM_SUBIDA = ['en_camino', 'en_curso'];

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  programada: 'Programada',
  aceptada: 'Aceptada',
  en_camino: 'En camino',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
  activo: 'Activa'
};

const RECORDATORIO_MINUTOS = 30;
const RECORDATORIO_INTERVAL_MS = 60 * 1000;

function getFechaProgramada(sol) {
  if (!sol?.fechaProgramada) return null;
  if (sol.fechaProgramada.toDate) return sol.fechaProgramada.toDate();
  const date = new Date(sol.fechaProgramada);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatFechaHoraProgramada(date) {
  if (!date) return '—';
  return date.toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getAgendaGroupLabel(date) {
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function getAgendaSortDate(sol) {
  const programada = getFechaProgramada(sol);
  if (sol.esProgramada && programada) return programada;
  if (sol.fechaAceptacion?.toDate) return sol.fechaAceptacion.toDate();
  return getFechaFromSolicitud(sol);
}

function groupByAgendaDate(solicitudes) {
  const groups = new Map();
  solicitudes.forEach((sol) => {
    const date = getAgendaSortDate(sol);
    const key = startOfLocalDay(date).getTime();
    if (!groups.has(key)) {
      groups.set(key, {
        label: getAgendaGroupLabel(date),
        sortKey: key,
        items: []
      });
    }
    groups.get(key).items.push(sol);
  });
  return [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);
}

function buildFechaProgramadaFromInputs(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function stopRecordatorioAcompanamientos() {
  if (recordatorioIntervalId) {
    clearInterval(recordatorioIntervalId);
    recordatorioIntervalId = null;
  }
  recordatorioSolicitudesCache = [];
  document.querySelectorAll('.recordatorio-banner').forEach((el) => {
    el.classList.add('hidden');
  });
}

function updateRecordatorioCache(solicitudes) {
  recordatorioSolicitudesCache = (solicitudes || []).filter((sol) =>
    sol.estado === 'aceptada' && sol.esProgramada && getFechaProgramada(sol)
  );
  checkRecordatorioAcompanamientos();
}

function checkRecordatorioAcompanamientos() {
  const now = Date.now();
  const windowMs = RECORDATORIO_MINUTOS * 60 * 1000;
  const proxima = recordatorioSolicitudesCache
    .map((sol) => ({ sol, fecha: getFechaProgramada(sol) }))
    .filter(({ fecha }) => {
      if (!fecha) return false;
      const diff = fecha.getTime() - now;
      return diff >= 0 && diff <= windowMs;
    })
    .sort((a, b) => a.fecha - b.fecha)[0];

  const isAdulto = AppState.currentRole === 'adulto-mayor';
  const isUni = AppState.currentRole === 'universitario';
  const bannerAdulto = document.getElementById('recordatorio-banner-adulto');
  const textAdulto = document.getElementById('recordatorio-banner-adulto-text');
  const bannerUni = document.getElementById('recordatorio-banner-uni');
  const textUni = document.getElementById('recordatorio-banner-uni-text');

  if (!proxima) {
    bannerAdulto?.classList.add('hidden');
    bannerUni?.classList.add('hidden');
    return;
  }

  if (isAdulto && bannerAdulto && textAdulto) {
    const nombre = proxima.sol.universitarioNombre || 'tu voluntario';
    textAdulto.textContent =
      `Tu acompañamiento programado con ${nombre} es en menos de 30 minutos`;
    bannerAdulto.classList.remove('hidden');
  } else {
    bannerAdulto?.classList.add('hidden');
  }

  if (isUni && bannerUni && textUni) {
    const nombre = proxima.sol.adultoMayorNombre || 'el adulto mayor';
    textUni.textContent =
      `Tu acompañamiento programado con ${nombre} es en menos de 30 minutos`;
    bannerUni.classList.remove('hidden');
  } else {
    bannerUni?.classList.add('hidden');
  }
}

function startRecordatorioAcompanamientos() {
  if (recordatorioIntervalId) clearInterval(recordatorioIntervalId);
  checkRecordatorioAcompanamientos();
  recordatorioIntervalId = setInterval(checkRecordatorioAcompanamientos, RECORDATORIO_INTERVAL_MS);
}

/**
 * Genera un código aleatorio de 4 dígitos (string, con ceros a la izquierda)
 */
function generarCodigoConfirmacion() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function stopAlbumListener() {
  if (albumFotosUnsubscribe) {
    albumFotosUnsubscribe();
    albumFotosUnsubscribe = null;
  }
  albumCurrentSolicitudId = null;
}

function getRemitenteRolAlbum() {
  if (AppState.userData?.rol === 'adultoMayor' || AppState.currentRole === 'adulto-mayor') {
    return 'adultoMayor';
  }
  return 'universitario';
}

function crearNombreArchivoAlbum(file) {
  const safeName = (file.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
}

function stopAprobacionListener() {
  if (aprobacionUnsubscribe) {
    aprobacionUnsubscribe();
    aprobacionUnsubscribe = null;
  }
}

function stopAdminListeners() {
  if (adminPendientesUnsubscribe) {
    adminPendientesUnsubscribe();
    adminPendientesUnsubscribe = null;
  }
  if (adminAprobadosUnsubscribe) {
    adminAprobadosUnsubscribe();
    adminAprobadosUnsubscribe = null;
  }
}

function stopDocenteListeners() {
  if (docenteEstudiantesUnsubscribe) {
    docenteEstudiantesUnsubscribe();
    docenteEstudiantesUnsubscribe = null;
  }
  if (docenteSolicitudesUnsubscribe) {
    docenteSolicitudesUnsubscribe();
    docenteSolicitudesUnsubscribe = null;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ROL_LABELS = {
  adultoMayor: 'Adulto Mayor',
  universitario: 'Universitario',
  docente: 'Docente',
  admin: 'Administrador'
};

const DOC_LABELS = {
  cedula: 'Cédula',
  rostro: 'Foto de rostro',
  carnetUniversitario: 'Carnet universitario',
  credencialDocente: 'Credencial docente'
};

/**
 * Teléfono de emergencia del perfil actual.
 * Adulto mayor: campo "telefono". Universitario: "telefonoEmergencia".
 */
function getTelefonoEmergencia(userData) {
  if (!userData) return '';
  if (userData.rol === 'universitario') {
    return String(userData.telefonoEmergencia || '').trim();
  }
  return String(userData.telefono || userData.telefonoEmergencia || '').trim();
}

function normalizeTelHref(numero) {
  return String(numero || '').replace(/[^\d+]/g, '');
}

function setupEmergenciaCallButton(buttonId, emptyId) {
  const btn = document.getElementById(buttonId);
  const emptyEl = document.getElementById(emptyId);
  if (!btn) return;

  const numero = getTelefonoEmergencia(AppState.userData);

  if (!numero) {
    btn.classList.add('hidden');
    if (emptyEl) {
      emptyEl.textContent = 'No has registrado un contacto de emergencia';
      emptyEl.classList.remove('hidden');
    }
    return;
  }

  btn.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  if (btn.dataset.bound !== 'true') {
    btn.dataset.bound = 'true';
    btn.addEventListener('click', function() {
      const tel = getTelefonoEmergencia(AppState.userData);
      if (!tel) return;
      if (confirm(`¿Llamar a tu contacto de emergencia al ${tel}?`)) {
        window.location.href = `tel:${normalizeTelHref(tel)}`;
      }
    });
  }
}

async function uploadDocumentosRegistro(uid, documentosMap) {
  const documentos = {};
  for (const [nombreDoc, file] of Object.entries(documentosMap)) {
    if (!file) continue;
    const storageRef = ref(window.storage, `usuarios/${uid}/documentos/${nombreDoc}.jpg`);
    await uploadBytes(storageRef, file);
    documentos[nombreDoc] = await getDownloadURL(storageRef);
  }
  return documentos;
}

function isUsuarioAprobado(userData) {
  return userData?.estadoAprobacion === 'aprobado';
}

/**
 * Número de semana ISO a partir de una fecha
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Calcula puntaje, bonos, semanas activas y promedio desde solicitudes finalizadas
 * Meta de ejemplo: 2 acompañamientos/semana (≈ 20 puntos)
 */
function calcularPuntajeUniversitario(solicitudesFinalizadas) {
  const finalizadas = (solicitudesFinalizadas || []).filter((s) => s.estado === 'finalizado');

  const puntosAcompanamientos = finalizadas.length * 10;
  const puntosBono = finalizadas.filter((s) => Number(s.calificacion) === 5).length * 5;
  const puntosTotales = puntosAcompanamientos + puntosBono;

  const conCalificacion = finalizadas.filter(
    (s) => typeof s.calificacion === 'number' && s.calificacion >= 1 && s.calificacion <= 5
  );
  const calificacionPromedio = conCalificacion.length
    ? conCalificacion.reduce((sum, s) => sum + s.calificacion, 0) / conCalificacion.length
    : 0;

  const semanas = {};
  finalizadas.forEach((sol) => {
    let fechaFin = null;
    if (sol.fechaFin?.toDate) fechaFin = sol.fechaFin.toDate();
    else if (sol.fechaFin) fechaFin = new Date(sol.fechaFin);
    else if (sol.fechaInicio?.toDate) fechaFin = sol.fechaInicio.toDate();
    else if (sol.fechaInicio) fechaFin = new Date(sol.fechaInicio);
    if (!fechaFin || Number.isNaN(fechaFin.getTime())) return;

    const clave = `${fechaFin.getFullYear()}-W${getWeekNumber(fechaFin)}`;
    if (!semanas[clave]) {
      semanas[clave] = { count: 0, bono: 0 };
    }
    semanas[clave].count += 1;
    if (Number(sol.calificacion) === 5) {
      semanas[clave].bono += 5;
    }
  });

  let semanasActivas = 0;
  Object.values(semanas).forEach((semana) => {
    const puntosSemana = semana.count * 10 + semana.bono;
    // 2+ acompañamientos, o el equivalente en puntos (≥ 20) con bono
    if (semana.count >= 2 || puntosSemana >= 20) {
      semanasActivas += 1;
    }
  });

  return {
    puntosAcompanamientos,
    puntosBono,
    puntosTotales,
    semanasActivas,
    calificacionPromedio,
    acompanamientos: finalizadas.length,
    finalizadas
  };
}

/**
 * Clave de estructura UI (ignora ubicación para no re-renderizar el mapa todo el tiempo)
 */
function getSolicitudesStructureKey(solicitudes) {
  return solicitudes
    .map((s) => `${s.id}:${s.estado}:${s.codigoConfirmacion || ''}:${s.universitarioNombre || ''}:${s.adultoMayorNombre || ''}`)
    .join('|');
}

function hasValidUbicacion(ubicacion) {
  if (!ubicacion) return false;
  const lat = Number(ubicacion.lat);
  const lng = Number(ubicacion.lng);
  return !Number.isNaN(lat) && !Number.isNaN(lng);
}

function isNativePlatform() {
  try {
    const Capacitor = getCapacitor();
    return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Toma foto con cámara nativa (Capacitor) y la convierte a File para Storage
 */
async function takePhotoWithNativeCamera(filenameBase = 'foto') {
  const { Camera } = window.Capacitor.Plugins;
  if (!Camera?.getPhoto) {
    throw new Error('Plugin Camera no disponible');
  }

  const photo = await Camera.getPhoto({
    resultType: 'uri',
    source: 'CAMERA',
    quality: 80
  });

  const rawUrl = photo.webPath || photo.path;
  if (!rawUrl) {
    throw new Error('No se obtuvo la URI de la foto');
  }

  const Capacitor = getCapacitor();
  const url = Capacitor?.convertFileSrc ? Capacitor.convertFileSrc(rawUrl) : rawUrl;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('No se pudo leer la foto capturada');
  }

  const blob = await response.blob();
  const ext = (photo.format || 'jpeg').replace(/^\./, '');
  const mime = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return new File([blob], `${filenameBase}.${ext}`, { type: mime });
}

function getDocPhotoFile(inputId) {
  if (docPhotoFiles[inputId] instanceof File) {
    return docPhotoFiles[inputId];
  }
  const input = document.getElementById(inputId);
  return input?.files?.[0] || null;
}

function setDocPhotoStatus(inputId, text) {
  const statusEl = document.getElementById(`status-${inputId}`);
  if (statusEl) statusEl.textContent = text || '';
}

function bindDocPhotoCaptureControls() {
  document.querySelectorAll('[data-doc-camera-for]').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';

    const inputId = btn.getAttribute('data-doc-camera-for');
    const input = document.getElementById(inputId);
    if (!input) return;

    if (isNativePlatform()) {
      input.classList.add('hidden');
      btn.classList.remove('hidden');
      btn.addEventListener('click', async () => {
        try {
          const file = await takePhotoWithNativeCamera(inputId);
          docPhotoFiles[inputId] = file;
          setDocPhotoStatus(inputId, 'Foto lista');
          const errorEl = document.getElementById(`error-${inputId}`);
          if (errorEl) errorEl.textContent = '';
        } catch (error) {
          if (error?.message === 'User cancelled photos app') return;
          console.error('Error al capturar foto con cámara:', error);
          alert('No se pudo tomar la foto. Intenta de nuevo.');
        }
      });
    } else {
      btn.classList.add('hidden');
      input.classList.remove('hidden');
      input.addEventListener('change', () => {
        const file = input.files?.[0] || null;
        if (file) {
          docPhotoFiles[inputId] = file;
          setDocPhotoStatus(inputId, `Archivo: ${file.name}`);
        } else {
          delete docPhotoFiles[inputId];
          setDocPhotoStatus(inputId, '');
        }
      });
    }
  });
}

function stopLocationWatch() {
  if (locationWatchId != null) {
    if (locationWatchIsNative) {
      const { Geolocation } = window.Capacitor?.Plugins || {};
      if (Geolocation?.clearWatch) {
        Geolocation.clearWatch({ id: locationWatchId }).catch((error) => {
          console.error('Error al detener watch nativo de ubicación:', error);
        });
      }
    } else if (navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId);
    }
  }
  locationWatchId = null;
  locationWatchIsNative = false;
  locationTrackedSolicitudId = null;
  locationWatchField = null;
  lastLocationWriteAt = 0;
}

function stopVoluntarioLocationWatch() {
  stopLocationWatch();
}

function clearLiveMaps(rolePrefix) {
  Object.keys(liveMapsByKey).forEach((key) => {
    if (!rolePrefix || key.startsWith(`${rolePrefix}-`)) {
      delete liveMapsByKey[key];
    }
  });
}

function setGeoPermissionMessage(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = message || '';
}

function setAdultoLocationFallbackVisible(solicitudId, visible) {
  const el = document.getElementById(`live-map-fallback-adulto-${solicitudId}`);
  if (el) el.classList.toggle('hidden', !visible);
}

function getLiveMarkerIcon(kind) {
  const isVoluntario = kind === 'voluntario';
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: isVoluntario ? '#1FA6A3' : '#F28C6A',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2
  };
}

function fitLiveMapToMarkers(map, markersByKind) {
  const positions = Object.values(markersByKind)
    .filter(Boolean)
    .map((marker) => marker.getPosition())
    .filter(Boolean);

  if (!positions.length) return;

  if (positions.length === 1) {
    map.panTo(positions[0]);
    if (map.getZoom() < 14) map.setZoom(15);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  positions.forEach((pos) => bounds.extend(pos));
  map.fitBounds(bounds, 56);
}

/**
 * Crea o actualiza un mapa con hasta dos marcadores (voluntario + adulto mayor).
 * points: { voluntario?: ubicacion|null, adulto?: ubicacion|null }
 * - undefined: no tocar ese marcador
 * - null / inválido: quitar ese marcador
 */
function upsertLiveMap(mapKey, containerId, points = {}, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const statusEl = options.statusId ? document.getElementById(options.statusId) : null;

  if (typeof google === 'undefined' || !google.maps) {
    if (statusEl) statusEl.textContent = 'Mapa no disponible. Verifica la API de Google Maps.';
    return;
  }

  const nextPoints = { ...(liveMapsByKey[mapKey]?.points || {}) };
  ['voluntario', 'adulto'].forEach((kind) => {
    if (Object.prototype.hasOwnProperty.call(points, kind)) {
      nextPoints[kind] = hasValidUbicacion(points[kind]) ? points[kind] : null;
    }
  });

  const validKinds = ['voluntario', 'adulto'].filter((kind) => hasValidUbicacion(nextPoints[kind]));

  if (!validKinds.length) {
    const existingEmpty = liveMapsByKey[mapKey];
    if (existingEmpty && existingEmpty.container === container) {
      existingEmpty.points = nextPoints;
      return;
    }
    delete liveMapsByKey[mapKey];
    container.innerHTML = '';
    if (statusEl) statusEl.textContent = 'Obteniendo ubicación...';
    return;
  }

  if (statusEl) statusEl.textContent = '';

  let existing = liveMapsByKey[mapKey];
  if (!existing || existing.container !== container) {
    container.innerHTML = '';
    const first = nextPoints[validKinds[0]];
    const map = new google.maps.Map(container, {
      center: { lat: Number(first.lat), lng: Number(first.lng) },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
    existing = { map, markers: {}, container, points: {} };
    liveMapsByKey[mapKey] = existing;
  }

  existing.points = nextPoints;

  ['voluntario', 'adulto'].forEach((kind) => {
    const ubicacion = nextPoints[kind];
    const title = kind === 'voluntario'
      ? (options.voluntarioTitle || 'Voluntario')
      : (options.adultoTitle || 'Adulto mayor');

    if (!hasValidUbicacion(ubicacion)) {
      if (existing.markers[kind]) {
        existing.markers[kind].setMap(null);
        delete existing.markers[kind];
      }
      return;
    }

    const pos = { lat: Number(ubicacion.lat), lng: Number(ubicacion.lng) };
    if (existing.markers[kind]) {
      existing.markers[kind].setPosition(pos);
    } else {
      existing.markers[kind] = new google.maps.Marker({
        position: pos,
        map: existing.map,
        title,
        icon: getLiveMarkerIcon(kind)
      });
    }
  });

  fitLiveMapToMarkers(existing.map, existing.markers);
}

function syncLiveMapsForRole(solicitudes, role) {
  const prefix = role === 'adulto' ? 'adulto' : 'uni';
  const enVivo = solicitudes.filter((s) => ESTADOS_UBICACION_EN_VIVO.includes(s.estado));
  const activeKeys = new Set();

  enVivo.forEach((sol) => {
    const mapKey = `${prefix}-${sol.id}`;
    activeKeys.add(mapKey);
    upsertLiveMap(
      mapKey,
      `live-map-${prefix}-${sol.id}`,
      {
        voluntario: sol.ubicacionVoluntario || null,
        adulto: sol.ubicacionAdultoMayor || null
      },
      {
        statusId: `live-map-msg-${prefix}-${sol.id}`,
        voluntarioTitle: role === 'adulto' ? 'Voluntario' : 'Tu ubicación',
        adultoTitle: role === 'adulto' ? 'Tu ubicación' : 'Adulto mayor'
      }
    );
  });

  Object.keys(liveMapsByKey).forEach((key) => {
    if (key.startsWith(`${prefix}-`) && !activeKeys.has(key)) {
      delete liveMapsByKey[key];
    }
  });
}

/**
 * Inicia watchPosition y escribe ubicacionVoluntario o ubicacionAdultoMayor (throttled).
 * fieldName: 'ubicacionVoluntario' | 'ubicacionAdultoMayor'
 */
async function startLocationWatch(solicitudId, fieldName) {
  if (
    locationTrackedSolicitudId === solicitudId
    && locationWatchField === fieldName
    && locationWatchId != null
  ) {
    return;
  }

  stopLocationWatch();
  locationTrackedSolicitudId = solicitudId;
  locationWatchField = fieldName;

  const isAdulto = fieldName === 'ubicacionAdultoMayor';
  const mapPrefix = isAdulto ? 'adulto' : 'uni';
  const geoErrorId = isAdulto ? `geo-error-adulto-${solicitudId}` : `geo-error-${solicitudId}`;
  const permissionMsg = isAdulto
    ? 'Ubicación en vivo no disponible, usa la dirección de referencia'
    : 'Activa el permiso de ubicación para que el adulto mayor pueda ver tu progreso';

  const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
  };

  const onPosition = async (position) => {
    if (!position?.coords) return;
    const now = Date.now();
    if (lastLocationWriteAt > 0 && now - lastLocationWriteAt < LOCATION_WRITE_MIN_INTERVAL_MS) {
      return;
    }
    lastLocationWriteAt = now;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    setGeoPermissionMessage(geoErrorId, '');
    if (isAdulto) setAdultoLocationFallbackVisible(solicitudId, false);

    const partial = isAdulto
      ? { adulto: { lat, lng } }
      : { voluntario: { lat, lng } };

    upsertLiveMap(
      `${mapPrefix}-${solicitudId}`,
      `live-map-${mapPrefix}-${solicitudId}`,
      partial,
      {
        statusId: `live-map-msg-${mapPrefix}-${solicitudId}`,
        voluntarioTitle: isAdulto ? 'Voluntario' : 'Tu ubicación',
        adultoTitle: isAdulto ? 'Tu ubicación' : 'Adulto mayor'
      }
    );

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        [fieldName]: {
          lat,
          lng,
          timestamp: serverTimestamp()
        }
      });
    } catch (error) {
      console.error(`Error al guardar ${fieldName}:`, error);
    }
  };

  const onError = (error) => {
    if (error?.code === 1 || error?.code === 'PERMISSION_DENIED') {
      setGeoPermissionMessage(geoErrorId, permissionMsg);
      if (isAdulto) setAdultoLocationFallbackVisible(solicitudId, true);
    }
  };

  if (isNativePlatform()) {
    try {
      const { Geolocation } = window.Capacitor.Plugins;
      if (!Geolocation?.watchPosition) {
        throw new Error('Plugin Geolocation no disponible');
      }
      if (!geoPermissionsRequested) {
        await Geolocation.requestPermissions();
        geoPermissionsRequested = true;
      }
      locationWatchIsNative = true;
      locationWatchId = await Geolocation.watchPosition(geoOptions, (position, err) => {
        if (err) {
          onError(err);
          return;
        }
        onPosition(position);
      });
    } catch (error) {
      console.error('Error al iniciar geolocalización nativa:', error);
      setGeoPermissionMessage(geoErrorId, permissionMsg);
      if (isAdulto) setAdultoLocationFallbackVisible(solicitudId, true);
    }
    return;
  }

  if (!navigator.geolocation) {
    setGeoPermissionMessage(geoErrorId, permissionMsg);
    if (isAdulto) setAdultoLocationFallbackVisible(solicitudId, true);
    return;
  }

  locationWatchIsNative = false;
  locationWatchId = navigator.geolocation.watchPosition(onPosition, onError, geoOptions);
}

function syncLocationTracking(solicitudes, role) {
  const activa = solicitudes.find((s) => ESTADOS_UBICACION_EN_VIVO.includes(s.estado));
  if (activa) {
    const fieldName = role === 'adulto' ? 'ubicacionAdultoMayor' : 'ubicacionVoluntario';
    startLocationWatch(activa.id, fieldName).catch((error) => {
      console.error('Error al sincronizar seguimiento GPS:', error);
    });
  } else {
    stopLocationWatch();
  }
}

function syncVoluntarioLocationTracking(solicitudes) {
  syncLocationTracking(solicitudes, 'uni');
}

function syncAdultoLocationTracking(solicitudes) {
  syncLocationTracking(solicitudes, 'adulto');
}

function getFechaFromSolicitud(data) {
  if (data.fechaCreacion?.toDate) return data.fechaCreacion.toDate();
  if (data.fecha) return new Date(data.fecha);
  return new Date();
}

function getAuthErrorMessage(error) {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'Ese correo ya está registrado';
    case 'auth/invalid-email':
      return 'Correo electrónico inválido';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres';
    case 'auth/wrong-password':
      return 'Contraseña incorrecta';
    case 'auth/user-not-found':
      return 'No existe una cuenta con ese correo';
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos';
    default:
      return 'Ocurrió un error. Intenta de nuevo.';
  }
}

function syncUserDataToLocalStorage(data) {
  if (data.rol === 'adultoMayor') {
    localStorage.setItem('adultoMayorData', JSON.stringify(data));
  } else if (data.rol === 'universitario') {
    localStorage.setItem('universitarioData', JSON.stringify(data));
  } else if (data.rol === 'docente') {
    localStorage.setItem('docenteData', JSON.stringify(data));
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch((error) => {
        console.error('Error al registrar Service Worker:', error);
      });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const splashScreen = document.getElementById('splash-screen');
  const roleSelection = document.getElementById('role-selection');
  bindDocPhotoCaptureControls();

  onAuthStateChanged(window.auth, async (user) => {
    authStateResolved = true;

    if (user && !user.emailVerified) {
      if (registrationInProgress) {
        initialAuthUser = null;
        return;
      }

      // Admin creado manualmente: puede no tener correo real → omitir emailVerified
      try {
        const userDoc = await getDoc(doc(window.db, 'usuarios', user.uid));
        if (userDoc.exists() && userDoc.data().rol === 'admin') {
          AppState.userData = userDoc.data();
          syncUserDataToLocalStorage(AppState.userData);
          initialAuthUser = user;
          return;
        }
        if (userDoc.exists()) {
          AppState.userData = userDoc.data();
          syncUserDataToLocalStorage(AppState.userData);
        }
      } catch (error) {
        console.error('Error al verificar perfil de usuario no verificado:', error);
      }

      // Sesión activa pero bloqueada: no entrar al home hasta verificar
      initialAuthUser = null;
      awaitingEmailVerification = true;
      return;
    }

    if (user?.emailVerified) {
      awaitingEmailVerification = false;
    }

    initialAuthUser = user;

    if (user) {
      try {
        const userDoc = await getDoc(doc(window.db, 'usuarios', user.uid));
        if (userDoc.exists()) {
          AppState.userData = userDoc.data();
          syncUserDataToLocalStorage(AppState.userData);
        }
      } catch (error) {
        console.error('Error al cargar perfil del usuario:', error);
      }
    }
  });

  function updateCuentaEnRevisionUI(estadoAprobacion) {
    const titleEl = document.getElementById('revision-title');
    const messageEl = document.getElementById('revision-message');
    if (estadoAprobacion === 'rechazado') {
      if (titleEl) titleEl.textContent = 'Registro no aprobado';
      if (messageEl) {
        messageEl.textContent =
          'Tu registro no pudo ser aprobado. Contacta al soporte.';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Tu cuenta está en revisión';
      if (messageEl) {
        messageEl.textContent =
          'Un administrador está revisando tus datos. Te notificaremos cuando tu cuenta esté aprobada.';
      }
    }
  }

  /**
   * Pantalla de espera/rechazo + listener en tiempo real del estadoAprobacion
   */
  function showCuentaEnRevisionPage() {
    roleSelection.classList.add('hidden');
    updateCuentaEnRevisionUI(AppState.userData?.estadoAprobacion);
    showPage('cuenta-en-revision');

    const cerrarBtn = document.getElementById('revision-cerrar-sesion-btn');
    if (cerrarBtn && cerrarBtn.dataset.bound !== 'true') {
      cerrarBtn.dataset.bound = 'true';
      cerrarBtn.addEventListener('click', function() {
        stopAprobacionListener();
        signOut(window.auth).finally(() => {
          AppState.userData = null;
          AppState.currentRole = null;
          showPage('role-selection');
          document.getElementById('role-selection').classList.remove('hidden');
        });
      });
    }

    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    stopAprobacionListener();
    aprobacionUnsubscribe = onSnapshot(doc(window.db, 'usuarios', uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      AppState.userData = data;
      syncUserDataToLocalStorage(data);

      if (data.estadoAprobacion === 'aprobado') {
        stopAprobacionListener();
        routeToHomeByRole(data.rol);
        return;
      }

      updateCuentaEnRevisionUI(data.estadoAprobacion);
    }, (error) => {
      console.error('Error al escuchar estado de aprobación:', error);
    });
  }

  function routeToHomeByRole(rol) {
    // Admin: va directo al panel (sin revisión ni selección de rol)
    if (rol === 'admin') {
      stopAprobacionListener();
      roleSelection.classList.add('hidden');
      AppState.currentRole = 'admin';
      showPage('admin-panel');
      initAdminPanel();
      return;
    }

    if (!isUsuarioAprobado(AppState.userData)) {
      showCuentaEnRevisionPage();
      return;
    }

    stopAprobacionListener();
    roleSelection.classList.add('hidden');

    switch (rol) {
      case 'adultoMayor':
        AppState.currentRole = 'adulto-mayor';
        showPage('adulto-mayor-home');
        initAdultoMayorHome();
        break;
      case 'universitario':
        AppState.currentRole = 'universitario';
        showPage('universitario-home');
        initUniversitarioHome();
        break;
      case 'docente':
        AppState.currentRole = 'docente';
        initDocenteFlow();
        break;
    }
  }

  function finishStartup() {
    const puedeEntrarSinVerificar = AppState.userData?.rol === 'admin';
    if (
      initialAuthUser &&
      AppState.userData?.rol &&
      (initialAuthUser.emailVerified || puedeEntrarSinVerificar)
    ) {
      routeToHomeByRole(AppState.userData.rol);
      return;
    }

    // Sesión activa sin correo verificado → pantalla de verificación (sin cerrar sesión)
    const currentUser = window.auth.currentUser;
    if (
      currentUser &&
      !currentUser.emailVerified &&
      AppState.userData?.rol !== 'admin'
    ) {
      awaitingEmailVerification = true;
      roleSelection.classList.add('hidden');
      showEmailVerificationPage(currentUser.email || '');
      return;
    }

    if (pendingLoginMessage) {
      roleSelection.classList.add('hidden');
      showPage('login-page');
      const loginError = document.getElementById('error-login-email');
      if (loginError) loginError.textContent = pendingLoginMessage;
      pendingLoginMessage = null;
      return;
    }

    roleSelection.classList.remove('hidden');

    const colibriWrapper = document.getElementById('colibri-guide-wrapper');
    if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
      const colibriGuide = new ColibriGuide(colibriWrapper);
      colibriGuide.showMessage('welcome');
    }
  }

  function waitForAuthThenFinish() {
    if (authStateResolved) {
      finishStartup();
      return;
    }

    const authCheckInterval = setInterval(() => {
      if (authStateResolved) {
        clearInterval(authCheckInterval);
        finishStartup();
      }
    }, 100);

    setTimeout(() => {
      clearInterval(authCheckInterval);
      finishStartup();
    }, 3000);
  }
  
  /**
   * Transición automática del splash screen a la selección de rol
   * Duración: 2.5 segundos (dentro del rango de 2-3 segundos especificado)
   */
  setTimeout(function() {
    splashScreen.style.opacity = '0';
    splashScreen.style.transition = 'opacity 0.5s ease-out';
    
    setTimeout(function() {
      splashScreen.classList.add('hidden');
      waitForAuthThenFinish();
    }, 500); // Esperar a que termine la animación de fade out
  }, 2500); // 2.5 segundos de visualización del splash
  
  const roleButtons = document.querySelectorAll('.role-btn');
  
  roleButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const selectedRole = this.getAttribute('data-role');
      handleRoleSelection(selectedRole);
    });
  });

  document.getElementById('ir-login-btn')?.addEventListener('click', function() {
    roleSelection.classList.add('hidden');
    showPage('login-page');
    initLogin();
  });

  initLogin();
  initEmailVerification();
  initPasswordToggles();

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function() {
        const wrap = this.closest('.password-input-wrap');
        const input = wrap?.querySelector('input');
        if (!input) return;

        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        this.classList.toggle('is-visible', !showing);
        this.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
      });
    });
  }

  function showEmailVerificationPage(email) {
    roleSelection.classList.add('hidden');
    pendingLoginMessage = null;
    awaitingEmailVerification = true;
    const emailDisplay = document.getElementById('verification-email-display');
    if (emailDisplay) emailDisplay.textContent = email || '';
    document.getElementById('error-verification').textContent = '';
    document.getElementById('success-verification').textContent = '';
    showPage('email-verification-page');
  }

  async function handlePostRegistrationVerification(email, password) {
    pendingVerificationCredentials = { email, password };
    awaitingEmailVerification = true;

    // Mantener sesión activa; cargar perfil si aún no está en AppState
    const user = window.auth.currentUser;
    if (user && !AppState.userData) {
      try {
        const userDoc = await getDoc(doc(window.db, 'usuarios', user.uid));
        if (userDoc.exists()) {
          AppState.userData = userDoc.data();
          syncUserDataToLocalStorage(AppState.userData);
        }
      } catch (error) {
        console.error('Error al cargar perfil tras registro:', error);
      }
    }

    showEmailVerificationPage(email);
  }

  async function continueAfterEmailVerification() {
    const errorEl = document.getElementById('error-verification');
    const successEl = document.getElementById('success-verification');
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';

    const user = window.auth.currentUser;
    if (!user) {
      if (errorEl) {
        errorEl.textContent = 'No hay sesión activa. Cierra e inicia sesión de nuevo.';
      }
      return;
    }

    try {
      await user.reload();
    } catch (error) {
      if (errorEl) errorEl.textContent = getAuthErrorMessage(error);
      return;
    }

    if (!user.emailVerified) {
      if (errorEl) {
        errorEl.textContent =
          'Todavía no detectamos la verificación, intenta de nuevo en un momento';
      }
      return;
    }

    awaitingEmailVerification = false;
    pendingVerificationCredentials = null;

    try {
      const userDoc = await getDoc(doc(window.db, 'usuarios', user.uid));
      if (!userDoc.exists()) {
        if (errorEl) errorEl.textContent = 'No se encontró el perfil de este usuario';
        return;
      }
      AppState.userData = userDoc.data();
      syncUserDataToLocalStorage(AppState.userData);
      initialAuthUser = user;
      routeToHomeByRole(AppState.userData.rol);
    } catch (error) {
      console.error('Error al continuar tras verificación:', error);
      if (errorEl) errorEl.textContent = 'No se pudo continuar. Intenta de nuevo.';
    }
  }

  function initEmailVerification() {
    if (emailVerificationInitialized) return;
    emailVerificationInitialized = true;

    document.getElementById('verification-continuar-btn')?.addEventListener('click', () => {
      continueAfterEmailVerification();
    });

    document.getElementById('reenviar-verificacion-btn')?.addEventListener('click', async function() {
      const errorEl = document.getElementById('error-verification');
      const successEl = document.getElementById('success-verification');
      errorEl.textContent = '';
      successEl.textContent = '';

      try {
        let user = window.auth.currentUser;
        if (!user && pendingVerificationCredentials) {
          const { email, password } = pendingVerificationCredentials;
          const credential = await signInWithEmailAndPassword(window.auth, email, password);
          user = credential.user;
        }
        if (!user) {
          errorEl.textContent = 'No hay sesión activa para reenviar el correo.';
          return;
        }
        await sendEmailVerification(user);
        successEl.textContent = 'Correo reenviado. Revisa tu bandeja de entrada (o spam).';
      } catch (error) {
        errorEl.textContent = getAuthErrorMessage(error);
      }
    });

    document.getElementById('verification-ir-login-btn')?.addEventListener('click', function() {
      awaitingEmailVerification = false;
      pendingVerificationCredentials = null;
      signOut(window.auth).finally(() => {
        AppState.userData = null;
        AppState.currentRole = null;
        roleSelection.classList.add('hidden');
        showPage('login-page');
        initLogin();
      });
    });
  }
  
  function handleRoleSelection(role) {
    AppState.currentRole = role;
    
    roleSelection.classList.add('hidden');
    
    switch(role) {
      case 'adulto-mayor':
        initAdultoMayorFlow();
        break;
      case 'universitario':
        initUniversitarioFlow();
        break;
      case 'docente':
        initDocenteFlow();
        break;
    }
  }

  function initAdultoMayorFlow() {
    if (window.auth.currentUser?.emailVerified && AppState.userData?.rol === 'adultoMayor') {
      routeToHomeByRole('adultoMayor');
    } else {
      showPage('adulto-mayor-registro');
      initAdultoMayorRegistro();
    }
  }

  function initAdultoMayorRegistro() {
    const registroForm = document.getElementById('registro-form');
    if (!registroForm || registroForm.dataset.initialized === 'true') return;
    registroForm.dataset.initialized = 'true';
    
    registroForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(registroForm);
      const nombre = formData.get('nombre') || document.getElementById('nombre').value;
      const edad = formData.get('edad') || document.getElementById('edad').value;
      const telefono = formData.get('telefono') || document.getElementById('telefono').value;
      const zona = formData.get('zona') || document.getElementById('zona').value;
      const direccion = formData.get('direccion') || document.getElementById('direccion').value;
      const necesidades = formData.getAll('necesidades');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const cedulaFile = getDocPhotoFile('doc-cedula-adulto');
      const rostroFile = getDocPhotoFile('doc-rostro-adulto');
      
      if (!validateRegistroForm(nombre, edad, telefono, zona, direccion, necesidades, email, password, cedulaFile, rostroFile)) {
        return;
      }
      
      const userData = {
        nombre: nombre.trim(),
        edad: parseInt(edad),
        telefono: telefono.trim(),
        zona: zona,
        direccion: direccion.trim(),
        necesidades: necesidades,
        fechaRegistro: new Date().toISOString()
      };

      registrationInProgress = true;
      try {
        const credential = await createUserWithEmailAndPassword(window.auth, email, password);
        const uid = credential.user.uid;
        await sendEmailVerification(credential.user);
        const documentos = await uploadDocumentosRegistro(uid, {
          cedula: cedulaFile,
          rostro: rostroFile
        });
        await setDoc(doc(window.db, 'usuarios', uid), {
          ...userData,
          rol: 'adultoMayor',
          email,
          documentos,
          estadoAprobacion: 'pendiente'
        });
      } catch (error) {
        console.error('Error en registro adulto mayor:', error);
        document.getElementById('error-email').textContent =
          error.code ? getAuthErrorMessage(error) : 'No se pudo completar el registro. Intenta de nuevo.';
        return;
      } finally {
        registrationInProgress = false;
      }

      await handlePostRegistrationVerification(email, password);
    });
  }

  function validateRegistroForm(nombre, edad, telefono, zona, direccion, necesidades, email, password, cedulaFile, rostroFile) {
    let isValid = true;
    
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    
    if (!nombre || nombre.trim().length < 2) {
      document.getElementById('error-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    const edadNum = parseInt(edad);
    if (!edad || isNaN(edadNum) || edadNum < 60 || edadNum > 120) {
      document.getElementById('error-edad').textContent = 'La edad debe estar entre 60 y 120 años';
      isValid = false;
    }
    
    if (!telefono || telefono.trim().length < 8) {
      document.getElementById('error-telefono').textContent = 'Ingresa un teléfono válido';
      isValid = false;
    }
    
    if (!zona) {
      document.getElementById('error-zona').textContent = 'Selecciona una zona';
      isValid = false;
    }

    if (!direccion || direccion.trim().length < 5) {
      document.getElementById('error-direccion').textContent = 'Ingresa tu dirección completa';
      isValid = false;
    }
    
    if (!necesidades || necesidades.length === 0) {
      document.getElementById('error-necesidades').textContent = 'Selecciona al menos una necesidad';
      isValid = false;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('error-email').textContent = 'Ingresa un correo electrónico válido';
      isValid = false;
    }

    if (!password || password.length < 6) {
      document.getElementById('error-password').textContent = 'La contraseña debe tener al menos 6 caracteres';
      isValid = false;
    }

    if (!cedulaFile || !cedulaFile.type.startsWith('image/')) {
      document.getElementById('error-doc-cedula-adulto').textContent = 'Sube una foto de tu cédula';
      isValid = false;
    }

    if (!rostroFile || !rostroFile.type.startsWith('image/')) {
      document.getElementById('error-doc-rostro-adulto').textContent = 'Sube una foto de tu rostro';
      isValid = false;
    }
    
    return isValid;
  }

  function initLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm || loginForm.dataset.initialized === 'true') return;
    loginForm.dataset.initialized = 'true';

    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      document.getElementById('error-login-email').textContent = '';
      document.getElementById('error-login-password').textContent = '';

      if (!email || !password) {
        document.getElementById('error-login-email').textContent = 'Completa correo y contraseña';
        return;
      }

      try {
        const credential = await signInWithEmailAndPassword(window.auth, email, password);

        const userDoc = await getDoc(doc(window.db, 'usuarios', credential.user.uid));

        if (!userDoc.exists()) {
          await signOut(window.auth);
          document.getElementById('error-login-email').textContent = 'No se encontró el perfil de este usuario';
          return;
        }

        AppState.userData = userDoc.data();

        // Solo roles no-admin deben tener el correo verificado
        if (!credential.user.emailVerified && AppState.userData.rol !== 'admin') {
          syncUserDataToLocalStorage(AppState.userData);
          awaitingEmailVerification = true;
          showEmailVerificationPage(email);
          return;
        }

        syncUserDataToLocalStorage(AppState.userData);
        routeToHomeByRole(AppState.userData.rol);
      } catch (error) {
        document.getElementById('error-login-email').textContent = getAuthErrorMessage(error);
      }
    });

    document.getElementById('login-volver-btn')?.addEventListener('click', function() {
      showPage('role-selection');
      document.getElementById('role-selection').classList.remove('hidden');
    });
  }

  function initAdultoMayorHome() {
    const colibriWrapper = document.getElementById('colibri-guide-wrapper');
    if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
      AppState.colibriGuide = new ColibriGuide(colibriWrapper);
    }
    
    initBottomNavigation('bottom-nav-container', 'home');
    window.actualizarBadgeChat();
    
    actualizarEstadoBotonConfirmar();
    
    const pedirAyudaBtn = document.getElementById('pedir-ayuda-btn');
    if (pedirAyudaBtn) {
      const newBtn = pedirAyudaBtn.cloneNode(true);
      pedirAyudaBtn.parentNode.replaceChild(newBtn, pedirAyudaBtn);
      
      document.getElementById('pedir-ayuda-btn').addEventListener('click', function() {
        mostrarPantallaAgendar();
      });
    }
    
    document.querySelectorAll('.help-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const tipoAyuda = this.getAttribute('data-help');
        mostrarVoluntariosDisponibles(tipoAyuda);
      });
    });
    
    subscribeSolicitudesActivas();
    subscribeAcompanamientosAnterioresAdulto();
    startRecordatorioAcompanamientos();
  }

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
      
      if (activePage) {
        AppState.bottomNav.setActive(activePage);
      }
      aplicarBadgeChatUnread();
    }
  }

  function navigateToPage(pageId) {
    if (pageId !== 'chat') {
      stopChatListener();
      chatSubscribeGeneration += 1;
      AppState.chatId = null;
    }

    const pageMap = {
      'home': 'adulto-mayor-home',
      'chat': 'adulto-mayor-chat',
      'album': 'adulto-mayor-album',
      'perfil': 'adulto-mayor-perfil'
    };
    
    const pageName = pageMap[pageId] || pageId;
    showPage(pageName);
    
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

  window.navigateToPage = navigateToPage;

  function showPage(pageId) {
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.add('hidden');
    });
    
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
   * Pantalla protagónica: ¿ahora o programar?
   */
  function mostrarPantallaAgendar() {
    if (!AppState.voluntarioSeleccionado || !AppState.tipoAyudaSeleccionado) {
      alert('Por favor, selecciona primero un tipo de ayuda y un voluntario.');
      return;
    }

    showPage('agendar-acompanamiento');
    initPantallaAgendar();
  }

  function initPantallaAgendar() {
    const formProgramada = document.getElementById('agendar-form-programada');
    const fechaInput = document.getElementById('fecha-programada');
    const horaInput = document.getElementById('hora-programada');
    const ahoraBtn = document.getElementById('ayuda-ahora-btn');
    const programarBtn = document.getElementById('ayuda-programar-btn');

    formProgramada?.classList.add('hidden');
    ahoraBtn?.classList.remove('selected');
    programarBtn?.classList.remove('selected');
    document.getElementById('error-fecha-programada') && (document.getElementById('error-fecha-programada').textContent = '');
    document.getElementById('error-hora-programada') && (document.getElementById('error-hora-programada').textContent = '');

    if (fechaInput) {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      fechaInput.min = `${yyyy}-${mm}-${dd}`;
      fechaInput.value = '';
    }
    if (horaInput) horaInput.value = '';

    const volverBtn = document.getElementById('volver-agendar-btn');
    if (volverBtn && volverBtn.dataset.bound !== 'true') {
      volverBtn.dataset.bound = 'true';
      volverBtn.addEventListener('click', function() {
        showPage('adulto-mayor-home');
        initAdultoMayorHome();
      });
    }

    if (ahoraBtn && ahoraBtn.dataset.bound !== 'true') {
      ahoraBtn.dataset.bound = 'true';
      ahoraBtn.addEventListener('click', async function() {
        ahoraBtn.classList.add('selected');
        programarBtn?.classList.remove('selected');
        formProgramada?.classList.add('hidden');
        await crearSolicitudAcompanamiento({ esProgramada: false });
      });
    }

    if (programarBtn && programarBtn.dataset.bound !== 'true') {
      programarBtn.dataset.bound = 'true';
      programarBtn.addEventListener('click', function() {
        programarBtn.classList.add('selected');
        ahoraBtn?.classList.remove('selected');
        formProgramada?.classList.remove('hidden');
      });
    }

    const confirmarProgramadaBtn = document.getElementById('confirmar-programada-btn');
    if (confirmarProgramadaBtn && confirmarProgramadaBtn.dataset.bound !== 'true') {
      confirmarProgramadaBtn.dataset.bound = 'true';
      confirmarProgramadaBtn.addEventListener('click', async function() {
        const fechaStr = document.getElementById('fecha-programada')?.value;
        const horaStr = document.getElementById('hora-programada')?.value;
        const errorFecha = document.getElementById('error-fecha-programada');
        const errorHora = document.getElementById('error-hora-programada');
        if (errorFecha) errorFecha.textContent = '';
        if (errorHora) errorHora.textContent = '';

        if (!fechaStr) {
          if (errorFecha) errorFecha.textContent = 'Selecciona una fecha';
          return;
        }
        if (!horaStr) {
          if (errorHora) errorHora.textContent = 'Selecciona una hora';
          return;
        }

        const fechaProgramada = buildFechaProgramadaFromInputs(fechaStr, horaStr);
        if (!fechaProgramada || Number.isNaN(fechaProgramada.getTime())) {
          if (errorFecha) errorFecha.textContent = 'Fecha u hora no válida';
          return;
        }
        if (fechaProgramada.getTime() <= Date.now()) {
          if (errorHora) errorHora.textContent = 'La fecha y hora deben ser posteriores a ahora';
          return;
        }

        await crearSolicitudAcompanamiento({
          esProgramada: true,
          fechaProgramada
        });
      });
    }
  }

  async function crearSolicitudAcompanamiento({ esProgramada, fechaProgramada = null }) {
    if (!AppState.voluntarioSeleccionado || !AppState.tipoAyudaSeleccionado) {
      alert('Por favor, selecciona primero un tipo de ayuda y un voluntario.');
      return;
    }

    const adultoMayor = AppState.userData;
    const currentUser = window.auth.currentUser;
    if (!adultoMayor || !currentUser) {
      alert('Error: No se encontraron tus datos. Por favor, regístrate nuevamente.');
      return;
    }

    const ahoraBtn = document.getElementById('ayuda-ahora-btn');
    const confirmarProgramadaBtn = document.getElementById('confirmar-programada-btn');
    const pedirAyudaBtn = document.getElementById('pedir-ayuda-btn');
    [ahoraBtn, confirmarProgramadaBtn, pedirAyudaBtn].forEach((btn) => {
      if (btn) {
        btn.disabled = true;
        btn.classList.add('btn-disabled');
      }
    });

    const solicitudData = {
      adultoMayorId: currentUser.uid,
      adultoMayorNombre: adultoMayor.nombre,
      adultoMayorZona: adultoMayor.zona || null,
      adultoMayorDireccion: adultoMayor.direccion || null,
      tipoAyuda: AppState.tipoAyudaSeleccionado,
      estado: esProgramada ? 'programada' : 'pendiente',
      universitarioId: null,
      universitarioNombre: null,
      fechaCreacion: serverTimestamp(),
      esProgramada: Boolean(esProgramada)
    };

    if (esProgramada && fechaProgramada) {
      solicitudData.fechaProgramada = Timestamp.fromDate(fechaProgramada);
    }

    try {
      await addDoc(collection(window.db, 'solicitudes'), solicitudData);
    } catch (error) {
      console.error('Error al crear solicitud:', error);
      alert('No se pudo enviar la solicitud. Intenta de nuevo.');
      [ahoraBtn, confirmarProgramadaBtn, pedirAyudaBtn].forEach((btn) => {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('btn-disabled');
        }
      });
      return;
    }

    if (AppState.colibriGuide) {
      AppState.colibriGuide.showMessage('help-sent');
    } else {
      const colibriWrapper = document.getElementById('colibri-guide-wrapper');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        AppState.colibriGuide = new ColibriGuide(colibriWrapper);
        AppState.colibriGuide.showMessage('help-sent');
      }
    }

    AppState.voluntarioSeleccionado = null;
    AppState.tipoAyudaSeleccionado = null;

    showPage('adulto-mayor-home');
    initAdultoMayorHome();
    actualizarEstadoBotonConfirmar();

    alert(
      esProgramada
        ? 'Tu acompañamiento quedó programado.\nLos voluntarios podrán verlo y aceptarlo.'
        : 'Tu solicitud ya fue enviada.\nEn breve alguien se pondrá en contacto contigo.'
    );

    setTimeout(() => {
      [ahoraBtn, confirmarProgramadaBtn, pedirAyudaBtn].forEach((btn) => {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('btn-disabled');
        }
      });
    }, 1000);
  }

  async function mostrarVoluntariosDisponibles(tipoAyuda) {
    showPage('voluntarios-disponibles');
    
    const tiposLabels = {
      'compania': 'Compañía',
      'medicamentos': 'Medicamentos',
      'compras': 'Compras',
      'citas': 'Citas médicas',
      'tecnologia': 'Tecnología',
      'otras': 'Otras necesidades'
    };
    
    document.getElementById('voluntarios-titulo').textContent = 'Personas disponibles para acompañarte';
    document.getElementById('voluntarios-subtitulo').textContent = 'Elige con quién te sientas más cómodo o cómoda';
    
    const volverBtn = document.getElementById('volver-ayuda-btn');
    const newVolverBtn = volverBtn.cloneNode(true);
    volverBtn.parentNode.replaceChild(newVolverBtn, volverBtn);
    newVolverBtn.addEventListener('click', function() {
      showPage('adulto-mayor-home');
      initAdultoMayorHome();
    });
    
    await cargarVoluntariosFiltrados(tipoAyuda);
  }

  async function cargarVoluntariosFiltrados(tipoAyuda) {
    const container = document.getElementById('voluntarios-list');
    
    if (!container) return;

    container.innerHTML = `
      <div class="voluntarios-empty">
        <p>Buscando personas disponibles...</p>
      </div>
    `;

    const universitarios = await getAllUniversitarios();
    
    const voluntariosFiltrados = universitarios.filter(uni => {
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
      
      container.querySelectorAll('.btn-seleccionar-voluntario').forEach(btn => {
        btn.addEventListener('click', function() {
          const voluntarioId = this.getAttribute('data-voluntario-id');
          const tipoAyuda = this.getAttribute('data-tipo-ayuda');
          seleccionarVoluntario(voluntarioId, tipoAyuda);
        });
      });
    }
  }

  async function getAllUniversitarios() {
    try {
      const universitariosQuery = query(
        collection(window.db, 'usuarios'),
        where('rol', '==', 'universitario'),
        where('estadoAprobacion', '==', 'aprobado')
      );
      const snapshot = await getDocs(universitariosQuery);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
    } catch (error) {
      console.error('Error al cargar universitarios:', error);
      return [];
    }
  }

  function seleccionarVoluntario(voluntarioId, tipoAyuda) {
    AppState.voluntarioSeleccionado = voluntarioId;
    AppState.tipoAyudaSeleccionado = tipoAyuda;
    
    alert('Has elegido a esta persona para acompañarte.\nCuando estés listo, puedes enviar la solicitud.');
    
    showPage('adulto-mayor-home');
    initAdultoMayorHome();
    
    actualizarEstadoBotonConfirmar();
  }

  function renderTarjetaSolicitudActivaAdulto(sol) {
    const tipo = sol.tipoAyuda || sol.tipo;
    const tipoLabel = sol.tipoLabel || TIPO_AYUDA_LABELS[tipo] || tipo;
    const estadoLabel = ESTADO_LABELS[sol.estado] || sol.estado;
    const fechaProgramada = getFechaProgramada(sol);
    const fechaFormateada = fechaProgramada
      ? formatFechaHoraProgramada(fechaProgramada)
      : getFechaFromSolicitud(sol).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

    const muestraVoluntario = ['aceptada', 'en_camino', 'en_curso'].includes(sol.estado)
      && sol.universitarioNombre;

    let estadoExtraHtml = '';
    if (sol.estado === 'en_camino' || sol.estado === 'en_curso') {
      const dirInfo = getDireccionAdultoMayorDisplay(sol);
      const estadoMsg = sol.estado === 'en_camino'
        ? 'Tu voluntario va en camino'
        : 'Acompañamiento en curso';
      const codigoHtml = sol.estado === 'en_camino' ? `
        <div class="codigo-confirmacion-box">
          <p class="codigo-confirmacion-hint">Cuando llegue, dale este código:</p>
          <p class="codigo-confirmacion-valor">${sol.codigoConfirmacion || '----'}</p>
        </div>
      ` : '';

      estadoExtraHtml = `
        <p class="solicitud-info-line solicitud-en-camino-msg">${estadoMsg}</p>
        ${codigoHtml}
        <div class="live-map-section">
          <p class="live-map-title">Ubicaciones en vivo</p>
          <p class="live-map-legend">
            <span class="live-map-legend-item live-map-legend-item--voluntario">Voluntario</span>
            <span class="live-map-legend-item live-map-legend-item--adulto">Tú</span>
          </p>
          <div id="live-map-adulto-${sol.id}" class="live-map-container"></div>
          <p id="live-map-msg-adulto-${sol.id}" class="live-map-status"></p>
          <p id="geo-error-adulto-${sol.id}" class="live-map-geo-error" role="alert"></p>
          <div id="live-map-fallback-adulto-${sol.id}" class="live-map-fallback hidden">
            <p class="live-map-fallback-msg">Ubicación en vivo no disponible, usa la dirección de referencia</p>
            <p class="acompanamiento-direccion${dirInfo.sinRegistro ? ' acompanamiento-direccion--faltante' : ''}">
              <svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${dirInfo.texto}</span>
            </p>
          </div>
        </div>
      `;
    }

    return `
      <div class="solicitud-card">
        <p class="solicitud-info-line"><strong>Solicitud:</strong> ${tipoLabel}</p>
        <p class="solicitud-info-line"><strong>Estado:</strong> ${estadoLabel}</p>
        ${muestraVoluntario ? `<p class="solicitud-info-line"><strong>Voluntario:</strong> ${sol.universitarioNombre}</p>` : ''}
        <p class="solicitud-info-line"><strong>${sol.esProgramada ? 'Fecha programada' : 'Fecha'}:</strong> ${fechaFormateada}</p>
        ${sol.esProgramada ? '<span class="solicitud-programada-badge">Programada</span>' : ''}
        ${estadoExtraHtml}
      </div>
    `;
  }

  function renderSolicitudesActivas(todasSolicitudes) {
    const container = document.getElementById('solicitudes-activas');
    const list = document.getElementById('solicitudes-list');
    
    if (!container || !list) return;
    
    const estadosVisibles = ['activo', 'pendiente', 'programada', 'aceptada', 'en_camino', 'en_curso'];
    const solicitudesFiltradas = todasSolicitudes.filter(sol =>
      estadosVisibles.includes(sol.estado)
    );
    
    const solicitudesOrdenadas = solicitudesFiltradas
      .sort((a, b) => getAgendaSortDate(a) - getAgendaSortDate(b));
    
    if (solicitudesOrdenadas.length > 0) {
      container.classList.remove('hidden');
      const grupos = groupByAgendaDate(solicitudesOrdenadas);
      list.innerHTML = grupos.map((grupo) => `
        <div class="agenda-group">
          <h3 class="agenda-group-title">${grupo.label}</h3>
          ${grupo.items.map((sol) => renderTarjetaSolicitudActivaAdulto(sol)).join('')}
        </div>
      `).join('');
    } else {
      container.classList.add('hidden');
    }
  }

  function subscribeSolicitudesActivas() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    if (solicitudesActivasUnsubscribe) {
      solicitudesActivasUnsubscribe();
      solicitudesActivasUnsubscribe = null;
    }

    const solicitudesQuery = query(
      collection(window.db, 'solicitudes'),
      where('adultoMayorId', '==', uid),
      orderBy('fechaCreacion', 'desc')
    );

    solicitudesActivasUnsubscribe = onSnapshot(solicitudesQuery, (snapshot) => {
      const solicitudes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      const estadosVisibles = ['activo', 'pendiente', 'programada', 'aceptada', 'en_camino', 'en_curso'];
      const visibles = solicitudes.filter((sol) => estadosVisibles.includes(sol.estado));
      const structureKey = getSolicitudesStructureKey(visibles);

      // Re-render solo si cambió estado/lista; las ubicaciones solo mueven el marcador
      if (structureKey !== lastAdultoSolicitudesStructureKey) {
        lastAdultoSolicitudesStructureKey = structureKey;
        clearLiveMaps('adulto');
        renderSolicitudesActivas(solicitudes);
      }

      updateRecordatorioCache(visibles);
      syncAdultoLocationTracking(visibles);
      syncLiveMapsForRole(visibles, 'adulto');
    }, (error) => {
      console.error('Error al cargar solicitudes activas:', error);
    });
  }

  function loadSolicitudesActivas() {
    subscribeSolicitudesActivas();
  }

  function renderAcompanamientosAnterioresAdulto(solicitudes) {
    const container = document.getElementById('acompanamientos-anteriores');
    const list = document.getElementById('acompanamientos-anteriores-list');
    if (!container || !list) return;

    const ordenadas = [...solicitudes].sort((a, b) => {
      const finA = a.fechaFin?.toDate ? a.fechaFin.toDate().getTime() : new Date(a.fechaFin || 0).getTime();
      const finB = b.fechaFin?.toDate ? b.fechaFin.toDate().getTime() : new Date(b.fechaFin || 0).getTime();
      return finB - finA;
    });

    if (ordenadas.length === 0) {
      container.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');
    list.innerHTML = ordenadas.map((sol) => {
      const tipo = sol.tipoAyuda || sol.tipo;
      const tipoLabel = sol.tipoLabel || TIPO_AYUDA_LABELS[tipo] || tipo || 'General';
      const fechaFin = sol.fechaFin?.toDate
        ? sol.fechaFin.toDate()
        : (sol.fechaFin ? new Date(sol.fechaFin) : getFechaFromSolicitud(sol));
      const fechaLabel = fechaFin.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      return `
        <div class="solicitud-card">
          <p class="solicitud-info-line"><strong>Voluntario:</strong> ${sol.universitarioNombre || 'Universitario'}</p>
          <p class="solicitud-info-line"><strong>Tipo de ayuda:</strong> ${tipoLabel}</p>
          <p class="solicitud-info-line"><strong>Fecha:</strong> ${fechaLabel}</p>
          <div class="acompanamiento-actions" style="margin-top: 0.75rem;">
            <button class="btn-secondary" onclick="window.verAlbumDesdeAnterioresAdulto('${sol.id}')">
              Ver álbum
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function subscribeAcompanamientosAnterioresAdulto() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    if (acompanamientosAnterioresUnsubscribe) {
      acompanamientosAnterioresUnsubscribe();
      acompanamientosAnterioresUnsubscribe = null;
    }

    const anterioresQuery = query(
      collection(window.db, 'solicitudes'),
      where('adultoMayorId', '==', uid),
      where('estado', '==', 'finalizado'),
      orderBy('fechaFin', 'desc')
    );

    acompanamientosAnterioresUnsubscribe = onSnapshot(anterioresQuery, (snapshot) => {
      const solicitudes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderAcompanamientosAnterioresAdulto(solicitudes);
    }, (error) => {
      console.error('Error al cargar acompañamientos anteriores:', error);
      const fallbackQuery = query(
        collection(window.db, 'solicitudes'),
        where('adultoMayorId', '==', uid),
        where('estado', '==', 'finalizado')
      );
      acompanamientosAnterioresUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
        const solicitudes = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        renderAcompanamientosAnterioresAdulto(solicitudes);
      }, (fallbackError) => {
        console.error('Error en fallback de acompañamientos anteriores:', fallbackError);
      });
    });
  }

  /**
   * Rol de remitente para Firestore ("adultoMayor" | "universitario")
   */
  function getRemitenteRolActual() {
    if (AppState.userData?.rol === 'adultoMayor' || AppState.currentRole === 'adulto-mayor') {
      return 'adultoMayor';
    }
    return 'universitario';
  }

  function stopChatListener() {
    if (chatMensajesUnsubscribe) {
      chatMensajesUnsubscribe();
      chatMensajesUnsubscribe = null;
    }
    if (AppState.chatInterval) {
      clearInterval(AppState.chatInterval);
      AppState.chatInterval = null;
    }
  }

  function aplicarBadgeChatUnread(count = chatBadgeUnreadCount) {
    chatBadgeUnreadCount = Number(count) || 0;
    const label = chatBadgeUnreadCount > 9 ? '9+' : String(chatBadgeUnreadCount);
    const show = chatBadgeUnreadCount > 0;

    // Universitario: badge en botón "Ir al chat"
    document.querySelectorAll('.btn-ir-al-chat').forEach((button) => {
      let badge = button.querySelector('.chat-unread-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        button.appendChild(badge);
      }

      if (!show) {
        badge.hidden = true;
        badge.style.display = 'none';
        badge.textContent = '0';
      } else {
        badge.hidden = false;
        badge.style.display = '';
        badge.textContent = label;
      }
    });

    // Adulto mayor: badge en el ícono Chat de la barra inferior
    if (AppState.bottomNav && typeof AppState.bottomNav.setBadge === 'function') {
      AppState.bottomNav.setBadge('chat', chatBadgeUnreadCount);
    }
    document.querySelectorAll('.bottom-nav-item[data-nav="chat"]').forEach((button) => {
      const badge = button.querySelector('.nav-badge');
      if (!badge) return;
      if (!show) {
        badge.hidden = true;
        badge.style.display = 'none';
        badge.textContent = '0';
      } else {
        badge.hidden = false;
        badge.style.display = '';
        badge.textContent = label;
      }
    });
  }

  function stopChatBadgeMensajesListener() {
    if (chatBadgeMensajesUnsubscribe) {
      chatBadgeMensajesUnsubscribe();
      chatBadgeMensajesUnsubscribe = null;
    }
    chatBadgeSolicitudId = null;
  }

  function stopChatBadgeListener() {
    if (chatBadgeSolicitudesUnsubscribe) {
      chatBadgeSolicitudesUnsubscribe();
      chatBadgeSolicitudesUnsubscribe = null;
    }
    stopChatBadgeMensajesListener();
    chatBadgeUnreadCount = 0;
    aplicarBadgeChatUnread(0);
  }

  /**
   * SOLO LECTURA: cuenta mensajes no leídos para el badge.
   * Nunca escribe ni actualiza el campo "visto".
   */
  function subscribeChatBadgeMensajes(solicitudId, otherRol) {
    if (!solicitudId) {
      stopChatBadgeMensajesListener();
      aplicarBadgeChatUnread(0);
      return;
    }

    if (chatBadgeSolicitudId === solicitudId && chatBadgeMensajesUnsubscribe) {
      return;
    }

    stopChatBadgeMensajesListener();
    chatBadgeSolicitudId = solicitudId;

    const unreadQuery = query(
      collection(window.db, 'solicitudes', solicitudId, 'mensajes'),
      where('visto', '==', false),
      where('remitenteRol', '==', otherRol)
    );

    chatBadgeMensajesUnsubscribe = onSnapshot(
      unreadQuery,
      (snapshot) => {
        // Solo contar; no marcar como vistos
        aplicarBadgeChatUnread(snapshot.size);
      },
      (error) => {
        console.error('Error al escuchar mensajes no leídos (índice?):', error);
        chatBadgeMensajesUnsubscribe = onSnapshot(
          collection(window.db, 'solicitudes', solicitudId, 'mensajes'),
          (snapshot) => {
            const unreadCount = snapshot.docs.filter((docSnap) => {
              const data = docSnap.data();
              return data.visto === false && data.remitenteRol === otherRol;
            }).length;
            aplicarBadgeChatUnread(unreadCount);
          },
          (fallbackError) => {
            console.error('Error en fallback de badge de chat:', fallbackError);
          }
        );
      }
    );
  }

  /**
   * Suscribe el badge de no leídos al acompañamiento activo (solo lectura).
   */
  window.actualizarBadgeChat = function actualizarBadgeChat() {
    const uid = window.auth.currentUser?.uid;
    if (!uid || !window.db) {
      stopChatBadgeListener();
      return;
    }

    const miRol = getRemitenteRolActual();
    const otherRol = miRol === 'adultoMayor' ? 'universitario' : 'adultoMayor';
    const field = miRol === 'adultoMayor' ? 'adultoMayorId' : 'universitarioId';

    if (chatBadgeSolicitudesUnsubscribe) {
      aplicarBadgeChatUnread(chatBadgeUnreadCount);
      return;
    }

    const solicitudesQuery = query(
      collection(window.db, 'solicitudes'),
      where(field, '==', uid)
    );

    chatBadgeSolicitudesUnsubscribe = onSnapshot(
      solicitudesQuery,
      (snapshot) => {
        const activas = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((sol) => ESTADOS_ACOMPANAMIENTO_ACTIVOS.includes(sol.estado));

        if (!activas.length) {
          stopChatBadgeMensajesListener();
          aplicarBadgeChatUnread(0);
          return;
        }

        activas.sort((a, b) => getFechaAceptacion(b) - getFechaAceptacion(a));
        subscribeChatBadgeMensajes(activas[0].id, otherRol);
      },
      (error) => {
        console.error('Error al escuchar acompañamientos para badge de chat:', error);
        aplicarBadgeChatUnread(0);
      }
    );
  };

  function showChatLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="chat-empty-state chat-loading-state">
        <p>Cargando...</p>
      </div>
    `;
  }

  function showAlbumLoadingState(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = `
      <div class="album-empty-state album-loading-state">
        <p>Cargando...</p>
      </div>
    `;
  }

  async function obtenerSolicitudAceptadaParaChat() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return null;

    const field = getRemitenteRolActual() === 'adultoMayor' ? 'adultoMayorId' : 'universitarioId';
    const solicitudesQuery = query(
      collection(window.db, 'solicitudes'),
      where(field, '==', uid)
    );

    const snapshot = await getDocs(solicitudesQuery);
    if (snapshot.empty) return null;

    const solicitudes = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((sol) => ESTADOS_ACOMPANAMIENTO_ACTIVOS.includes(sol.estado));

    if (!solicitudes.length) return null;

    solicitudes.sort((a, b) => getFechaAceptacion(b) - getFechaAceptacion(a));
    return solicitudes[0];
  }

  function getFechaFromMensaje(msg) {
    if (msg.timestamp?.toDate) return msg.timestamp.toDate();
    if (msg.timestamp) return new Date(msg.timestamp);
    return new Date();
  }

  function renderChatMessages(messages, containerId, miRol) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!messages.length) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <p>Aún no hay mensajes.</p>
          <p class="chat-empty-hint">Puedes iniciar la conversación cuando quieras.</p>
        </div>
      `;
      return;
    }

    const doubleCheckSvg = (estadoClass) => `
      <svg class="icon icon-check-double ${estadoClass}" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="1 7 4.5 10.5 10 2.5"></polyline>
        <polyline points="7 7 10.5 10.5 16 2.5"></polyline>
      </svg>`;

    container.innerHTML = messages.map((msg) => {
      const esEnviado = msg.remitenteRol === miRol;
      // Solo en mensajes enviados: ✓✓ gris (no leído) o ✓✓ azul (leído)
      const vistoIcon = esEnviado
        ? doubleCheckSvg(msg.visto ? 'icon-check-double--visto' : 'icon-check-double--enviado')
        : '';

      const hora = getFechaFromMensaje(msg).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="chat-message-wrapper ${esEnviado ? 'sent-wrapper' : 'received-wrapper'}">
          <div class="chat-message ${esEnviado ? 'sent' : 'received'}">
            <div class="message-text">${msg.texto || ''}</div>
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

  function isChatScreenActive() {
    return AppState.currentPage === 'adulto-mayor-chat'
      || AppState.currentPage === 'universitario-chat';
  }

  async function marcarMensajesComoVistos(messages) {
    // Solo al estar realmente en la pantalla de chat (nunca desde el badge)
    if (!isChatScreenActive()) return;

    const uid = window.auth.currentUser?.uid;
    const solicitudId = AppState.chatId;
    if (!uid || !solicitudId || !messages?.length) return;

    const pendientes = messages.filter(
      (msg) => msg.remitenteId !== uid && msg.visto === false
    );

    await Promise.all(
      pendientes.map((msg) =>
        updateDoc(doc(window.db, 'solicitudes', solicitudId, 'mensajes', msg.id), {
          visto: true
        }).catch((error) => {
          console.error('Error al marcar mensaje como visto:', error);
        })
      )
    );
  }

  function subscribeChatMessages(solicitudId, containerId, miRol) {
    stopChatListener();
    showChatLoadingState(containerId);
    AppState.chatId = solicitudId;
    const generation = ++chatSubscribeGeneration;

    const mensajesQuery = query(
      collection(window.db, 'solicitudes', solicitudId, 'mensajes'),
      orderBy('timestamp', 'asc')
    );

    chatMensajesUnsubscribe = onSnapshot(mensajesQuery, (snapshot) => {
      if (generation !== chatSubscribeGeneration || AppState.chatId !== solicitudId) {
        return;
      }
      if (!isChatScreenActive()) {
        return;
      }
      const messages = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderChatMessages(messages, containerId, miRol);
      marcarMensajesComoVistos(messages);
    }, (error) => {
      if (generation !== chatSubscribeGeneration || AppState.chatId !== solicitudId) {
        return;
      }
      console.error('Error al escuchar mensajes del chat:', error);
    });
  }

  async function enviarMensajeChat(inputId) {
    const chatInput = document.getElementById(inputId);
    const message = chatInput?.value.trim();
    const solicitudId = AppState.chatId;
    const uid = window.auth.currentUser?.uid;

    if (!message || !solicitudId || !uid) return;

    chatInput.value = '';

    try {
      await addDoc(collection(window.db, 'solicitudes', solicitudId, 'mensajes'), {
        texto: message,
        remitenteId: uid,
        remitenteRol: getRemitenteRolActual(),
        timestamp: serverTimestamp(),
        visto: false
      });
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      chatInput.value = message;
      alert('No se pudo enviar el mensaje. Intenta de nuevo.');
    }
  }

  function bindChatSendListeners(sendBtnId, inputId, sendFn) {
    const sendBtn = document.getElementById(sendBtnId);
    const chatInput = document.getElementById(inputId);
    if (!sendBtn || !chatInput) return;

    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    const newChatInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(newChatInput, chatInput);

    document.getElementById(sendBtnId).addEventListener('click', sendFn);
    document.getElementById(inputId).addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendFn();
      }
    });
  }

  async function initAdultoMayorChat() {
    initBottomNavigation('bottom-nav-container-chat', 'chat');
    stopChatListener();
    chatSubscribeGeneration += 1;
    const initGeneration = chatSubscribeGeneration;

    const messagesEl = document.getElementById('chat-messages');
    const inputContainer = document.getElementById('chat-input-container');
    showChatLoadingState('chat-messages');
    inputContainer?.classList.add('hidden');

    const desvinculacion = JSON.parse(localStorage.getItem('acompanamientoDesvinculado') || 'null');
    if (desvinculacion && desvinculacion.adultoMayor === AppState.userData?.nombre) {
      localStorage.removeItem('adultoMayorVoluntario');
      if (messagesEl) {
        messagesEl.innerHTML = `
          <div class="chat-empty-state">
            <p>El acompañamiento ha sido finalizado</p>
            <p class="chat-empty-hint">Ya no puedes chatear con este voluntario</p>
          </div>
        `;
      }
      inputContainer?.classList.add('hidden');
      localStorage.removeItem('acompanamientoDesvinculado');
      AppState.chatId = null;
      return;
    }

    let solicitud = null;
    try {
      solicitud = await obtenerSolicitudAceptadaParaChat();
    } catch (error) {
      console.error('Error al cargar solicitud para chat:', error);
    }

    if (initGeneration !== chatSubscribeGeneration) return;

    if (!solicitud) {
      if (messagesEl) {
        messagesEl.innerHTML = `
          <div class="chat-empty-state">
            <p>Aún no hay mensajes.</p>
            <p class="chat-empty-hint">Puedes iniciar la conversación cuando un voluntario acepte tu solicitud.</p>
          </div>
        `;
      }
      inputContainer?.classList.add('hidden');
      AppState.chatId = null;
      return;
    }

    let universidad = '';
    if (solicitud.universitarioId) {
      try {
        const uniDoc = await getDoc(doc(window.db, 'usuarios', solicitud.universitarioId));
        if (uniDoc.exists()) {
          universidad = uniDoc.data().universidad || '';
        }
      } catch (error) {
        console.error('Error al cargar datos del voluntario:', error);
      }
    }

    if (initGeneration !== chatSubscribeGeneration) return;

    const infoContainer = document.getElementById('chat-voluntario-info');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <p><strong>Tu acompañante:</strong> ${solicitud.universitarioNombre || 'Voluntario'}</p>
        ${universidad ? `<p><strong>Universidad:</strong> ${universidad}</p>` : ''}
      `;
    }

    AppState.chatId = solicitud.id;
    inputContainer?.classList.remove('hidden');
    bindChatSendListeners('chat-send-btn', 'chat-input', sendChatMessage);
    subscribeChatMessages(solicitud.id, 'chat-messages', 'adultoMayor');
  }

  function sendChatMessage() {
    enviarMensajeChat('chat-input');
  }

  /**
   * Obtiene la solicitud del álbum:
   * - Sin forzar: solo acompañamiento activo (en_camino / en_curso)
   * - Con forcedSolicitudId: ese acompañamiento (p. ej. desde Historial, solo lectura)
   */
  async function obtenerSolicitudParaAlbum(forcedSolicitudId = null) {
    if (forcedSolicitudId) {
      const snap = await getDoc(doc(window.db, 'solicitudes', forcedSolicitudId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    }

    const uid = window.auth.currentUser?.uid;
    if (!uid) return null;

    const field = getRemitenteRolAlbum() === 'adultoMayor' ? 'adultoMayorId' : 'universitarioId';
    const snapshot = await getDocs(
      query(collection(window.db, 'solicitudes'), where(field, '==', uid))
    );

    const activas = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((s) => ESTADOS_ALBUM_SUBIDA.includes(s.estado))
      .sort((a, b) => getFechaAceptacion(b) - getFechaAceptacion(a));

    return activas[0] || null;
  }

  function renderAlbumGrid(photos, gridId, canDelete) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    if (!photos.length) {
      const emptyHint = albumCanUpload
        ? 'Cuando compartas una foto, aparecerá en este espacio.'
        : 'Las fotos de este acompañamiento aparecerán aquí.';
      grid.innerHTML = `
        <div class="album-empty-state">
          <p>Aún no hay recuerdos aquí.</p>
          <p class="album-empty-hint">${emptyHint}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = photos.map((photo) => `
      <div class="album-photo-container">
        <img src="${photo.url}" alt="Foto del álbum" class="album-photo" />
        ${canDelete ? `
          <button class="btn-eliminar-foto" data-photo-id="${photo.id}" aria-label="Eliminar foto">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        ` : ''}
      </div>
    `).join('');

    if (canDelete) {
      grid.querySelectorAll('.btn-eliminar-foto').forEach((btn) => {
        btn.addEventListener('click', function() {
          eliminarFotoAlbum(this.getAttribute('data-photo-id'));
        });
      });
    }
  }

  function subscribeAlbumFotos(solicitudId, gridId) {
    stopAlbumListener();
    showAlbumLoadingState(gridId);
    albumCurrentSolicitudId = solicitudId;
    const generation = ++albumSubscribeGeneration;

    const albumQuery = query(
      collection(window.db, 'solicitudes', solicitudId, 'album'),
      orderBy('fechaSubida', 'asc')
    );

    albumFotosUnsubscribe = onSnapshot(albumQuery, (snapshot) => {
      if (generation !== albumSubscribeGeneration || albumCurrentSolicitudId !== solicitudId) {
        return;
      }
      const photos = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderAlbumGrid(photos, gridId, albumCanUpload);
    }, (error) => {
      if (generation !== albumSubscribeGeneration || albumCurrentSolicitudId !== solicitudId) {
        return;
      }
      console.error('Error al escuchar álbum:', error);
      // Fallback sin orderBy si falta índice
      albumFotosUnsubscribe = onSnapshot(
        collection(window.db, 'solicitudes', solicitudId, 'album'),
        (snapshot) => {
          if (generation !== albumSubscribeGeneration || albumCurrentSolicitudId !== solicitudId) {
            return;
          }
          const photos = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const fa = a.fechaSubida?.toDate ? a.fechaSubida.toDate() : new Date(0);
              const fb = b.fechaSubida?.toDate ? b.fechaSubida.toDate() : new Date(0);
              return fa - fb;
            });
          renderAlbumGrid(photos, gridId, albumCanUpload);
        }
      );
    });
  }

  async function uploadAlbumPhoto(file) {
    const uid = window.auth.currentUser?.uid;
    if (!uid || !albumCurrentSolicitudId || !albumCanUpload) {
      alert('Solo puedes subir fotos durante un acompañamiento en camino o en curso.');
      return;
    }
    if (!window.storage) {
      alert('Storage no está disponible. Recarga la página.');
      return;
    }

    const nombreArchivo = crearNombreArchivoAlbum(file);
    const storagePath = `solicitudes/${albumCurrentSolicitudId}/album/${nombreArchivo}`;
    const storageRef = ref(window.storage, storagePath);

    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(window.db, 'solicitudes', albumCurrentSolicitudId, 'album'), {
        url,
        storagePath,
        subidoPor: uid,
        subidoPorRol: getRemitenteRolAlbum(),
        fechaSubida: serverTimestamp()
      });
    } catch (error) {
      console.error('Error al subir foto al álbum:', error);
      alert('No se pudo subir la foto. Intenta de nuevo.');
    }
  }

  async function eliminarFotoAlbum(photoId) {
    if (!albumCanUpload || !albumCurrentSolicitudId || !photoId) return;
    if (!confirm('¿Estás seguro que quieres eliminar esta foto?')) return;

    try {
      const photoRef = doc(window.db, 'solicitudes', albumCurrentSolicitudId, 'album', photoId);
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        const data = photoSnap.data();
        if (data.storagePath && window.storage) {
          try {
            await deleteObject(ref(window.storage, data.storagePath));
          } catch (storageError) {
            console.warn('No se pudo borrar el archivo de Storage:', storageError);
          }
        }
      }
      await deleteDoc(photoRef);
    } catch (error) {
      console.error('Error al eliminar foto:', error);
      alert('No se pudo eliminar la foto. Intenta de nuevo.');
    }
  }

  function bindAlbumUploadControls(addBtnId, inputId) {
    const addPhotoBtn = document.getElementById(addBtnId);
    const photoInput = document.getElementById(inputId);
    if (!addPhotoBtn || !photoInput) return;

    const newAddPhotoBtn = addPhotoBtn.cloneNode(true);
    addPhotoBtn.parentNode.replaceChild(newAddPhotoBtn, addPhotoBtn);
    const newPhotoInput = photoInput.cloneNode(true);
    photoInput.parentNode.replaceChild(newPhotoInput, photoInput);

    const btn = document.getElementById(addBtnId);
    const input = document.getElementById(inputId);

    if (!albumCanUpload) {
      btn.classList.add('hidden');
      return;
    }

    btn.classList.remove('hidden');

    if (isNativePlatform()) {
      input.classList.add('hidden');
      btn.addEventListener('click', async () => {
        try {
          const file = await takePhotoWithNativeCamera('album');
          await uploadAlbumPhoto(file);
        } catch (error) {
          if (error?.message === 'User cancelled photos app') return;
          console.error('Error al capturar foto del álbum:', error);
          alert('No se pudo tomar la foto. Intenta de nuevo.');
        }
      });
      return;
    }

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', function(e) {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => {
        if (file.type.startsWith('image/')) {
          uploadAlbumPhoto(file);
        }
      });
      this.value = '';
    });
  }

  function showAlbumWaitingState(gridId, addBtnId, isAdulto) {
    stopAlbumListener();
    albumCanUpload = false;
    const grid = document.getElementById(gridId);
    const addBtn = document.getElementById(addBtnId);
    if (addBtn) addBtn.classList.add('hidden');
    if (grid) {
      grid.innerHTML = `
        <div class="album-empty-state">
          <p>Aún no tienes un acompañamiento activo</p>
          <p class="album-empty-hint">${
            isAdulto
              ? 'Cuando un voluntario vaya en camino o el acompañamiento esté en curso, podrás compartir fotos aquí. Los álbumes pasados están en Acompañamientos anteriores.'
              : 'Cuando vayas en camino o el acompañamiento esté en curso, podrás agregar fotos aquí. Los álbumes pasados están en Historial.'
          }</p>
        </div>
      `;
    }

    if (isAdulto && AppState.currentPage === 'adulto-mayor-album') {
      const colibriWrapper = document.getElementById('colibri-guide-wrapper');
      if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
        if (!AppState.colibriGuide) {
          AppState.colibriGuide = new ColibriGuide(colibriWrapper);
        }
        AppState.colibriGuide.showMessage('album-empty');
      }
    }
  }

  async function setupAlbumPage({ gridId, addBtnId, inputId, forcedSolicitudId = null, isAdulto = false }) {
    if (AppState.albumInterval) {
      clearInterval(AppState.albumInterval);
      AppState.albumInterval = null;
    }

    stopAlbumListener();
    albumSubscribeGeneration += 1;
    const initGeneration = albumSubscribeGeneration;
    showAlbumLoadingState(gridId);
    const addBtn = document.getElementById(addBtnId);
    if (addBtn) addBtn.classList.add('hidden');

    let solicitud = null;
    try {
      solicitud = await obtenerSolicitudParaAlbum(forcedSolicitudId);
    } catch (error) {
      console.error('Error al cargar solicitud del álbum:', error);
    }

    if (initGeneration !== albumSubscribeGeneration) return;

    if (!solicitud) {
      showAlbumWaitingState(gridId, addBtnId, isAdulto);
      return;
    }

    // Subir solo en en_camino/en_curso; desde Historial siempre solo lectura
    albumCanUpload = !forcedSolicitudId && ESTADOS_ALBUM_SUBIDA.includes(solicitud.estado);

    bindAlbumUploadControls(addBtnId, inputId);
    subscribeAlbumFotos(solicitud.id, gridId);
  }

  window.verAlbumDesdeAnterioresAdulto = function(solicitudId) {
    AppState.albumForcedSolicitudId = solicitudId;
    navigateToPage('album');
  };

  async function initAdultoMayorAlbum() {
    initBottomNavigation('bottom-nav-container-album', 'album');
    const forcedSolicitudId = AppState.albumForcedSolicitudId || null;
    AppState.albumForcedSolicitudId = null;
    await setupAlbumPage({
      gridId: 'album-grid',
      addBtnId: 'add-photo-btn',
      inputId: 'photo-input',
      forcedSolicitudId,
      isAdulto: true
    });
  }

  function initAdultoMayorPerfil() {
    initBottomNavigation('bottom-nav-container-perfil', 'perfil');
    
    loadPerfilData();
    
    document.getElementById('editar-perfil-btn')?.addEventListener('click', editarPerfil);
    document.getElementById('cambiar-acompanante-btn')?.addEventListener('click', cambiarAcompanante);
    document.getElementById('anular-acompanante-btn')?.addEventListener('click', anularAcompanante);
    document.getElementById('enviar-calificacion-btn')?.addEventListener('click', enviarCalificacion);
    document.getElementById('cerrar-sesion-btn')?.addEventListener('click', cerrarSesion);
    
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const rating = parseInt(this.getAttribute('data-rating'));
        selectRating(rating);
      });
    });
  }

  async function loadPerfilData() {
    if (!AppState.userData) return;
    
    document.getElementById('perfil-nombre').textContent = AppState.userData.nombre;
    document.getElementById('perfil-edad').textContent = AppState.userData.edad + ' años';
    document.getElementById('perfil-zona').textContent = AppState.userData.zona;
    const perfilDireccion = document.getElementById('perfil-direccion');
    if (perfilDireccion) {
      perfilDireccion.textContent = AppState.userData.direccion || 'No registrada';
    }
    document.getElementById('perfil-telefono').textContent = AppState.userData.telefono;
    setupEmergenciaCallButton('llamar-emergencia-adulto-btn', 'emergencia-vacio-adulto');

    AppState.solicitudParaCalificar = null;

    const acompananteSection = document.getElementById('acompanante-section');
    const acompananteInfo = document.getElementById('acompanante-info');
    const acompananteActions = document.getElementById('acompanante-actions');
    const calificacionForm = document.getElementById('calificacion-form');
    const calificacionEmpty = document.getElementById('calificacion-empty');
    const uid = window.auth.currentUser?.uid;

    let solicitudActiva = null;
    let solicitudParaCalificar = null;

    if (uid) {
      try {
        const solicitudesSnap = await getDocs(
          query(collection(window.db, 'solicitudes'), where('adultoMayorId', '==', uid))
        );
        const solicitudes = solicitudesSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        solicitudActiva = solicitudes
          .filter((s) => ESTADOS_ACOMPANAMIENTO_ACTIVOS.includes(s.estado))
          .sort((a, b) => getFechaAceptacion(b) - getFechaAceptacion(a))[0] || null;

        solicitudParaCalificar = solicitudes
          .filter((s) => s.estado === 'finalizado' && (s.calificacion == null || s.calificacion === undefined))
          .sort((a, b) => {
            const finA = a.fechaFin?.toDate ? a.fechaFin.toDate() : new Date(a.fechaFin || 0);
            const finB = b.fechaFin?.toDate ? b.fechaFin.toDate() : new Date(b.fechaFin || 0);
            return finB - finA;
          })[0] || null;
      } catch (error) {
        console.error('Error al cargar solicitudes del perfil:', error);
      }
    }

    if (solicitudActiva) {
      AppState.perfilSolicitudActivaId = solicitudActiva.id;
      if (acompananteSection) acompananteSection.classList.remove('hidden');
      if (acompananteInfo) {
        acompananteInfo.innerHTML = `
          <p><strong>Nombre:</strong> ${solicitudActiva.universitarioNombre || 'Voluntario'}</p>
          <p><strong>Estado:</strong> ${ESTADO_LABELS[solicitudActiva.estado] || solicitudActiva.estado}</p>
        `;
        acompananteInfo.classList.remove('acompanante-empty');
      }
      if (acompananteActions) acompananteActions.classList.remove('hidden');
    } else {
      AppState.perfilSolicitudActivaId = null;
      if (acompananteSection) acompananteSection.classList.add('hidden');
    }

    if (solicitudParaCalificar) {
      AppState.solicitudParaCalificar = solicitudParaCalificar;
      calificacionForm?.classList.remove('hidden');
      calificacionEmpty?.classList.add('hidden');
    } else {
      calificacionForm?.classList.add('hidden');
      calificacionEmpty?.classList.remove('hidden');
    }
  }

  function editarPerfil() {
    showPage('adulto-mayor-registro');
    initAdultoMayorRegistro();
    
    if (AppState.userData) {
      document.getElementById('nombre').value = AppState.userData.nombre;
      document.getElementById('edad').value = AppState.userData.edad;
      document.getElementById('telefono').value = AppState.userData.telefono;
      document.getElementById('zona').value = AppState.userData.zona;
      
      AppState.userData.necesidades.forEach(nec => {
        const checkbox = document.querySelector(`input[value="${nec}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  }

  // Flujo de cambio de acompañante no está definido en la app; botón oculto en el HTML.
  function cambiarAcompanante() {
    return;
  }

  async function anularAcompanante() {
    const solicitudId = AppState.perfilSolicitudActivaId;
    if (!solicitudId) {
      alert('No tienes un acompañamiento activo para anular.');
      return;
    }

    if (!confirm('¿Deseas anular este acompañamiento?')) return;

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        estado: 'cancelada',
        fechaCancelacion: serverTimestamp()
      });

      stopChatListener();
      chatSubscribeGeneration += 1;
      AppState.chatId = null;
      stopLocationWatch();
      clearLiveMaps();
      AppState.perfilSolicitudActivaId = null;

      await loadPerfilData();

      if (AppState.currentPage === 'adulto-mayor-chat') {
        showPage('adulto-mayor-home');
        initAdultoMayorHome();
      }

      if (AppState.colibriGuide) {
        AppState.colibriGuide.showMessage('accompaniment-completed');
      }

      alert('El acompañamiento ha terminado.\nEstamos aquí si necesitas volver a pedir apoyo.');
    } catch (error) {
      console.error('Error al anular acompañamiento:', error);
      alert('No se pudo anular el acompañamiento. Intenta de nuevo.');
    }
  }

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

  async function enviarCalificacion() {
    if (selectedRating === 0) {
      alert('Por favor, selecciona una calificación');
      return;
    }

    const solicitud = AppState.solicitudParaCalificar;
    if (!solicitud?.id || !solicitud.universitarioId) {
      alert('No hay un acompañamiento finalizado pendiente de calificar.');
      return;
    }

    const comentario = document.getElementById('calificacion-comentario')?.value?.trim() || '';
    const enviarBtn = document.getElementById('enviar-calificacion-btn');
    if (enviarBtn) enviarBtn.disabled = true;

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitud.id), {
        calificacion: selectedRating,
        comentarioCalificacion: comentario,
        fechaCalificacion: serverTimestamp()
      });

      // Recalcular promedio y puntaje del universitario desde sus finalizadas
      const finalizadasSnap = await getDocs(
        query(
          collection(window.db, 'solicitudes'),
          where('universitarioId', '==', solicitud.universitarioId),
          where('estado', '==', 'finalizado')
        )
      );

      const finalizadas = finalizadasSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        // Incluir la calificación recién enviada por si el snapshot aún no la refleja
        ...(docSnap.id === solicitud.id
          ? { calificacion: selectedRating, comentarioCalificacion: comentario }
          : {})
      }));

      const stats = calcularPuntajeUniversitario(finalizadas);

      await updateDoc(doc(window.db, 'usuarios', solicitud.universitarioId), {
        calificacionPromedio: Number(stats.calificacionPromedio.toFixed(2)),
        puntaje: stats.puntosTotales,
        acompanamientos: stats.acompanamientos,
        semanasActivas: stats.semanasActivas
      });

      if (AppState.colibriGuide) {
        AppState.colibriGuide.showMessage('completed');
      }

      alert('¡Gracias por tu calificación! El puntaje del voluntario ha sido actualizado.');

      selectedRating = 0;
      document.querySelectorAll('.star-btn').forEach((btn) => btn.classList.remove('active'));
      const comentarioEl = document.getElementById('calificacion-comentario');
      if (comentarioEl) comentarioEl.value = '';
      AppState.solicitudParaCalificar = null;
      await loadPerfilData();
    } catch (error) {
      console.error('Error al enviar calificación:', error);
      alert('No se pudo guardar la calificación. Intenta de nuevo.');
    } finally {
      if (enviarBtn) enviarBtn.disabled = false;
    }
  }

  function cerrarSesion() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      signOut(window.auth).finally(() => {
        AppState.currentRole = null;
        AppState.currentPage = null;
        AppState.userData = null;
        AppState.voluntarioSeleccionado = null;
        AppState.tipoAyudaSeleccionado = null;
        AppState.chatId = null;
        awaitingEmailVerification = false;
        pendingVerificationCredentials = null;
        
        stopChatListener();
        stopChatBadgeListener();
        if (historialAcompanamientosUnsubscribe) {
          historialAcompanamientosUnsubscribe();
          historialAcompanamientosUnsubscribe = null;
        }
        if (acompanamientosAnterioresUnsubscribe) {
          acompanamientosAnterioresUnsubscribe();
          acompanamientosAnterioresUnsubscribe = null;
        }
        if (puntajeSolicitudesUnsubscribe) {
          puntajeSolicitudesUnsubscribe();
          puntajeSolicitudesUnsubscribe = null;
        }
        stopAlbumListener();
        AppState.albumForcedSolicitudId = null;
        stopAprobacionListener();
        stopAdminListeners();
        stopDocenteListeners();
        stopRecordatorioAcompanamientos();
        if (solicitudesDisponiblesUnsubscribe) {
          solicitudesDisponiblesUnsubscribe();
          solicitudesDisponiblesUnsubscribe = null;
        }
        if (solicitudesProgramadasUnsubscribe) {
          solicitudesProgramadasUnsubscribe();
          solicitudesProgramadasUnsubscribe = null;
        }
        stopVoluntarioLocationWatch();
        clearLiveMaps();
        lastAdultoSolicitudesStructureKey = null;
        lastUniAcompanamientosStructureKey = null;
        
        localStorage.clear();
        
        showPage('role-selection');
        document.getElementById('role-selection').classList.remove('hidden');
      });
    }
  }

  /**
   * ============================================
   * FLUJO UNIVERSITARIO
   * ============================================
   */

  function initUniversitarioFlow() {
    if (window.auth.currentUser?.emailVerified && AppState.userData?.rol === 'universitario') {
      routeToHomeByRole('universitario');
    } else {
      showPage('universitario-registro');
      document.getElementById('uni-docs-cedula-group')?.classList.remove('hidden');
      document.getElementById('uni-docs-rostro-group')?.classList.remove('hidden');
      document.getElementById('uni-docs-carnet-group')?.classList.remove('hidden');
      initUniversitarioRegistro();
    }
  }

  function initUniversitarioRegistro() {
    const registroForm = document.getElementById('registro-universitario-form');
    if (!registroForm || registroForm.dataset.initialized === 'true') return;
    registroForm.dataset.initialized = 'true';
    
    registroForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const nombre = document.getElementById('uni-nombre').value.trim();
      const universidad = document.getElementById('universidad').value.trim();
      const carrera = document.getElementById('carrera').value.trim();
      const telefono = document.getElementById('uni-telefono').value.trim();
      const telefonoEmergencia = document.getElementById('uni-telefono-emergencia').value.trim();
      const zona = document.getElementById('uni-zona').value;
      const habilidades = Array.from(document.querySelectorAll('input[name="habilidades"]:checked')).map(cb => cb.value);
      const email = document.getElementById('uni-email').value.trim();
      const password = document.getElementById('uni-password').value;
      const cedulaFile = getDocPhotoFile('doc-cedula-uni');
      const rostroFile = getDocPhotoFile('doc-rostro-uni');
      const carnetFile = getDocPhotoFile('doc-carnet-uni');
      const isEditingProfile = Boolean(
        window.auth.currentUser?.emailVerified && AppState.userData?.rol === 'universitario'
      );

      // En edición de perfil no se piden documentos de nuevo
      const docsCedulaGroup = document.getElementById('uni-docs-cedula-group');
      const docsRostroGroup = document.getElementById('uni-docs-rostro-group');
      const docsCarnetGroup = document.getElementById('uni-docs-carnet-group');
      if (isEditingProfile) {
        docsCedulaGroup?.classList.add('hidden');
        docsRostroGroup?.classList.add('hidden');
        docsCarnetGroup?.classList.add('hidden');
      } else {
        docsCedulaGroup?.classList.remove('hidden');
        docsRostroGroup?.classList.remove('hidden');
        docsCarnetGroup?.classList.remove('hidden');
      }
      
      if (!validateUniversitarioRegistroForm(
        nombre, universidad, carrera, telefono, telefonoEmergencia, zona, habilidades, email, password, isEditingProfile, cedulaFile, rostroFile, carnetFile
      )) {
        return;
      }

      if (isEditingProfile) {
        const uid = window.auth.currentUser.uid;
        const updatedData = {
          nombre,
          universidad,
          carrera,
          telefono,
          telefonoEmergencia,
          zona,
          habilidades
        };

        try {
          await setDoc(doc(window.db, 'usuarios', uid), updatedData, { merge: true });
          AppState.userData = {
            ...AppState.userData,
            ...updatedData
          };
          syncUserDataToLocalStorage(AppState.userData);
          showPage('universitario-perfil');
          initUniversitarioPerfil();
          alert('Tu perfil fue actualizado correctamente.');
        } catch (error) {
          console.error('Error al actualizar perfil:', error);
          alert('No se pudo actualizar tu perfil. Intenta de nuevo.');
        }
        return;
      }
      
      const userData = {
        nombre: nombre,
        universidad: universidad,
        carrera: carrera,
        telefono: telefono,
        telefonoEmergencia: telefonoEmergencia,
        zona: zona,
        habilidades: habilidades,
        fechaRegistro: new Date().toISOString(),
        puntaje: 0,
        acompanamientos: 0,
        calificacionPromedio: 0
      };

      registrationInProgress = true;
      try {
        const credential = await createUserWithEmailAndPassword(window.auth, email, password);
        const uid = credential.user.uid;
        await sendEmailVerification(credential.user);
        const documentos = await uploadDocumentosRegistro(uid, {
          cedula: cedulaFile,
          rostro: rostroFile,
          carnetUniversitario: carnetFile
        });
        await setDoc(doc(window.db, 'usuarios', uid), {
          ...userData,
          rol: 'universitario',
          email,
          documentos,
          estadoAprobacion: 'pendiente'
        });
      } catch (error) {
        console.error('Error en registro universitario:', error);
        document.getElementById('error-uni-email').textContent =
          error.code ? getAuthErrorMessage(error) : 'No se pudo completar el registro. Intenta de nuevo.';
        return;
      } finally {
        registrationInProgress = false;
      }

      await handlePostRegistrationVerification(email, password);
    });
  }

  function validateUniversitarioRegistroForm(
    nombre, universidad, carrera, telefono, telefonoEmergencia, zona, habilidades, email, password, isEditingProfile = false, cedulaFile = null, rostroFile = null, carnetFile = null
  ) {
    let isValid = true;
    
    document.querySelectorAll('[id^="error-uni"]').forEach(el => el.textContent = '');
    document.getElementById('error-doc-cedula-uni') && (document.getElementById('error-doc-cedula-uni').textContent = '');
    document.getElementById('error-doc-rostro-uni') && (document.getElementById('error-doc-rostro-uni').textContent = '');
    document.getElementById('error-doc-carnet-uni') && (document.getElementById('error-doc-carnet-uni').textContent = '');
    
    if (!nombre || nombre.length < 2) {
      document.getElementById('error-uni-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    if (!universidad || universidad.length < 2) {
      document.getElementById('error-universidad').textContent = 'Ingresa el nombre de tu universidad';
      isValid = false;
    }
    
    if (!carrera || carrera.length < 2) {
      document.getElementById('error-carrera').textContent = 'Ingresa tu carrera';
      isValid = false;
    }
    
    if (!telefono || telefono.length < 8) {
      document.getElementById('error-uni-telefono').textContent = 'Ingresa un teléfono válido';
      isValid = false;
    }

    if (!telefonoEmergencia || telefonoEmergencia.length < 8) {
      document.getElementById('error-uni-telefono-emergencia').textContent = 'Ingresa un teléfono de emergencia válido';
      isValid = false;
    }
    
    if (!zona) {
      document.getElementById('error-uni-zona').textContent = 'Selecciona una zona';
      isValid = false;
    }
    
    if (!habilidades || habilidades.length === 0) {
      document.getElementById('error-uni-habilidades').textContent = 'Selecciona al menos una habilidad';
      isValid = false;
    }

    if (!isEditingProfile) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('error-uni-email').textContent = 'Ingresa un correo electrónico válido';
        isValid = false;
      }

      if (!password || password.length < 6) {
        document.getElementById('error-uni-password').textContent = 'La contraseña debe tener al menos 6 caracteres';
        isValid = false;
      }

      if (!cedulaFile || !cedulaFile.type.startsWith('image/')) {
        document.getElementById('error-doc-cedula-uni').textContent = 'Sube una foto de tu cédula';
        isValid = false;
      }

      if (!rostroFile || !rostroFile.type.startsWith('image/')) {
        document.getElementById('error-doc-rostro-uni').textContent = 'Sube una foto de tu rostro';
        isValid = false;
      }

      if (!carnetFile || !carnetFile.type.startsWith('image/')) {
        document.getElementById('error-doc-carnet-uni').textContent = 'Sube una foto de tu carnet universitario';
        isValid = false;
      }
    }
    
    return isValid;
  }

  function initUniversitarioHome() {
    const colibriWrapper = document.getElementById('colibri-guide-wrapper-uni');
    if (colibriWrapper && typeof ColibriGuide !== 'undefined') {
      AppState.colibriGuide = new ColibriGuide(colibriWrapper);
    }
    
    initBottomNavigationUni('bottom-nav-container-uni', 'solicitudes');
    window.actualizarBadgeChat();
    
    const filtroZona = document.getElementById('filtro-zona');
    if (filtroZona && filtroZona.dataset.bound !== 'true') {
      filtroZona.dataset.bound = 'true';
      filtroZona.addEventListener('change', function() {
        const zona = this.value;
        renderSolicitudesDisponibles(solicitudesPendientesCache, zona);
        renderSolicitudesProgramadas(solicitudesProgramadasCache, zona);
      });
    }

    initUniSolicitudesTabs();
    
    subscribeSolicitudesDisponibles();
    subscribeSolicitudesProgramadas();
    
    loadAcompanamientosActivos();
    startRecordatorioAcompanamientos();
  }

  function initUniSolicitudesTabs() {
    const tabs = document.querySelectorAll('.uni-solicitudes-tab');
    if (!tabs.length || tabs[0].dataset.bound === 'true') return;

    tabs.forEach((tab) => {
      tab.dataset.bound = 'true';
      tab.addEventListener('click', function() {
        const target = this.dataset.tab;
        tabs.forEach((t) => {
          const isActive = t.dataset.tab === target;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        document.getElementById('solicitudes-urgentes-panel')
          ?.classList.toggle('hidden', target !== 'urgentes');
        document.getElementById('solicitudes-programadas-panel')
          ?.classList.toggle('hidden', target !== 'programadas');
      });
    });
  }

  function initBottomNavigationUni(containerId, activePage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const navItems = [
      { id: 'solicitudes', label: 'Solicitudes', icon: '' },
      { id: 'historial', label: 'Historial', icon: '' },
      { id: 'album', label: 'Álbum', icon: '' },
      { id: 'puntaje', label: 'Puntaje', icon: '' },
      { id: 'perfil', label: 'Perfil', icon: '' }
    ];
    
    if (typeof BottomNavigation !== 'undefined') {
      AppState.bottomNav = new BottomNavigation(container, navItems, function(navId) {
        navigateToPageUni(navId);
      });
      
      if (activePage) {
        AppState.bottomNav.setActive(activePage);
      }
      aplicarBadgeChatUnread();
    }
  }

  window.navigateToPageUni = function(pageId) {
    if (pageId !== 'chat') {
      stopChatListener();
      chatSubscribeGeneration += 1;
      AppState.chatId = null;
    }

    const pageMap = {
      'solicitudes': 'universitario-home',
      'chat': 'universitario-chat',
      'historial': 'universitario-historial',
      'rutas': 'universitario-historial',
      'album': 'universitario-album',
      'puntaje': 'universitario-puntaje',
      'perfil': 'universitario-perfil'
    };
    
    const pageName = pageMap[pageId] || pageId;
    showPage(pageName);
    
    switch(pageId) {
      case 'solicitudes':
        initUniversitarioHome();
        break;
      case 'historial':
      case 'rutas':
        initUniversitarioHistorial();
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

  function getSolicitudesDisponibles() {
    return [...solicitudesPendientesCache, ...solicitudesProgramadasCache];
  }

  function renderTarjetaSolicitudUni(sol, { esProgramadaLista = false } = {}) {
    const tipoAyuda = sol.tipoAyuda || sol.tipo;
    const tipoAyudaDisplay = TIPO_AYUDA_LABELS[tipoAyuda] || tipoAyuda || 'General';
    const nombreAdulto = escapeHtml(sol.adultoMayorNombre || 'Adulto Mayor');
    const zonaAdulto = escapeHtml(sol.adultoMayorZona || 'Zona');
    const fechaProgramada = getFechaProgramada(sol);
    const fechaDisplay = esProgramadaLista || sol.esProgramada
      ? formatFechaHoraProgramada(fechaProgramada || getFechaFromSolicitud(sol))
      : getFechaFromSolicitud(sol).toLocaleDateString();

    return `
      <div class="solicitud-card-uni" data-solicitud-id="${sol.id}">
        <div class="solicitud-header">
          <div class="solicitud-nombre">${nombreAdulto}</div>
          <span class="solicitud-zona">${zonaAdulto}</span>
        </div>
        <div class="solicitud-info">
          <p><strong>Tipo de ayuda:</strong> ${escapeHtml(tipoAyudaDisplay)}</p>
          <p><strong>${esProgramadaLista || sol.esProgramada ? 'Fecha y hora' : 'Fecha'}:</strong> ${escapeHtml(fechaDisplay)}</p>
          ${esProgramadaLista || sol.esProgramada ? '<span class="solicitud-programada-badge">Programada</span>' : ''}
          ${sol.esNocturno ? '<p class="solicitud-nocturna"><svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Solicitud nocturna</p>' : ''}
        </div>
        <div class="solicitud-actions">
          <button class="btn-aceptar" onclick="aceptarAcompanamiento('${sol.id}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Aceptar
          </button>
          <button class="btn-rechazar" onclick="rechazarSolicitud('${sol.id}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Rechazar
          </button>
        </div>
      </div>
    `;
  }

  function renderSolicitudesDisponibles(solicitudes, filtroZona = 'todas') {
    const container = document.getElementById('solicitudes-universitario');
    
    if (!container) return;
    
    let solicitudesFiltradas = solicitudes;
    if (filtroZona !== 'todas') {
      solicitudesFiltradas = solicitudes.filter(s => s.adultoMayorZona === filtroZona);
    }
    
    if (solicitudesFiltradas.length === 0) {
      container.innerHTML = `
        <div class="solicitudes-empty-state">
          <p>No hay solicitudes urgentes en este momento</p>
          <p class="solicitudes-empty-hint">Las nuevas solicitudes aparecerán aquí</p>
        </div>
      `;
    } else {
      container.innerHTML = solicitudesFiltradas
        .map((sol) => renderTarjetaSolicitudUni(sol, { esProgramadaLista: false }))
        .join('');
    }
  }

  function renderSolicitudesProgramadas(solicitudes, filtroZona = 'todas') {
    const container = document.getElementById('solicitudes-programadas-uni');
    if (!container) return;

    let filtradas = [...solicitudes];
    if (filtroZona !== 'todas') {
      filtradas = filtradas.filter((s) => s.adultoMayorZona === filtroZona);
    }

    filtradas.sort((a, b) => {
      const fa = getFechaProgramada(a)?.getTime() || 0;
      const fb = getFechaProgramada(b)?.getTime() || 0;
      return fa - fb;
    });

    if (filtradas.length === 0) {
      container.innerHTML = `
        <div class="solicitudes-empty-state">
          <p>No hay solicitudes programadas</p>
          <p class="solicitudes-empty-hint">Los acompañamientos agendados aparecerán aquí</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtradas
      .map((sol) => renderTarjetaSolicitudUni(sol, { esProgramadaLista: true }))
      .join('');
  }

  function subscribeSolicitudesDisponibles() {
    if (solicitudesDisponiblesUnsubscribe) {
      solicitudesDisponiblesUnsubscribe();
      solicitudesDisponiblesUnsubscribe = null;
    }

    const solicitudesQuery = query(
      collection(window.db, 'solicitudes'),
      where('estado', '==', 'pendiente'),
      orderBy('fechaCreacion', 'desc')
    );

    solicitudesDisponiblesUnsubscribe = onSnapshot(solicitudesQuery, (snapshot) => {
      solicitudesPendientesCache = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      const filtroZona = document.getElementById('filtro-zona')?.value || 'todas';
      renderSolicitudesDisponibles(solicitudesPendientesCache, filtroZona);
    }, (error) => {
      console.error('Error al cargar solicitudes disponibles:', error);
    });
  }

  function subscribeSolicitudesProgramadas() {
    if (solicitudesProgramadasUnsubscribe) {
      solicitudesProgramadasUnsubscribe();
      solicitudesProgramadasUnsubscribe = null;
    }

    const programadasQuery = query(
      collection(window.db, 'solicitudes'),
      where('estado', '==', 'programada'),
      orderBy('fechaProgramada', 'asc')
    );

    solicitudesProgramadasUnsubscribe = onSnapshot(programadasQuery, (snapshot) => {
      solicitudesProgramadasCache = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      const filtroZona = document.getElementById('filtro-zona')?.value || 'todas';
      renderSolicitudesProgramadas(solicitudesProgramadasCache, filtroZona);
    }, (error) => {
      console.error('Error al cargar solicitudes programadas:', error);
      // Fallback sin orderBy si falta el índice compuesto
      if (error?.code === 'failed-precondition') {
        const fallbackQuery = query(
          collection(window.db, 'solicitudes'),
          where('estado', '==', 'programada')
        );
        solicitudesProgramadasUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
          solicitudesProgramadasCache = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          const filtroZona = document.getElementById('filtro-zona')?.value || 'todas';
          renderSolicitudesProgramadas(solicitudesProgramadasCache, filtroZona);
        });
      }
    });
  }

  function loadSolicitudesDisponibles(filtroZona = 'todas') {
    renderSolicitudesDisponibles(solicitudesPendientesCache, filtroZona);
    renderSolicitudesProgramadas(solicitudesProgramadasCache, filtroZona);
  }

  /**
   * Acepta un acompañamiento (urgente o programado).
   * Mantiene esProgramada y fechaProgramada si existen.
   */
  window.aceptarAcompanamiento = async function(solicitudId) {
    const currentUser = window.auth.currentUser;
    if (!currentUser) {
      alert('Debes iniciar sesión para aceptar solicitudes.');
      return;
    }

    const solicitud = getSolicitudesDisponibles().find(s => s.id === solicitudId);
    if (!solicitud) return;

    const universitarioNombre = AppState.userData?.nombre || currentUser.displayName || 'Voluntario';
    const codigoConfirmacion = generarCodigoConfirmacion();

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        estado: 'aceptada',
        universitarioId: currentUser.uid,
        universitarioNombre,
        codigoConfirmacion,
        fechaAceptacion: serverTimestamp()
        // esProgramada y fechaProgramada se conservan en el documento
      });
    } catch (error) {
      console.error('Error al aceptar solicitud:', error);
      alert('No se pudo aceptar la solicitud. Intenta de nuevo.');
      return;
    }

    const colibriWrapperUni = document.getElementById('colibri-guide-wrapper-uni');
    if (colibriWrapperUni && typeof ColibriGuide !== 'undefined') {
      if (!AppState.colibriGuide || AppState.colibriGuide.container !== colibriWrapperUni) {
        AppState.colibriGuide = new ColibriGuide(colibriWrapperUni);
      }
      AppState.colibriGuide.showMessage('accompaniment-accepted');
    }

    alert(
      solicitud.esProgramada
        ? 'Has aceptado este acompañamiento programado.\nTe avisaremos cuando se acerque la hora.'
        : 'Has aceptado este acompañamiento.\nYa puedes comunicarte a través del chat.'
    );
  };

  window.marcarEnCamino = async function(solicitudId) {
    if (!window.auth.currentUser) {
      alert('Debes iniciar sesión.');
      return;
    }

    try {
      const solicitudRef = doc(window.db, 'solicitudes', solicitudId);
      const solicitudSnap = await getDoc(solicitudRef);
      const updates = { estado: 'en_camino' };

      // Si la solicitud se aceptó antes de existir el código, generarlo ahora
      if (solicitudSnap.exists() && !solicitudSnap.data().codigoConfirmacion) {
        updates.codigoConfirmacion = generarCodigoConfirmacion();
      }

      await updateDoc(solicitudRef, updates);
    } catch (error) {
      console.error('Error al marcar en camino:', error);
      alert('No se pudo actualizar el estado. Intenta de nuevo.');
    }
  };

  window.confirmarLlegada = async function(solicitudId) {
    if (!window.auth.currentUser) {
      alert('Debes iniciar sesión.');
      return;
    }

    const input = document.getElementById(`codigo-llegada-${solicitudId}`);
    const errorEl = document.getElementById(`codigo-error-${solicitudId}`);
    const codigoIngresado = (input?.value || '').trim();

    if (errorEl) errorEl.textContent = '';

    if (!codigoIngresado) {
      if (errorEl) errorEl.textContent = 'Ingresa el código de confirmación';
      return;
    }

    try {
      const solicitudSnap = await getDoc(doc(window.db, 'solicitudes', solicitudId));
      if (!solicitudSnap.exists()) {
        alert('No se encontró el acompañamiento.');
        return;
      }

      const data = solicitudSnap.data();
      if (String(data.codigoConfirmacion) !== codigoIngresado) {
        if (errorEl) {
          errorEl.textContent = 'Código incorrecto, verifica con el adulto mayor';
        } else {
          alert('Código incorrecto, verifica con el adulto mayor');
        }
        return;
      }

      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        estado: 'en_curso',
        fechaInicio: serverTimestamp()
      });
    } catch (error) {
      console.error('Error al confirmar llegada:', error);
      alert('No se pudo confirmar la llegada. Intenta de nuevo.');
    }
  };

  window.finalizarAcompanamiento = async function(solicitudId) {
    if (!window.auth.currentUser) {
      alert('Debes iniciar sesión.');
      return;
    }

    if (!confirm('¿Deseas finalizar este acompañamiento?')) return;

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        estado: 'finalizado',
        fechaFin: serverTimestamp()
      });
      stopVoluntarioLocationWatch();
    } catch (error) {
      console.error('Error al finalizar acompañamiento:', error);
      alert('No se pudo finalizar el acompañamiento. Intenta de nuevo.');
    }
  };

  window.rechazarSolicitud = async function(solicitudId) {
    if (!solicitudId) return;
    if (!confirm('¿Estás seguro de que deseas rechazar esta solicitud?')) return;

    try {
      await updateDoc(doc(window.db, 'solicitudes', solicitudId), {
        estado: 'rechazada',
        fechaRechazo: serverTimestamp()
      });
      // La lista se actualiza sola con onSnapshot (filtra pendientes/programadas)
    } catch (error) {
      console.error('Error al rechazar solicitud:', error);
      alert('No se pudo rechazar la solicitud. Intenta de nuevo.');
    }
  };

  function getFechaAceptacion(solicitud) {
    if (solicitud.fechaAceptacion?.toDate) return solicitud.fechaAceptacion.toDate();
    if (solicitud.fechaAceptacion) return new Date(solicitud.fechaAceptacion);
    return getFechaFromSolicitud(solicitud);
  }

  function getAccionesAcompanamientoUni(sol) {
    const chatBtn = `
      <button type="button" class="btn-primary btn-ir-al-chat" onclick="window.navigateToPageUni('chat')">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        Ir al chat
        <span class="chat-unread-badge" hidden>0</span>
      </button>
    `;

    if (sol.estado === 'aceptada') {
      return `
        <div class="acompanamiento-actions">
          <button class="btn-primary" onclick="window.marcarEnCamino('${sol.id}')">Voy en camino</button>
          ${chatBtn}
        </div>
      `;
    }

    if (sol.estado === 'en_camino') {
      return `
        <div class="live-map-section">
          <p class="live-map-title">Ubicaciones en vivo</p>
          <p class="live-map-legend">
            <span class="live-map-legend-item live-map-legend-item--voluntario">Tú</span>
            <span class="live-map-legend-item live-map-legend-item--adulto">Adulto mayor</span>
          </p>
          <div id="live-map-uni-${sol.id}" class="live-map-container live-map-container--mini"></div>
          <p id="live-map-msg-uni-${sol.id}" class="live-map-status"></p>
          <p id="geo-error-${sol.id}" class="live-map-geo-error" role="alert"></p>
        </div>
        <div class="codigo-llegada-block">
          <label class="codigo-llegada-label" for="codigo-llegada-${sol.id}">Código de confirmación</label>
          <div class="codigo-llegada-row">
            <input
              type="text"
              id="codigo-llegada-${sol.id}"
              class="codigo-llegada-input"
              maxlength="4"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0000"
              autocomplete="one-time-code"
            />
            <button class="btn-primary" onclick="window.confirmarLlegada('${sol.id}')">Confirmar llegada</button>
          </div>
          <p id="codigo-error-${sol.id}" class="codigo-llegada-error" role="alert"></p>
        </div>
        <div class="acompanamiento-actions">
          ${chatBtn}
        </div>
      `;
    }

    if (sol.estado === 'en_curso') {
      return `
        <div class="live-map-section">
          <p class="live-map-title">Ubicaciones en vivo</p>
          <p class="live-map-legend">
            <span class="live-map-legend-item live-map-legend-item--voluntario">Tú</span>
            <span class="live-map-legend-item live-map-legend-item--adulto">Adulto mayor</span>
          </p>
          <div id="live-map-uni-${sol.id}" class="live-map-container live-map-container--mini"></div>
          <p id="live-map-msg-uni-${sol.id}" class="live-map-status"></p>
          <p id="geo-error-${sol.id}" class="live-map-geo-error" role="alert"></p>
        </div>
        <div class="acompanamiento-actions">
          <button class="btn-secondary" onclick="window.finalizarAcompanamiento('${sol.id}')">Finalizar acompañamiento</button>
          ${chatBtn}
        </div>
      `;
    }

    return `
      <div class="acompanamiento-actions">
        ${chatBtn}
      </div>
    `;
  }

  function getDireccionAdultoMayorDisplay(sol) {
    const direccion = (sol?.adultoMayorDireccion || '').trim();
    if (direccion) {
      return { texto: escapeHtml(direccion), sinRegistro: false };
    }
    return {
      texto: 'Dirección no registrada — contacta al adulto mayor por el chat',
      sinRegistro: true
    };
  }

  function renderDireccionAcompanamientoUni(sol) {
    const { texto, sinRegistro } = getDireccionAdultoMayorDisplay(sol);
    return `
      <p class="acompanamiento-direccion${sinRegistro ? ' acompanamiento-direccion--faltante' : ''}">
        <svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>${texto}</span>
      </p>
    `;
  }

  function renderAcompanamientosActivos(solicitudes) {
    const container = document.getElementById('acompanamientos-activos');
    const list = document.getElementById('acompanamientos-list');

    if (!container || !list) return;

    const activos = solicitudes
      .filter(s => ESTADOS_ACOMPANAMIENTO_ACTIVOS.includes(s.estado))
      .sort((a, b) => getAgendaSortDate(a) - getAgendaSortDate(b));

    if (activos.length > 0) {
      container.classList.remove('hidden');

      const valoresCodigo = {};
      list.querySelectorAll('.codigo-llegada-input').forEach((input) => {
        valoresCodigo[input.id] = input.value;
      });

      const grupos = groupByAgendaDate(activos);
      list.innerHTML = grupos.map((grupo) => `
        <div class="agenda-group">
          <h3 class="agenda-group-title">${grupo.label}</h3>
          ${grupo.items.map((sol) => {
            const fechaProgramada = getFechaProgramada(sol);
            const infoFecha = sol.esProgramada && fechaProgramada
              ? `Programado: ${formatFechaHoraProgramada(fechaProgramada)}`
              : `Desde: ${getFechaAceptacion(sol).toLocaleDateString()}`;
            return `
              <div class="acompanamiento-card">
                <div class="acompanamiento-header">
                  <div class="acompanamiento-nombre">${escapeHtml(sol.adultoMayorNombre || 'Adulto Mayor')}</div>
                  <span class="acompanamiento-estado">${ESTADO_LABELS[sol.estado] || sol.estado}</span>
                </div>
                ${renderDireccionAcompanamientoUni(sol)}
                <div class="acompanamiento-info">
                  <p>${escapeHtml(infoFecha)}</p>
                  ${sol.esProgramada ? '<span class="solicitud-programada-badge">Programada</span>' : ''}
                </div>
                ${getAccionesAcompanamientoUni(sol)}
              </div>
            `;
          }).join('')}
        </div>
      `).join('');

      Object.entries(valoresCodigo).forEach(([id, valor]) => {
        const input = document.getElementById(id);
        if (input) input.value = valor;
      });
      aplicarBadgeChatUnread();
    } else {
      container.classList.remove('hidden');
      list.innerHTML = `
        <div class="acompanamiento-empty">
          <p>No tienes acompañamientos activos</p>
        </div>
      `;
    }
  }

  function subscribeAcompanamientosActivos() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    if (acompanamientosActivosUnsubscribe) {
      acompanamientosActivosUnsubscribe();
      acompanamientosActivosUnsubscribe = null;
    }

    const acompanamientosQuery = query(
      collection(window.db, 'solicitudes'),
      where('universitarioId', '==', uid)
    );

    acompanamientosActivosUnsubscribe = onSnapshot(acompanamientosQuery, (snapshot) => {
      const solicitudes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      const activos = solicitudes.filter((s) =>
        ESTADOS_ACOMPANAMIENTO_ACTIVOS.includes(s.estado)
      );
      const structureKey = getSolicitudesStructureKey(activos);

      if (structureKey !== lastUniAcompanamientosStructureKey) {
        lastUniAcompanamientosStructureKey = structureKey;
        clearLiveMaps('uni');
        renderAcompanamientosActivos(solicitudes);
      }

      updateRecordatorioCache(activos);
      syncVoluntarioLocationTracking(solicitudes);
      syncLiveMapsForRole(activos, 'uni');
    }, (error) => {
      console.error('Error al cargar acompañamientos activos:', error);
    });
  }

  function loadAcompanamientosActivos() {
    subscribeAcompanamientosActivos();
  }

  function getTimestampAsDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getDuracionMsAcompanamiento(solicitud) {
    const inicio = getTimestampAsDate(solicitud.fechaInicio);
    const fin = getTimestampAsDate(solicitud.fechaFin);
    if (!inicio || !fin || fin <= inicio) return 0;
    return fin.getTime() - inicio.getTime();
  }

  function formatDuracionAcompanamiento(ms) {
    if (!ms || ms <= 0) return '—';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${Math.max(totalMin, 1)} min`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
  }

  function formatHorasTotalesAcumuladas(ms) {
    if (!ms || ms <= 0) return '0 h';
    return formatDuracionAcompanamiento(ms);
  }

  function renderHistorialAcompanamientos(solicitudes) {
    const horasValorEl = document.getElementById('historial-horas-valor');
    const list = document.getElementById('historial-acompanamientos-list');
    if (!list) return;

    const ordenadas = [...solicitudes].sort((a, b) => {
      const finA = getTimestampAsDate(a.fechaFin)?.getTime() || 0;
      const finB = getTimestampAsDate(b.fechaFin)?.getTime() || 0;
      return finB - finA;
    });

    const totalMs = ordenadas.reduce((acc, sol) => acc + getDuracionMsAcompanamiento(sol), 0);
    if (horasValorEl) {
      horasValorEl.textContent = formatHorasTotalesAcumuladas(totalMs);
    }

    if (ordenadas.length === 0) {
      list.innerHTML = `
        <div class="historial-empty">
          <p>Aún no completas acompañamientos. ¡Aquí verás tu historial y tus horas acumuladas!</p>
        </div>
      `;
      return;
    }

    list.innerHTML = ordenadas.map((sol) => {
      const tipo = sol.tipoAyuda || sol.tipo;
      const tipoLabel = sol.tipoLabel || TIPO_AYUDA_LABELS[tipo] || tipo || 'General';
      const fechaFin = getTimestampAsDate(sol.fechaFin) || getTimestampAsDate(sol.fechaInicio);
      const fechaLabel = fechaFin
        ? fechaFin.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—';
      const duracionLabel = formatDuracionAcompanamiento(getDuracionMsAcompanamiento(sol));

      return `
        <div class="acompanamiento-card historial-card">
          <div class="acompanamiento-header">
            <div class="acompanamiento-nombre">${sol.adultoMayorNombre || 'Adulto Mayor'}</div>
            <span class="acompanamiento-estado">Finalizado</span>
          </div>
          <div class="acompanamiento-info historial-card-info">
            <p><strong>Tipo de ayuda:</strong> ${tipoLabel}</p>
            <p><strong>Fecha:</strong> ${fechaLabel}</p>
            <p><strong>Duración:</strong> ${duracionLabel}</p>
          </div>
          <div class="acompanamiento-actions">
            <button class="btn-secondary" onclick="window.verAlbumDesdeHistorial('${sol.id}')">
              Ver álbum
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function subscribeHistorialAcompanamientos() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    if (historialAcompanamientosUnsubscribe) {
      historialAcompanamientosUnsubscribe();
      historialAcompanamientosUnsubscribe = null;
    }

    const historialQuery = query(
      collection(window.db, 'solicitudes'),
      where('universitarioId', '==', uid),
      where('estado', '==', 'finalizado'),
      orderBy('fechaFin', 'desc')
    );

    historialAcompanamientosUnsubscribe = onSnapshot(historialQuery, (snapshot) => {
      const solicitudes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderHistorialAcompanamientos(solicitudes);
    }, (error) => {
      console.error('Error al cargar historial de acompañamientos:', error);
      // Fallback sin orderBy si falta el índice compuesto
      const fallbackQuery = query(
        collection(window.db, 'solicitudes'),
        where('universitarioId', '==', uid),
        where('estado', '==', 'finalizado')
      );
      historialAcompanamientosUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
        const solicitudes = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        renderHistorialAcompanamientos(solicitudes);
      }, (fallbackError) => {
        console.error('Error en fallback de historial:', fallbackError);
      });
    });
  }

  function initUniversitarioHistorial() {
    initBottomNavigationUni('bottom-nav-container-historial', 'historial');
    subscribeHistorialAcompanamientos();
  }

  window.verAlbumDesdeHistorial = function(solicitudId) {
    AppState.albumForcedSolicitudId = solicitudId;
    window.navigateToPageUni('album');
  };

  async function initUniversitarioAlbum() {
    initBottomNavigationUni('bottom-nav-container-album-uni', 'album');
    const forcedSolicitudId = AppState.albumForcedSolicitudId || null;
    AppState.albumForcedSolicitudId = null;
    await setupAlbumPage({
      gridId: 'album-grid-uni',
      addBtnId: 'add-photo-btn-uni',
      inputId: 'photo-input-uni',
      forcedSolicitudId,
      isAdulto: false
    });
  }

  function renderEstrellasTexto(calificacion) {
    const n = Number(calificacion);
    if (!n || n < 1) return 'Sin calificar aún';
    const llenas = '★'.repeat(Math.min(5, Math.round(n)));
    const vacias = '☆'.repeat(Math.max(0, 5 - Math.round(n)));
    return `${llenas}${vacias} (${n}/5)`;
  }

  function renderPuntajeUniversitario(stats) {
    const puntajeTotalEl = document.getElementById('puntaje-total');
    const acompanamientosEl = document.getElementById('stat-acompanamientos');
    const calificacionEl = document.getElementById('stat-calificacion');
    const semanasEl = document.getElementById('stat-semanas');
    const historialEl = document.getElementById('puntaje-historial-list');

    if (puntajeTotalEl) puntajeTotalEl.textContent = String(stats.puntosTotales || 0);
    if (acompanamientosEl) acompanamientosEl.textContent = String(stats.acompanamientos || 0);
    if (calificacionEl) calificacionEl.textContent = (stats.calificacionPromedio || 0).toFixed(1);
    if (semanasEl) semanasEl.textContent = String(stats.semanasActivas || 0);

    if (AppState.userData) {
      AppState.userData = {
        ...AppState.userData,
        puntaje: stats.puntosTotales,
        acompanamientos: stats.acompanamientos,
        calificacionPromedio: stats.calificacionPromedio,
        semanasActivas: stats.semanasActivas
      };
      syncUserDataToLocalStorage(AppState.userData);
    }

    mostrarIndicadorCalificacion(stats);

    if (!historialEl) return;

    const ordenadas = [...(stats.finalizadas || [])].sort((a, b) => {
      const finA = getTimestampAsDate(a.fechaFin)?.getTime() || 0;
      const finB = getTimestampAsDate(b.fechaFin)?.getTime() || 0;
      return finB - finA;
    });

    if (ordenadas.length === 0) {
      historialEl.innerHTML = `
        <div class="historial-empty">
          <p>Aún no tienes acompañamientos registrados.</p>
          <p class="historial-empty-hint">Cuando completes uno, aparecerá aquí.</p>
        </div>
      `;
      return;
    }

    historialEl.innerHTML = ordenadas.map((sol) => {
      const nombre = sol.adultoMayorNombre || 'Adulto Mayor';
      const tipo = sol.tipoAyuda || sol.tipo;
      const tipoLabel = TIPO_AYUDA_LABELS[tipo] || tipo || 'General';
      const fecha = getTimestampAsDate(sol.fechaFin) || getTimestampAsDate(sol.fechaInicio);
      const fechaLabel = fecha ? fecha.toLocaleDateString('es-ES') : '—';
      const puntosItem = 10 + (Number(sol.calificacion) === 5 ? 5 : 0);
      const calificacionLabel = renderEstrellasTexto(sol.calificacion);

      return `
        <div class="historial-item historial-item-puntos">
          <div class="historial-item-header">
            <div class="historial-item-titulo">${nombre} · ${tipoLabel}</div>
            <div class="historial-item-puntos">+${puntosItem} pts</div>
          </div>
          <div class="historial-item-fecha">${fechaLabel} · ${calificacionLabel}</div>
        </div>
      `;
    }).join('');
  }

  function subscribePuntajeUniversitario() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;

    if (puntajeSolicitudesUnsubscribe) {
      puntajeSolicitudesUnsubscribe();
      puntajeSolicitudesUnsubscribe = null;
    }

    if (AppState.puntajeInterval) {
      clearInterval(AppState.puntajeInterval);
      AppState.puntajeInterval = null;
    }

    const puntajeQuery = query(
      collection(window.db, 'solicitudes'),
      where('universitarioId', '==', uid),
      where('estado', '==', 'finalizado')
    );

    puntajeSolicitudesUnsubscribe = onSnapshot(puntajeQuery, (snapshot) => {
      const solicitudes = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      const stats = calcularPuntajeUniversitario(solicitudes);
      renderPuntajeUniversitario(stats);
    }, (error) => {
      console.error('Error al cargar puntaje del universitario:', error);
    });
  }

  function initUniversitarioPuntaje() {
    initBottomNavigationUni('bottom-nav-container-puntaje', 'puntaje');
    subscribePuntajeUniversitario();
  }

  function calcularSemanasActivas(nombreUniversitario) {
    if (
      AppState.userData?.nombre === nombreUniversitario &&
      AppState.userData?.semanasActivas != null
    ) {
      return AppState.userData.semanasActivas;
    }
    const data = JSON.parse(localStorage.getItem('universitarioData') || '{}');
    if (data.nombre === nombreUniversitario && data.semanasActivas != null) {
      return data.semanasActivas;
    }
    return 0;
  }

  function calcularHorasAcumuladas(nombreUniversitario) {
    if (
      AppState.userData?.nombre === nombreUniversitario &&
      AppState.userData?.acompanamientos != null
    ) {
      return AppState.userData.acompanamientos;
    }
    const data = JSON.parse(localStorage.getItem('universitarioData') || '{}');
    if (data.nombre === nombreUniversitario) {
      return data.acompanamientos || 0;
    }
    return 0;
  }

  function mostrarIndicadorCalificacion(stats) {
    const semanasActivas = stats?.semanasActivas ?? AppState.userData?.semanasActivas ?? 0;
    const calificacionPromedio = stats?.calificacionPromedio ?? AppState.userData?.calificacionPromedio ?? 0;

    if (semanasActivas > 0 && calificacionPromedio > 0 && calificacionPromedio < 3.5) {
      const puntajeContainer = document.querySelector('.puntaje-container');
      if (puntajeContainer) {
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
      const indicador = document.querySelector('.calificacion-indicador');
      if (indicador) indicador.remove();
    }
  }

  function initUniversitarioPerfil() {
    initBottomNavigationUni('bottom-nav-container-perfil-uni', 'perfil');
    
    loadPerfilUniversitario();
    
    document.getElementById('editar-perfil-uni-btn')?.addEventListener('click', editarPerfilUniversitario);
    document.getElementById('cerrar-sesion-uni-btn')?.addEventListener('click', cerrarSesion);
  }

  function loadPerfilUniversitario() {
    if (!AppState.userData) return;
    
    document.getElementById('perfil-uni-nombre').textContent = AppState.userData.nombre;
    document.getElementById('perfil-uni-universidad').textContent = AppState.userData.universidad;
    document.getElementById('perfil-uni-carrera').textContent = AppState.userData.carrera;
    document.getElementById('perfil-uni-zona').textContent = AppState.userData.zona;
    document.getElementById('perfil-uni-telefono').textContent = AppState.userData.telefono;
    const perfilUniEmergencia = document.getElementById('perfil-uni-telefono-emergencia');
    if (perfilUniEmergencia) {
      perfilUniEmergencia.textContent = AppState.userData.telefonoEmergencia || '—';
    }
    setupEmergenciaCallButton('llamar-emergencia-uni-btn', 'emergencia-vacio-uni');
    
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
    
    const acompanamientos = JSON.parse(localStorage.getItem('universitarioAcompanamientos') || '[]');
    const activos = acompanamientos.filter(a => a.estado === 'activo');
    const container = document.getElementById('perfil-acompanamientos-activos');
    const acompanamientosSection = container?.closest('.perfil-section');
    
    if (container) {
      if (activos.length === 0) {
        if (acompanamientosSection) {
          acompanamientosSection.classList.add('hidden');
        }
        container.innerHTML = '<p style="opacity: 0.7;">No tienes acompañamientos activos</p>';
      } else {
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

  function editarPerfilUniversitario() {
    showPage('universitario-registro');
    initUniversitarioRegistro();
    document.getElementById('uni-docs-cedula-group')?.classList.add('hidden');
    document.getElementById('uni-docs-rostro-group')?.classList.add('hidden');
    document.getElementById('uni-docs-carnet-group')?.classList.add('hidden');

    if (AppState.userData) {
      document.getElementById('uni-nombre').value = AppState.userData.nombre;
      document.getElementById('universidad').value = AppState.userData.universidad;
      document.getElementById('carrera').value = AppState.userData.carrera;
      document.getElementById('uni-telefono').value = AppState.userData.telefono;
      const uniTelEmergencia = document.getElementById('uni-telefono-emergencia');
      if (uniTelEmergencia) {
        uniTelEmergencia.value = AppState.userData.telefonoEmergencia || '';
      }
      document.getElementById('uni-zona').value = AppState.userData.zona;
      document.getElementById('uni-email').value = AppState.userData.email || window.auth.currentUser?.email || '';
      
      document.querySelectorAll('input[name="habilidades"]').forEach(checkbox => {
        checkbox.checked = false;
      });
      AppState.userData.habilidades?.forEach(hab => {
        const checkbox = document.querySelector(`input[name="habilidades"][value="${hab}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
  }

  async function initUniversitarioChat() {
    initBottomNavigationUni('bottom-nav-container-chat-uni', 'chat');
    stopChatListener();
    chatSubscribeGeneration += 1;
    const initGeneration = chatSubscribeGeneration;

    const messagesEl = document.getElementById('chat-messages-uni');
    const inputContainer = document.getElementById('chat-input-container-uni');
    showChatLoadingState('chat-messages-uni');
    inputContainer?.classList.add('hidden');

    const desvinculacion = JSON.parse(localStorage.getItem('acompanamientoDesvinculado') || 'null');
    if (desvinculacion && desvinculacion.voluntario === AppState.userData?.nombre) {
      if (messagesEl) {
        messagesEl.innerHTML = `
          <div class="chat-empty-state">
            <p>El acompañamiento ha sido finalizado</p>
            <p class="chat-empty-hint">Ya no puedes chatear con este adulto mayor</p>
          </div>
        `;
      }
      inputContainer?.classList.add('hidden');
      AppState.chatId = null;
      return;
    }

    let solicitud = null;
    try {
      solicitud = await obtenerSolicitudAceptadaParaChat();
    } catch (error) {
      console.error('Error al cargar acompañamiento para chat:', error);
    }

    if (initGeneration !== chatSubscribeGeneration) return;

    if (!solicitud) {
      if (messagesEl) {
        messagesEl.innerHTML = `
          <div class="chat-empty-state">
            <p>No tienes conversaciones activas</p>
            <p class="chat-empty-hint">Cuando aceptes un acompañamiento, podrás chatear aquí</p>
          </div>
        `;
      }
      inputContainer?.classList.add('hidden');
      AppState.chatId = null;
      return;
    }

    const infoContainer = document.getElementById('chat-adulto-info');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <p><strong>Estás chateando con:</strong> ${solicitud.adultoMayorNombre || 'Adulto Mayor'}</p>
      `;
    }

    AppState.chatId = solicitud.id;
    inputContainer?.classList.remove('hidden');
    bindChatSendListeners('chat-send-btn-uni', 'chat-input-uni', sendChatMessageUni);
    subscribeChatMessages(solicitud.id, 'chat-messages-uni', 'universitario');
  }

  function sendChatMessageUni() {
    enviarMensajeChat('chat-input-uni');
  }

  /**
   * ============================================
   * FLUJO DOCENTE
   * ============================================
   */

  function initDocenteRegistro() {
    const registroForm = document.getElementById('registro-docente-form');
    if (!registroForm || registroForm.dataset.initialized === 'true') return;
    registroForm.dataset.initialized = 'true';

    registroForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const nombre = document.getElementById('doc-nombre').value.trim();
      const correo = document.getElementById('doc-correo').value.trim();
      const universidad = document.getElementById('doc-universidad').value;
      const password = document.getElementById('doc-password').value;
      const cedulaFile = getDocPhotoFile('doc-cedula-docente');
      const credencialFile = getDocPhotoFile('doc-credencial-docente');

      if (!validateDocenteRegistroForm(nombre, correo, universidad, password, cedulaFile, credencialFile)) {
        return;
      }

      const userData = {
        nombre,
        correo,
        universidad,
        fechaRegistro: new Date().toISOString()
      };

      registrationInProgress = true;
      try {
        const credential = await createUserWithEmailAndPassword(window.auth, correo, password);
        const uid = credential.user.uid;
        await sendEmailVerification(credential.user);
        const documentos = await uploadDocumentosRegistro(uid, {
          cedula: cedulaFile,
          credencialDocente: credencialFile
        });
        await setDoc(doc(window.db, 'usuarios', uid), {
          ...userData,
          rol: 'docente',
          email: correo,
          documentos,
          estadoAprobacion: 'pendiente'
        });
      } catch (error) {
        console.error('Error en registro docente:', error);
        document.getElementById('error-doc-correo').textContent =
          error.code ? getAuthErrorMessage(error) : 'No se pudo completar el registro. Intenta de nuevo.';
        return;
      } finally {
        registrationInProgress = false;
      }

      await handlePostRegistrationVerification(correo, password);
    });
  }

  function validateDocenteRegistroForm(nombre, correo, universidad, password, cedulaFile = null, credencialFile = null) {
    let isValid = true;
    
    document.querySelectorAll('[id^="error-doc"]').forEach(el => el.textContent = '');
    
    if (!nombre || nombre.length < 2) {
      document.getElementById('error-doc-nombre').textContent = 'El nombre debe tener al menos 2 caracteres';
      isValid = false;
    }
    
    // NOTA: Validación institucional se activará en producción
    // Por ahora, aceptamos cualquier correo con formato válido (modo prueba)
    const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correo || !correoRegex.test(correo)) {
      document.getElementById('error-doc-correo').textContent = 'Ingresa un correo válido';
      isValid = false;
    }
    
    if (!universidad) {
      document.getElementById('error-doc-universidad').textContent = 'Selecciona una universidad';
      isValid = false;
    }
    
    if (!password || password.length < 6) {
      document.getElementById('error-doc-password').textContent = 'La contraseña debe tener al menos 6 caracteres';
      isValid = false;
    }

    if (!cedulaFile || !cedulaFile.type.startsWith('image/')) {
      document.getElementById('error-doc-cedula-docente').textContent = 'Sube una foto de tu cédula';
      isValid = false;
    }

    if (!credencialFile || !credencialFile.type.startsWith('image/')) {
      document.getElementById('error-doc-credencial-docente').textContent = 'Sube una foto de tu credencial docente';
      isValid = false;
    }
    
    return isValid;
  }

  /**
   * ============================================
   * PANEL ADMINISTRADOR
   * ============================================
   */

  function initAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (!panel) {
      console.error('Panel admin no encontrado');
      return;
    }

    const cerrarBtn = document.getElementById('admin-cerrar-sesion-btn');
    if (cerrarBtn && cerrarBtn.dataset.bound !== 'true') {
      cerrarBtn.dataset.bound = 'true';
      cerrarBtn.addEventListener('click', cerrarSesion);
    }

    initAdminTabs();
    initAdminLightbox();
    initAdminCardActions();
    startAdminPendientesListener();
    startAdminAprobadosListener();
  }

  function initAdminTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    if (!tabs.length || tabs[0].dataset.bound === 'true') return;

    tabs.forEach((tab) => {
      tab.dataset.bound = 'true';
      tab.addEventListener('click', function() {
        const target = this.dataset.tab;
        tabs.forEach((t) => {
          const isActive = t.dataset.tab === target;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        document.getElementById('admin-tab-pendientes')?.classList.toggle('hidden', target !== 'pendientes');
        document.getElementById('admin-tab-aprobados')?.classList.toggle('hidden', target !== 'aprobados');
      });
    });
  }

  function initAdminLightbox() {
    const lightbox = document.getElementById('admin-doc-lightbox');
    const closeBtn = document.getElementById('admin-lightbox-close');
    if (!lightbox || lightbox.dataset.bound === 'true') return;
    lightbox.dataset.bound = 'true';

    const closeLightbox = () => {
      lightbox.classList.add('hidden');
      const img = document.getElementById('admin-lightbox-img');
      if (img) img.src = '';
    };

    closeBtn?.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
        closeLightbox();
      }
    });
  }

  function openAdminLightbox(url, altText) {
    const lightbox = document.getElementById('admin-doc-lightbox');
    const img = document.getElementById('admin-lightbox-img');
    if (!lightbox || !img || !url) return;
    img.src = url;
    img.alt = altText || 'Documento';
    lightbox.classList.remove('hidden');
  }

  function initAdminCardActions() {
    const pendientesList = document.getElementById('admin-pendientes-list');
    if (!pendientesList || pendientesList.dataset.actionsBound === 'true') return;
    pendientesList.dataset.actionsBound = 'true';

    pendientesList.addEventListener('click', async function(e) {
      const thumb = e.target.closest('.admin-doc-thumb');
      if (thumb) {
        openAdminLightbox(thumb.dataset.url || thumb.src, thumb.alt);
        return;
      }

      const actionBtn = e.target.closest('[data-admin-action]');
      if (!actionBtn) return;

      const uid = actionBtn.dataset.uid;
      const action = actionBtn.dataset.adminAction;
      if (!uid || (action !== 'aprobar' && action !== 'rechazar')) return;

      const nuevoEstado = action === 'aprobar' ? 'aprobado' : 'rechazado';
      const confirmMsg = action === 'aprobar'
        ? '¿Aprobar este usuario?'
        : '¿Rechazar este usuario?';

      if (!confirm(confirmMsg)) return;

      actionBtn.disabled = true;
      const sibling = actionBtn.parentElement?.querySelectorAll('[data-admin-action]');
      sibling?.forEach((btn) => { btn.disabled = true; });

      try {
        await updateDoc(doc(window.db, 'usuarios', uid), {
          estadoAprobacion: nuevoEstado
        });
      } catch (error) {
        console.error('Error al actualizar estado de aprobación:', error);
        alert('No se pudo actualizar el usuario. Revisa los permisos de Firestore e intenta de nuevo.');
        sibling?.forEach((btn) => { btn.disabled = false; });
      }
    });

    const aprobadosList = document.getElementById('admin-aprobados-list');
    if (aprobadosList && aprobadosList.dataset.actionsBound !== 'true') {
      aprobadosList.dataset.actionsBound = 'true';
      aprobadosList.addEventListener('click', async function(e) {
        const thumb = e.target.closest('.admin-doc-thumb');
        if (thumb) {
          openAdminLightbox(thumb.dataset.url || thumb.src, thumb.alt);
          return;
        }

        const deleteBtn = e.target.closest('[data-admin-action="eliminar"]');
        if (!deleteBtn) return;

        const uid = deleteBtn.dataset.uid;
        if (!uid) return;

        const confirmado = confirm(
          '¿Eliminar este usuario? Esta acción no se puede deshacer.\n\n' +
          'Esto elimina su perfil de la app, pero su acceso (correo/contraseña) deberá eliminarse por separado desde la consola de Firebase Authentication.'
        );
        if (!confirmado) return;

        deleteBtn.disabled = true;
        try {
          await deleteDoc(doc(window.db, 'usuarios', uid));
        } catch (error) {
          console.error('Error al eliminar usuario:', error);
          alert('No se pudo eliminar el usuario. Revisa los permisos de Firestore e intenta de nuevo.');
          deleteBtn.disabled = false;
        }
      });
    }
  }

  function startAdminPendientesListener() {
    const listEl = document.getElementById('admin-pendientes-list');
    if (!listEl) return;

    if (adminPendientesUnsubscribe) {
      adminPendientesUnsubscribe();
      adminPendientesUnsubscribe = null;
    }

    const q = query(
      collection(window.db, 'usuarios'),
      where('estadoAprobacion', '==', 'pendiente')
    );

    adminPendientesUnsubscribe = onSnapshot(q, (snapshot) => {
      const usuarios = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminPendientes(usuarios);
    }, (error) => {
      console.error('Error al escuchar usuarios pendientes:', error);
      listEl.innerHTML = `
        <div class="admin-empty">
          <p>No se pudieron cargar los pendientes. Verifica las reglas de Firestore.</p>
        </div>
      `;
    });
  }

  function startAdminAprobadosListener() {
    const listEl = document.getElementById('admin-aprobados-list');
    if (!listEl) return;

    if (adminAprobadosUnsubscribe) {
      adminAprobadosUnsubscribe();
      adminAprobadosUnsubscribe = null;
    }

    const q = query(
      collection(window.db, 'usuarios'),
      where('estadoAprobacion', '==', 'aprobado')
    );

    adminAprobadosUnsubscribe = onSnapshot(q, (snapshot) => {
      const usuarios = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.rol !== 'admin');
      renderAdminAprobados(usuarios);
    }, (error) => {
      console.error('Error al escuchar usuarios aprobados:', error);
      listEl.innerHTML = `
        <div class="admin-empty">
          <p>No se pudieron cargar los aprobados. Verifica las reglas de Firestore.</p>
        </div>
      `;
    });
  }

  function renderAdminDocumentos(documentos) {
    if (!documentos || typeof documentos !== 'object') {
      return '<p class="admin-user-meta">Sin documentos adjuntos</p>';
    }

    const entries = Object.entries(documentos).filter(([, url]) => typeof url === 'string' && url);
    if (!entries.length) {
      return '<p class="admin-user-meta">Sin documentos adjuntos</p>';
    }

    const items = entries.map(([key, url]) => {
      const label = DOC_LABELS[key] || key;
      const safeUrl = escapeHtml(url);
      const safeLabel = escapeHtml(label);
      return `
        <div class="admin-doc-item">
          <img
            class="admin-doc-thumb"
            src="${safeUrl}"
            data-url="${safeUrl}"
            alt="${safeLabel}"
            loading="lazy"
          />
          <span class="admin-doc-label">${safeLabel}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="admin-docs">
        <div class="admin-docs-title">Documentos</div>
        <div class="admin-docs-grid">${items}</div>
      </div>
    `;
  }

  function renderAdminPendientes(usuarios) {
    const listEl = document.getElementById('admin-pendientes-list');
    if (!listEl) return;

    if (!usuarios.length) {
      listEl.innerHTML = `
        <div class="admin-empty">
          <p>No hay usuarios pendientes de aprobación</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = usuarios.map((user) => {
      const nombre = escapeHtml(user.nombre || 'Sin nombre');
      const rol = escapeHtml(ROL_LABELS[user.rol] || user.rol || '—');
      const correo = escapeHtml(user.correo || user.email || '—');
      const uid = escapeHtml(user.id);

      return `
        <article class="admin-user-card" data-uid="${uid}">
          <h3 class="admin-user-name">${nombre}</h3>
          <p class="admin-user-meta"><strong>Rol:</strong> ${rol}</p>
          <p class="admin-user-meta"><strong>Correo:</strong> ${correo}</p>
          ${renderAdminDocumentos(user.documentos)}
          <div class="admin-card-actions">
            <button type="button" class="btn-primary" data-admin-action="aprobar" data-uid="${uid}">
              Aprobar
            </button>
            <button type="button" class="btn-danger" data-admin-action="rechazar" data-uid="${uid}">
              Rechazar
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderAdminAprobados(usuarios) {
    const listEl = document.getElementById('admin-aprobados-list');
    if (!listEl) return;

    if (!usuarios.length) {
      listEl.innerHTML = `
        <div class="admin-empty">
          <p>No hay usuarios aprobados aún</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = usuarios.map((user) => {
      const nombre = escapeHtml(user.nombre || 'Sin nombre');
      const rol = escapeHtml(ROL_LABELS[user.rol] || user.rol || '—');
      const correo = escapeHtml(user.correo || user.email || '—');

      return `
        <article class="admin-user-card admin-user-card-readonly" data-uid="${escapeHtml(user.id)}">
          <div class="admin-user-card-header">
            <h3 class="admin-user-name">${nombre}</h3>
            <button
              type="button"
              class="admin-eliminar-btn"
              data-admin-action="eliminar"
              data-uid="${escapeHtml(user.id)}"
              aria-label="Eliminar usuario"
            >
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              <span>Eliminar</span>
            </button>
          </div>
          <p class="admin-user-meta"><strong>Rol:</strong> ${rol}</p>
          <p class="admin-user-meta"><strong>Correo:</strong> ${correo}</p>
        </article>
      `;
    }).join('');
  }

  function initDocenteFlow() {
    if (window.auth.currentUser?.emailVerified && AppState.userData?.rol === 'docente') {
      if (!isUsuarioAprobado(AppState.userData)) {
        showCuentaEnRevisionPage();
        return;
      }
      showPage('docente-panel');
      initDocentePanel();
    } else {
      showPage('docente-registro');
      initDocenteRegistro();
    }
  }

  function initDocentePanel() {
    const panel = document.getElementById('docente-panel');
    if (!panel) {
      console.error('Panel docente no encontrado');
      return;
    }

    panel.classList.remove('hidden');

    const cerrarBtn = document.getElementById('docente-cerrar-sesion-btn');
    if (cerrarBtn && cerrarBtn.dataset.bound !== 'true') {
      cerrarBtn.dataset.bound = 'true';
      cerrarBtn.addEventListener('click', cerrarSesion);
    }

    const filtroEstudiantes = document.getElementById('filtro-estudiantes');
    if (filtroEstudiantes && filtroEstudiantes.dataset.bound !== 'true') {
      filtroEstudiantes.dataset.bound = 'true';
      filtroEstudiantes.addEventListener('input', function () {
        filtrarEstudiantes(this.value);
      });
    }

    const cerrarDetalleBtn = document.getElementById('cerrar-detalle-btn');
    if (cerrarDetalleBtn && cerrarDetalleBtn.dataset.bound !== 'true') {
      cerrarDetalleBtn.dataset.bound = 'true';
      cerrarDetalleBtn.addEventListener('click', function () {
        docenteDetalleEstudianteId = null;
        document.getElementById('estudiante-detalle-section')?.classList.add('hidden');
      });
    }

    startDocenteListeners();
  }

  function startDocenteListeners() {
    stopDocenteListeners();

    const universitariosQuery = query(
      collection(window.db, 'usuarios'),
      where('rol', '==', 'universitario'),
      where('estadoAprobacion', '==', 'aprobado')
    );

    docenteEstudiantesUnsubscribe = onSnapshot(
      universitariosQuery,
      (snapshot) => {
        docenteEstudiantesCache = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        refreshDocentePanelUI();
      },
      (error) => {
        console.error('Error al escuchar estudiantes (docente):', error);
      }
    );

    const finalizadasQuery = query(
      collection(window.db, 'solicitudes'),
      where('estado', '==', 'finalizado')
    );

    docenteSolicitudesUnsubscribe = onSnapshot(
      finalizadasQuery,
      (snapshot) => {
        docenteSolicitudesFinalizadasCache = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        refreshDocentePanelUI();
      },
      (error) => {
        console.error('Error al escuchar acompañamientos finalizados (docente):', error);
      }
    );
  }

  function refreshDocentePanelUI() {
    loadDocenteResumen();
    filtrarEstudiantes(docenteFiltroBusqueda);
    loadActividadesRecientes();
    if (docenteDetalleEstudianteId) {
      mostrarDetalleEstudiante(docenteDetalleEstudianteId, { scroll: false });
    }
  }

  function getAllEstudiantes() {
    return docenteEstudiantesCache;
  }

  async function fetchAllEstudiantes() {
    return getAllUniversitarios();
  }

  function getSolicitudesFinalizadasEstudiante(universitarioId) {
    return docenteSolicitudesFinalizadasCache.filter(
      (sol) => sol.universitarioId === universitarioId
    );
  }

  /** Horas reales con fechaInicio/fechaFin (igual que Historial del universitario) */
  function getHorasMsEstudiante(universitarioId) {
    return getSolicitudesFinalizadasEstudiante(universitarioId).reduce(
      (acc, sol) => acc + getDuracionMsAcompanamiento(sol),
      0
    );
  }

  function getHorasAcumuladasEstudiante(universitarioId) {
    return getHorasMsEstudiante(universitarioId) / 3600000;
  }

  function formatFechaRegistroEstudiante(estudiante) {
    const fecha =
      getTimestampAsDate(estudiante.fechaRegistro) ||
      getTimestampAsDate(estudiante.fechaCreacion);
    return fecha ? fecha.toLocaleDateString('es-ES') : '—';
  }

  function loadDocenteResumen() {
    const estudiantes = getAllEstudiantes();
    const totalEstudiantes = estudiantes.length;
    let totalAcompanamientos = 0;
    let totalPuntaje = 0;

    estudiantes.forEach((est) => {
      totalAcompanamientos += Number(est.acompanamientos) || 0;
      totalPuntaje += Number(est.puntaje) || 0;
    });

    const puntajePromedio =
      totalEstudiantes > 0 ? (totalPuntaje / totalEstudiantes).toFixed(1) : '0.0';

    const elEst = document.getElementById('stat-total-estudiantes');
    const elAcomp = document.getElementById('stat-total-acompanamientos');
    const elPuntaje = document.getElementById('stat-puntaje-promedio');
    if (elEst) elEst.textContent = totalEstudiantes;
    if (elAcomp) elAcomp.textContent = totalAcompanamientos;
    if (elPuntaje) elPuntaje.textContent = puntajePromedio;
  }

  function renderEstudiantesList(estudiantes) {
    const container = document.getElementById('estudiantes-list');
    if (!container) return;

    if (estudiantes.length === 0) {
      container.innerHTML = `
        <div class="estudiantes-empty">
          <p>${docenteFiltroBusqueda.trim() ? 'No se encontraron estudiantes' : 'No hay estudiantes registrados aún'}</p>
          ${
            docenteFiltroBusqueda.trim()
              ? ''
              : '<p class="estudiantes-empty-hint">Los estudiantes aparecerán aquí cuando se registren</p>'
          }
        </div>
      `;
      return;
    }

    container.innerHTML = estudiantes
      .map((est) => {
        const semanasActivas = Number(est.semanasActivas) || 0;
        const horasLabel = formatHorasTotalesAcumuladas(getHorasMsEstudiante(est.id));
        const acompanamientos = Number(est.acompanamientos) || 0;
        const puntaje = Number(est.puntaje) || 0;
        const calificacion = Number(est.calificacionPromedio) || 0;
        const nombre = escapeHtml(est.nombre || 'Sin nombre');
        const id = escapeHtml(est.id);

        return `
        <div class="estudiante-card" data-estudiante-id="${id}" role="button" tabindex="0">
          <div class="estudiante-card-header">
            <div class="estudiante-nombre">${nombre}</div>
            <div class="estudiante-puntaje">${puntaje} pts</div>
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
              <span>${horasLabel}</span>
            </div>
            <div class="estudiante-info-item">
              <span class="estudiante-info-label">Calificación promedio:</span>
              <span>${calificacion.toFixed(1)} <svg class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    container.querySelectorAll('.estudiante-card[data-estudiante-id]').forEach((card) => {
      const openDetalle = () => mostrarDetalleEstudiante(card.dataset.estudianteId);
      card.addEventListener('click', openDetalle);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetalle();
        }
      });
    });
  }

  function loadEstudiantes() {
    renderEstudiantesList(getAllEstudiantes());
  }

  function calcularPorcentajeCumplimiento(estudiante, semanasActivas) {
    const fechaRegistro =
      getTimestampAsDate(estudiante?.fechaRegistro) ||
      getTimestampAsDate(estudiante?.fechaCreacion);
    if (!fechaRegistro) return 0;

    const ahora = new Date();
    const diasTranscurridos = Math.floor(
      (ahora - fechaRegistro) / (1000 * 60 * 60 * 24)
    );
    const semanasTranscurridas = Math.floor(diasTranscurridos / 7);
    if (semanasTranscurridas === 0) return 0;

    const porcentaje = Math.round((semanasActivas / semanasTranscurridas) * 100);
    return Math.min(100, Math.max(0, porcentaje));
  }

  function filtrarEstudiantes(busqueda) {
    docenteFiltroBusqueda = busqueda || '';
    const estudiantes = getAllEstudiantes();
    const filtrados =
      docenteFiltroBusqueda.trim() === ''
        ? estudiantes
        : estudiantes.filter((est) =>
            (est.nombre || '')
              .toLowerCase()
              .includes(docenteFiltroBusqueda.toLowerCase())
          );
    renderEstudiantesList(filtrados);
  }

  window.mostrarDetalleEstudiante = function (estudianteId, options = {}) {
    const estudiante = getAllEstudiantes().find((e) => e.id === estudianteId);
    if (!estudiante) return;

    docenteDetalleEstudianteId = estudianteId;
    const shouldScroll = options.scroll !== false;

    const detalleSection = document.getElementById('estudiante-detalle-section');
    detalleSection?.classList.remove('hidden');

    const nombreEl = document.getElementById('estudiante-detalle-nombre');
    if (nombreEl) nombreEl.textContent = estudiante.nombre || 'Sin nombre';

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('detalle-universidad', estudiante.universidad || '—');
    setText('detalle-carrera', estudiante.carrera || '—');
    setText('detalle-zona', estudiante.zona || '—');
    setText('detalle-fecha-registro', formatFechaRegistroEstudiante(estudiante));

    const semanasActivas = Number(estudiante.semanasActivas) || 0;
    const horasMs = getHorasMsEstudiante(estudiante.id);
    const horasAcumuladas = getHorasAcumuladasEstudiante(estudiante.id);
    const horasLabel = formatHorasTotalesAcumuladas(horasMs);

    setText('detalle-puntaje', String(Number(estudiante.puntaje) || 0));
    setText('detalle-acompanamientos', String(Number(estudiante.acompanamientos) || 0));
    setText(
      'detalle-calificacion',
      (Number(estudiante.calificacionPromedio) || 0).toFixed(1)
    );
    setText('detalle-semanas', String(semanasActivas));
    setText('detalle-horas', horasLabel);

    const horasRequeridas = 160;
    const cumplimientoPorcentaje = Math.min(
      100,
      Math.round((horasAcumuladas / horasRequeridas) * 100)
    );
    setText(
      'detalle-cumplimiento',
      `${cumplimientoPorcentaje}% (${horasLabel} / ${horasRequeridas} h)`
    );

    loadHistorialEstudiante(estudiante);
    loadComentariosEstudiante(estudiante);

    if (shouldScroll) {
      detalleSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /**
   * Historial del estudiante desde solicitudes finalizadas en Firestore
   * Puntos separados: acompañamiento (10) + bono solo si calificación === 5
   */
  function loadHistorialEstudiante(estudiante) {
    const container = document.getElementById('detalle-historial');
    if (!container) return;

    const historial = getSolicitudesFinalizadasEstudiante(estudiante.id).sort((a, b) => {
      const finA = getTimestampAsDate(a.fechaFin)?.getTime() || 0;
      const finB = getTimestampAsDate(b.fechaFin)?.getTime() || 0;
      return finB - finA;
    });

    if (historial.length === 0) {
      container.innerHTML = `
        <div class="historial-empty">
          <p>No hay actividades registradas</p>
        </div>
      `;
      return;
    }

    container.innerHTML = historial
      .map((item) => {
        const tipo = item.tipoAyuda || item.tipo;
        const tipoLabel = item.tipoLabel || TIPO_AYUDA_LABELS[tipo] || tipo || 'Acompañamiento';
        const adulto = escapeHtml(item.adultoMayorNombre || 'Adulto Mayor');
        const fecha =
          getTimestampAsDate(item.fechaFin) || getTimestampAsDate(item.fechaInicio);
        const fechaLabel = fecha ? fecha.toLocaleDateString('es-ES') : '—';
        const duracion = formatDuracionAcompanamiento(getDuracionMsAcompanamiento(item));
        const calificacion =
          typeof item.calificacion === 'number' && item.calificacion >= 1 && item.calificacion <= 5
            ? item.calificacion
            : null;
        const bonoLine =
          calificacion === 5
            ? '<div class="historial-detalle-line">Bono por 5 estrellas: +5 puntos</div>'
            : '';
        const calificacionLine =
          calificacion != null
            ? `<div class="historial-detalle-line">Calificación del adulto mayor: ${calificacion} estrellas</div>`
            : '<div class="historial-detalle-line">Calificación del adulto mayor: pendiente</div>';

        return `
        <div class="historial-detalle-item">
          <div class="historial-detalle-titulo">${escapeHtml(tipoLabel)} · ${adulto}</div>
          <div class="historial-detalle-fecha">${fechaLabel} · ${duracion}</div>
          <div class="historial-detalle-line">Acompañamiento: 10 puntos</div>
          ${calificacionLine}
          ${bonoLine}
        </div>
      `;
      })
      .join('');
  }

  function loadComentariosEstudiante(estudiante) {
    const container = document.getElementById('detalle-comentarios');
    if (!container) return;

    const comentarios = getSolicitudesFinalizadasEstudiante(estudiante.id)
      .filter(
        (sol) =>
          typeof sol.calificacion === 'number' &&
          sol.calificacion >= 1 &&
          (sol.comentarioCalificacion || '').trim()
      )
      .sort((a, b) => {
        const fa =
          getTimestampAsDate(a.fechaCalificacion)?.getTime() ||
          getTimestampAsDate(a.fechaFin)?.getTime() ||
          0;
        const fb =
          getTimestampAsDate(b.fechaCalificacion)?.getTime() ||
          getTimestampAsDate(b.fechaFin)?.getTime() ||
          0;
        return fb - fa;
      });

    if (comentarios.length === 0) {
      container.innerHTML = `
        <div class="comentarios-empty">
          <p>No hay comentarios aún</p>
          <p class="comentarios-empty-hint">Los comentarios aparecerán cuando los adultos mayores califiquen</p>
        </div>
      `;
      return;
    }

    container.innerHTML = comentarios
      .map((cal) => {
        const rating = Number(cal.calificacion) || 0;
        const fecha =
          getTimestampAsDate(cal.fechaCalificacion) || getTimestampAsDate(cal.fechaFin);
        const estrellas = Array(rating)
          .fill(0)
          .map(
            () =>
              '<svg class="icon icon-inline" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
          )
          .join('');

        return `
          <div class="comentario-item">
            <div class="comentario-header">
              <div class="comentario-adulto">${escapeHtml(cal.adultoMayorNombre || 'Adulto Mayor')}</div>
              <div class="comentario-rating">${estrellas}</div>
            </div>
            <div class="comentario-texto">${escapeHtml(cal.comentarioCalificacion)}</div>
            <div class="comentario-fecha">
              ${fecha ? fecha.toLocaleDateString('es-ES') : '—'}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function loadActividadesRecientes() {
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

    container.innerHTML = estudiantes
      .map((est) => {
        const finalizadas = getSolicitudesFinalizadasEstudiante(est.id);
        const semanasActivas = Number(est.semanasActivas) || 0;
        const horasLabel = formatHorasTotalesAcumuladas(getHorasMsEstudiante(est.id));
        const calificacion = Number(est.calificacionPromedio) || 0;
        const comentarios = finalizadas
          .filter(
            (sol) =>
              typeof sol.calificacion === 'number' &&
              (sol.comentarioCalificacion || '').trim()
          )
          .sort((a, b) => {
            const fa =
              getTimestampAsDate(a.fechaCalificacion)?.getTime() ||
              getTimestampAsDate(a.fechaFin)?.getTime() ||
              0;
            const fb =
              getTimestampAsDate(b.fechaCalificacion)?.getTime() ||
              getTimestampAsDate(b.fechaFin)?.getTime() ||
              0;
            return fb - fa;
          })
          .slice(0, 3);

        return `
        <div class="actividad-estudiante-group">
          <div class="actividad-estudiante-header">
            <div class="actividad-estudiante-nombre">${escapeHtml(est.nombre || 'Sin nombre')}</div>
            <div class="actividad-estudiante-stats">
              <span>Acompañamientos: ${Number(est.acompanamientos) || 0}</span>
              <span>Semanas activas: ${semanasActivas}</span>
              <span>Horas: ${horasLabel}</span>
              <span>Calificación: ${calificacion.toFixed(1)} ⭐</span>
            </div>
          </div>
          ${
            finalizadas.length > 0
              ? `
            <div class="actividad-info">
              <strong>Acompañamientos completados:</strong> ${finalizadas.length}
            </div>
          `
              : ''
          }
          ${
            comentarios.length > 0
              ? `
            <div class="actividad-comentarios">
              <strong>Comentarios recientes:</strong>
              ${comentarios
                .map((com) => {
                  const fecha =
                    getTimestampAsDate(com.fechaCalificacion) ||
                    getTimestampAsDate(com.fechaFin);
                  return `
                <div class="actividad-comentario-item">
                  <div class="actividad-comentario-rating">
                    ${Array(Number(com.calificacion) || 0)
                      .fill(0)
                      .map(() => '⭐')
                      .join('')}
                  </div>
                  <div class="actividad-comentario-texto">${escapeHtml(com.comentarioCalificacion)}</div>
                  <div class="actividad-comentario-fecha">${
                    fecha ? fecha.toLocaleDateString('es-ES') : '—'
                  }</div>
                </div>
              `;
                })
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      `;
      })
      .join('');
  }
});
