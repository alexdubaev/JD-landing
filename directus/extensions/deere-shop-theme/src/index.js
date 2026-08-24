// DEERE-SHOP · тема Data Studio (light)
// Слой-адаптер: все значения — из токенов бренда; при смене версии Directus
// достаточно править этот один файл.

const FONT_SANS = "'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'Cascadia Code', 'JetBrains Mono', Consolas, monospace";

export default {
  id: 'deere-shop',
  name: 'Deere Shop',
  appearance: 'light',

  rules: {
    // --- базовая геометрия ---
    borderRadius: '6px',
    borderWidth: '1px',

    // --- текст ---
    foreground: '#1b2a22',
    foregroundSubdued: '#5f6e66',
    foregroundAccent: '#1e6b4f',

    // --- фоны ---
    background: '#f4f6f5',
    backgroundNormal: '#ffffff',
    backgroundSubdued: '#edf1ee',
    backgroundAccent: '#e4f0ea',

    // --- границы ---
    borderColor: '#e2e8e4',
    borderColorSubdued: '#eef1ef',
    borderColorAccent: '#1e6b4f',

    // --- основной (зелёный) ---
    primary: '#1e6b4f',
    primaryBackground: '#1e6b4f',
    primarySubdued: '#e4f0ea',
    primaryAccent: '#17583f',

    // --- вторичный (янтарный акцент) ---
    secondary: '#b8791f',
    secondaryBackground: '#d99a2b',
    secondarySubdued: '#fbf2df',
    secondaryAccent: '#8f5f18',

    // --- success / warning / danger ---
    success: '#2e8b57',
    successBackground: '#2e8b57',
    successSubdued: '#e3f3ea',
    successAccent: '#246b43',

    warning: '#b8791f',
    warningBackground: '#b8791f',
    warningSubdued: '#fbf2df',
    warningAccent: '#8f5f18',

    danger: '#c2433c',
    dangerBackground: '#c2433c',
    dangerSubdued: '#f7e6e4',
    dangerAccent: '#9e3530',

    // --- шрифты ---
    fonts: {
      display: { fontFamily: FONT_SANS, fontWeight: '600' },
      title: { fontFamily: FONT_SANS, fontWeight: '600' },
      sans: { fontFamily: FONT_SANS, fontWeight: '400' },
      serif: { fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: '400' },
      monospace: { fontFamily: FONT_MONO, fontWeight: '400' },
    },

    // --- оболочка ---
    shell: {
      background: '#124532',
      backgroundAccent: '#0f3a2b',
      borderWidth: '1px',
      borderColor: 'rgba(255,255,255,0.08)',
    },

    // --- навигация (тёмно-зелёный сайдбар) ---
    navigation: {
      project: { foreground: '#ffffff', fontFamily: FONT_SANS },
      modules: {
        background: '#124532',
        borderWidth: '1px',
        borderColor: 'rgba(255,255,255,0.08)',
        button: {
          foreground: '#c6d8ce',
          foregroundHover: '#ffffff',
          foregroundActive: '#ffffff',
          background: 'transparent',
          backgroundHover: 'rgba(255,255,255,0.06)',
          backgroundActive: 'rgba(255,255,255,0.12)',
        },
      },
      list: {
        icon: {
          foreground: '#9db8aa',
          foregroundHover: '#ffffff',
          foregroundActive: '#ffffff',
        },
        foreground: '#c6d8ce',
        foregroundHover: '#ffffff',
        foregroundActive: '#ffffff',
        background: 'transparent',
        backgroundHover: 'rgba(255,255,255,0.06)',
        backgroundActive: 'rgba(255,255,255,0.12)',
        fontFamily: FONT_SANS,
        divider: { borderColor: 'rgba(255,255,255,0.08)', borderWidth: '1px' },
      },
    },

    // --- заголовок страницы ---
    header: {
      title: { foreground: '#1b2a22', fontFamily: FONT_SANS, fontWeight: '600' },
    },

    // --- боковая панель (detail sidebar) ---
    sidebar: {
      background: '#ffffff',
      foreground: '#1b2a22',
      fontFamily: FONT_SANS,
      borderWidth: '1px',
      borderColor: '#e2e8e4',
      section: {
        borderWidth: '1px',
        borderColor: '#eef1ef',
        active: { borderWidth: '2px', borderColor: '#1e6b4f' },
        toggle: {
          icon: {
            foreground: '#5f6e66',
            foregroundHover: '#1b2a22',
            foregroundActive: '#1e6b4f',
          },
          foreground: '#1b2a22',
          foregroundHover: '#1b2a22',
          foregroundActive: '#1e6b4f',
          background: 'transparent',
          backgroundHover: '#f4f6f5',
          backgroundActive: '#e4f0ea',
          fontFamily: FONT_SANS,
        },
      },
    },

    // --- формы ---
    form: {
      columnGap: '16px',
      rowGap: '20px',
      field: {
        label: { foreground: '#1b2a22', fontFamily: FONT_SANS, fontWeight: '600' },
        input: {
          background: '#ffffff',
          backgroundSubdued: '#f4f6f5',
          foreground: '#1b2a22',
          foregroundSubdued: '#5f6e66',
          borderColor: '#e2e8e4',
          borderColorHover: '#1e6b4f',
          focusRingColor: '#1e6b4f',
          height: '40px',
          padding: '8px 12px',
        },
      },
    },

    // --- всплывающие меню ---
    popover: {
      menu: {
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(18,53,42,0.14)',
      },
    },

    // --- страница входа (публичная) ---
    public: {
      background: '#124532',
      foreground: '#ffffff',
      foregroundAccent: '#d99a2b',
      art: {
        background: '#124532',
        primary: '#1e6b4f',
        secondary: '#d99a2b',
        speed: '24s',
      },
    },
  },
};
