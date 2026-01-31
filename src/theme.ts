/**
 * 主题系统 - 支持多种主题与动态切换
 */

export type ThemeName = 'light' | 'dark' | 'blue' | 'pink' | 'green' | 'purple' | 'paper' | 'sunset';

export interface ThemeColors {
  name: ThemeName;
  displayName: string;
  primary: string;
  primaryHover: string;
  background: string;
  panelBg: string;
  text: string;
  textSecondary: string;
  border: string;
  danger: string;
  dangerHover: string;
  success: string;
  warning: string;
  gradient?: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  light: {
    name: 'light',
    displayName: '浅色模式',
    primary: '#155eef',
    primaryHover: '#064acb',
    background: '#f5f7fb',
    panelBg: '#ffffff',
    text: '#101828',
    textSecondary: '#475467',
    border: '#e5e7eb',
    danger: '#d92d20',
    dangerHover: '#b42318',
    success: '#039855',
    warning: '#dc6803',
    gradient: 'radial-gradient(circle at top left, #e0ecff, transparent 55%), radial-gradient(circle at bottom right, #fde2e4, transparent 45%), #f5f7fb',
  },
  dark: {
    name: 'dark',
    displayName: '深色模式',
    primary: '#60a5fa',
    primaryHover: '#3b82f6',
    background: '#020617',
    panelBg: '#0b1220',
    text: '#e2e8f0',
    textSecondary: '#cbd5f5',
    border: '#1f2a44',
    danger: '#f87171',
    dangerHover: '#ef4444',
    success: '#34d399',
    warning: '#fbbf24',
    gradient: 'radial-gradient(circle at top left, rgba(14, 116, 144, 0.35), transparent 55%), radial-gradient(circle at bottom right, rgba(8, 47, 73, 0.7), transparent 45%), #020617',
  },
  blue: {
    name: 'blue',
    displayName: '海洋蓝',
    primary: '#0891b2',
    primaryHover: '#0e7490',
    background: '#f0f9ff',
    panelBg: '#ffffff',
    text: '#0c4a6e',
    textSecondary: '#075985',
    border: '#bae6fd',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    success: '#059669',
    warning: '#d97706',
    gradient: 'radial-gradient(circle at top left, #e0f2fe, transparent 55%), radial-gradient(circle at bottom right, #dbeafe, transparent 45%), #f0f9ff',
  },
  pink: {
    name: 'pink',
    displayName: '樱花粉',
    primary: '#ec4899',
    primaryHover: '#db2777',
    background: '#fdf2f8',
    panelBg: '#ffffff',
    text: '#831843',
    textSecondary: '#9f1239',
    border: '#fbcfe8',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    success: '#059669',
    warning: '#d97706',
    gradient: 'radial-gradient(circle at top left, #fce7f3, transparent 55%), radial-gradient(circle at bottom right, #fef3c7, transparent 45%), #fdf2f8',
  },
  green: {
    name: 'green',
    displayName: '森林绿',
    primary: '#059669',
    primaryHover: '#047857',
    background: '#f0fdf4',
    panelBg: '#ffffff',
    text: '#064e3b',
    textSecondary: '#065f46',
    border: '#bbf7d0',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    success: '#16a34a',
    warning: '#d97706',
    gradient: 'radial-gradient(circle at top left, #dcfce7, transparent 55%), radial-gradient(circle at bottom right, #d1fae5, transparent 45%), #f0fdf4',
  },
  purple: {
    name: 'purple',
    displayName: '优雅紫',
    primary: '#9333ea',
    primaryHover: '#7e22ce',
    background: '#faf5ff',
    panelBg: '#ffffff',
    text: '#581c87',
    textSecondary: '#6b21a8',
    border: '#e9d5ff',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    success: '#059669',
    warning: '#d97706',
    gradient: 'radial-gradient(circle at top left, #f3e8ff, transparent 55%), radial-gradient(circle at bottom right, #e9d5ff, transparent 45%), #faf5ff',
  },
  paper: {
    name: 'paper',
    displayName: '纸张',
    primary: '#8b5e3c',
    primaryHover: '#6f4a2f',
    background: '#fbf7ee',
    panelBg: '#fffaf1',
    text: '#3b2f2f',
    textSecondary: '#5b4a4a',
    border: '#e5dccd',
    danger: '#c2410c',
    dangerHover: '#9a3412',
    success: '#15803d',
    warning: '#b45309',
    gradient: 'radial-gradient(circle at top left, #fff7e6, transparent 55%), radial-gradient(circle at bottom right, #fdecc8, transparent 45%), #fbf7ee',
  },
  sunset: {
    name: 'sunset',
    displayName: '落日',
    primary: '#f97316',
    primaryHover: '#ea580c',
    background: '#fff1e6',
    panelBg: '#fff8f2',
    text: '#4b1d1d',
    textSecondary: '#7c2d12',
    border: '#f3c4b2',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    success: '#16a34a',
    warning: '#d97706',
    gradient: 'radial-gradient(circle at top left, #ffe4d6, transparent 55%), radial-gradient(circle at bottom right, #ffd3b5, transparent 45%), #fff1e6',
  },
};

export class ThemeManager {
  private currentTheme: ThemeName = 'light';
  private root = document.documentElement;
  private storageKey = 'mathlive.theme';

  constructor() {
    this.loadTheme();
  }

  public setTheme(theme: ThemeName): void {
    this.currentTheme = theme;
    const colors = themes[theme];
    
    // 移除所有主题类
    document.body.className = document.body.className
      .split(' ')
      .filter((cls) => !cls.startsWith('theme-'))
      .join(' ');
    
    // 添加当前主题类
    document.body.classList.add(`theme-${theme}`);

    // 设置CSS变量
    this.root.style.setProperty('--primary', colors.primary);
    this.root.style.setProperty('--primary-hover', colors.primaryHover);
    this.root.style.setProperty('--background', colors.background);
    this.root.style.setProperty('--panel-bg', colors.panelBg);
    this.root.style.setProperty('--text', colors.text);
    this.root.style.setProperty('--text-secondary', colors.textSecondary);
    this.root.style.setProperty('--border', colors.border);
    this.root.style.setProperty('--danger', colors.danger);
    this.root.style.setProperty('--danger-hover', colors.dangerHover);
    this.root.style.setProperty('--success', colors.success);
    this.root.style.setProperty('--warning', colors.warning);

    if (colors.gradient) {
      document.body.style.background = colors.gradient;
    }

    // 保存到本地存储
    this.saveTheme();

    // 触发主题变更事件
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  public getTheme(): ThemeName {
    return this.currentTheme;
  }

  public getThemeColors(): ThemeColors {
    return themes[this.currentTheme];
  }

  public getAllThemes(): ThemeColors[] {
    return Object.values(themes);
  }

  private saveTheme(): void {
    try {
      localStorage.setItem(this.storageKey, this.currentTheme);
    } catch (error) {
      console.info('无法保存主题设置', error);
    }
  }

  private loadTheme(): void {
    try {
      const saved = localStorage.getItem(this.storageKey) as ThemeName | null;
      if (saved && themes[saved]) {
        this.setTheme(saved);
      } else {
        this.setTheme('light');
      }
    } catch (error) {
      console.info('无法读取主题设置', error);
      this.setTheme('light');
    }
  }
}

export const themeManager = new ThemeManager();
