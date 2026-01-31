/**
 * Tauri API 客户端封装
 * 提供类型安全的Rust后端调用接口
 */

interface TauriAPI {
  readJsonFile: (path: string) => Promise<string>;
  writeJsonFile: (path: string, content: string) => Promise<void>;
  openFileDialog: () => Promise<string | null>;
  saveFileDialog: () => Promise<string | null>;
  getAppConfigDir: () => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
  setWindowTitle: (title: string) => Promise<void>;
  setThemePreference: (theme: string) => Promise<void>;
  exportLatexFile: (content: string) => Promise<string>;
  exportMarkdownFile: (content: string) => Promise<string>;
  formatLatex: (formulas: Array<{ latex: string; note?: string }>) => Promise<string>;
  formatMarkdown: (formulas: Array<{ latex: string; note?: string }>) => Promise<string>;
  normalizeFormulas: (content: string) => Promise<Array<{ id: string; index: number; latex: string; note?: string }>>;
  normalizeTemplates: (content: string) => Promise<{ categories: Array<any>; selectedCategoryId: string }>;
  getSystemInfo: () => Promise<string>;
}

// 获取可用的 Tauri invoke 函数（兼容不同版本）
const resolveTauriInvoke = (): ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | null => {
  if (typeof window === 'undefined') return null;
  const tauriGlobal: any = (window as any).__TAURI__;
  const invoke = tauriGlobal?.invoke || tauriGlobal?.tauri?.invoke || tauriGlobal?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
};

// 检测Tauri环境
export const isTauri = (): boolean => {
  return resolveTauriInvoke() !== null;
};

// 获取Tauri invoke函数
const getTauriInvoke = () => {
  const invoke = resolveTauriInvoke();
  if (!invoke) {
    throw new Error('Tauri invoke not available');
  }
  return invoke;
};

// 创建Tauri API代理
export const createTauriAPI = (): TauriAPI => {
  if (!isTauri()) {
    // 返回空实现用于非Tauri环境
    return {
      readJsonFile: async () => { throw new Error('Tauri not available'); },
      writeJsonFile: async () => { throw new Error('Tauri not available'); },
      openFileDialog: async () => null,
      saveFileDialog: async () => null,
      getAppConfigDir: async () => '',
      fileExists: async () => false,
      setWindowTitle: async () => {},
      setThemePreference: async () => {},
      exportLatexFile: async () => { throw new Error('Tauri not available'); },
      exportMarkdownFile: async () => { throw new Error('Tauri not available'); },
      formatLatex: async () => { throw new Error('Tauri not available'); },
      formatMarkdown: async () => { throw new Error('Tauri not available'); },
      normalizeFormulas: async () => { throw new Error('Tauri not available'); },
      normalizeTemplates: async () => { throw new Error('Tauri not available'); },
      getSystemInfo: async () => 'Non-Tauri environment',
    };
  }

  const invoke = getTauriInvoke();

  return {
    readJsonFile: (path: string) => invoke('read_json_file', { path }),
    writeJsonFile: (path: string, content: string) => invoke('write_json_file', { path, content }),
    openFileDialog: () => invoke('open_file_dialog'),
    saveFileDialog: () => invoke('save_file_dialog'),
    getAppConfigDir: () => invoke('get_app_config_dir'),
    fileExists: (path: string) => invoke('file_exists', { path }),
    setWindowTitle: (title: string) => invoke('set_window_title', { title }),
    setThemePreference: (theme: string) => invoke('set_theme_preference', { theme }),
    exportLatexFile: (content: string) => invoke('export_latex_file', { content }),
    exportMarkdownFile: (content: string) => invoke('export_markdown_file', { content }),
    formatLatex: (formulas: Array<{ latex: string; note?: string }>) =>
      invoke('format_latex', { formulas }),
    formatMarkdown: (formulas: Array<{ latex: string; note?: string }>) =>
      invoke('format_markdown', { formulas }),
    normalizeFormulas: (content: string) => invoke('normalize_formulas', { content }),
    normalizeTemplates: (content: string) => invoke('normalize_templates', { content }),
    getSystemInfo: () => invoke('get_system_info'),
  };
};

// 单例实例
let tauriAPI: TauriAPI | null = null;

export const getTauriAPI = (): TauriAPI => {
  if (!tauriAPI) {
    tauriAPI = createTauriAPI();
  }
  return tauriAPI;
};

// 文件读写辅助函数
export const readFormulaFile = async (path: string) => {
  const api = getTauriAPI();
  const content = await api.readJsonFile(path);
  return JSON.parse(content);
};

export const writeFormulaFile = async (path: string, data: any) => {
  const api = getTauriAPI();
  const content = JSON.stringify(data, null, 2);
  await api.writeJsonFile(path, content);
};

// 导出辅助函数
export const exportLatex = async (formulas: Array<{ latex: string; note?: string }>) => {
  const api = getTauriAPI();
  const content = formulas
    .map((f, i) => {
      const header = f.note ? `% ${f.note}\n` : '';
      return `${header}${f.latex}`;
    })
    .join('\n\n');
  
  return await api.exportLatexFile(content);
};

export const exportMarkdown = async (formulas: Array<{ latex: string; note?: string }>) => {
  const api = getTauriAPI();
  const content = formulas
    .map((f, i) => {
      const note = f.note ? `**${f.note}**\n\n` : '';
      return `${note}$$\n${f.latex}\n$$`;
    })
    .join('\n\n---\n\n');
  
  return await api.exportMarkdownFile(content);
};
