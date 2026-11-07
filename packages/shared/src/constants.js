// Regras de negócio compartilhadas entre painel, player e integrações.

/** Sem contato há mais de 15 min = Atenção; mais de 60 min = Offline. */
export const STATUS_WARN_MS = 15 * 60 * 1000;
export const STATUS_OFFLINE_MS = 60 * 60 * 1000;

/** Intervalo do sinal de vida do player. Bem abaixo do limite de Atenção. */
export const HEARTBEAT_MS = 60 * 1000;

/** Versão mínima do player antes de marcar a tela como "app desatualizado". */
// 0.2.1: a TV avisa de novo quando a senha é chamada de novo ("De novo" no GerenciaAI).
export const PLAYER_MIN_VERSION = '0.2.1';
/** Players mais antigos só entendem "horizontal/vertical": 180° fica como 0° e 270° como 90°. */
export const ROTATION_MIN_VERSION = '0.2.1';

/** Código de pareamento: 6 caracteres sem 0/O, 1/I/L, para ler a 5 m de distância. */
export const PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIRING_LENGTH = 6;
export const PAIRING_TTL_MS = 30 * 60 * 1000;

export const PAIRING_KIND = { SCREEN: 'screen', INTEGRATION: 'integration' };

export const ROLES = ['viewer', 'editor', 'admin', 'owner'];
export const ROLE_LABEL = {
  owner: 'Proprietário',
  admin: 'Administrador',
  editor: 'Editor de conteúdo',
  viewer: 'Somente leitura',
};

export const ORIENTATIONS = { landscape: 'Horizontal', portrait: 'Vertical' };

/** Rotação do conteúdo na TV (como a TV está instalada na parede). */
export const ROTATIONS = {
  0: 'Horizontal',
  90: 'Vertical (girada à direita)',
  180: 'Horizontal invertida',
  270: 'Vertical (girada à esquerda)',
};

/** Como a mídia preenche a tela quando a proporção é diferente. */
export const FIT_MODES = {
  cover: 'Preencher (corta as bordas)',
  contain: 'Mostrar inteira (com faixas)',
  blur: 'Inteira com fundo desfocado',
  fill: 'Esticar',
};

/** Posição do conteúdo na TV. zoom em %, deslocamentos em % da tela. */
export const DISPLAY_DEFAULTS = { rotation: 0, zoom: 100, offsetX: 0, offsetY: 0, fit: 'cover' };
export const DISPLAY_LIMITS = { zoom: [80, 120], offset: [-10, 10] };
/** Ajuste de uma mídia numa tela específica: tamanho (%) e posição (% da tela). */
export const MEDIA_ADJUST_LIMITS = { zoom: [50, 200], offset: [-50, 50] };
/** Por quanto tempo uma mídia fica "fixada" na TV enquanto alguém ajusta pelo painel. */
export const PIN_MS = 5 * 60 * 1000;
/** Quanto tempo a grade de ajuste fica na TV depois de ligada no painel. */
export const CALIBRATION_MS = 10 * 60 * 1000;

/** Modos do painel de pedidos na TV. */
export const ORDER_BOARD_MODES = {
  off: 'Desligado',
  overlay: 'Aviso em tela cheia',
  sidebar: 'Coluna lateral',
  full: 'Painel dedicado',
};
export const ORDER_STATUS = { PREPARING: 'preparing', READY: 'ready', DELIVERED: 'delivered' };
export const ORDER_NAME_FORMATS = {
  'first-initial': 'Nome e inicial (Maria S.)',
  first: 'Só o primeiro nome (Maria)',
  full: 'Nome completo',
  none: 'Só o número do pedido',
};
export const ORDER_BOARD_DEFAULTS = {
  mode: 'off',
  overlaySec: 12,
  readyTtlMin: 10,
  nameFormat: 'first-initial',
  chime: true,
  showPreparing: true,
};
/** Pedidos somem do Firestore 24 h depois (política de TTL no campo expireAt). */
export const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const DEFAULT_IMAGE_SECONDS = 10;

export const PLANS = {
  start: { name: 'Start', screens: 3, storageMB: 2048 },
  pro: { name: 'Pro', screens: 15, storageMB: 10240 },
  rede: { name: 'Rede', screens: 100, storageMB: 51200 },
};
