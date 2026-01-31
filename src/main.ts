// 动态导入优化：按需加载 MathLive 减少初始包大小
import type { MathfieldElement } from 'mathlive';
import '../node_modules/mathlive/mathlive-static.css';
import sampleTemplateLibrary from '../template-library.sample.json';
import './styles.css';
import { createVirtualList, type VirtualListOptions } from './virtualList';
import { themeManager } from './theme';
import { AutoCompleter } from './autocomplete';
import { performanceMonitor, batchRenderer } from './performance';
import { getTauriAPI, isTauri } from './tauriApi';
import { stringCache, memoryMonitor, createElementPool, BatchOptimizer } from './memoryOptimizer';

// 延迟加载 MathLive 的实际实现
let MathLiveModule: typeof import('mathlive') | null = null;
let convertLatexToMarkup: typeof import('mathlive').convertLatexToMarkup | null = null;

const loadMathLive = async () => {
  if (!MathLiveModule) {
    MathLiveModule = await import('mathlive');
    convertLatexToMarkup = MathLiveModule.convertLatexToMarkup;
  }
  return MathLiveModule;
};

type Theme = 'light' | 'dark' | 'blue' | 'pink' | 'green' | 'purple' | 'paper' | 'sunset';
type Mode = 'wysiwyg' | 'latex';
type BoundFileHandleType = 'none' | 'fsa' | 'electron' | 'tauri';

type FormulaItem = {
  id: string;
  index: number;
  latex: string;
  note?: string;
};

type TemplateItem = {
  id: string;
  name: string;
  latex: string;
  note?: string;
};

type TemplateCategory = {
  id: string;
  name: string;
  templates: TemplateItem[];
  parentId?: string;
};

type TemplateLibrary = {
  categories: TemplateCategory[];
  selectedCategoryId: string;
};

/**
 * 渲染进程入口：
 *  - 初始化 MathLive 编辑器与自定义 UI 布局。
 *  - 管理 JSON/模板库数据读写及自动保存。
 *  - 通过 preload 暴露的 electronAPI 与桌面端菜单联动（LAN 状态、主题、模板操作）。
 *  - 在浏览器环境下自动降级（隐藏状态栏、禁用文件绑定等）。
 */

// Centralized UI + persistence state; mutated via helper functions to keep DOM in sync
const TEMPLATE_STORAGE_KEY = 'mathlive.templateLibrary';
const ALL_CATEGORY_ID = '__all__';

const state: {
  formulas: FormulaItem[];
  mode: Mode;
  nextIndex: number;
  editingId: string | null;
  boundFileHandle: FileSystemFileHandle | null;
  boundFileName: string;
  boundFileHandleType: BoundFileHandleType;
  boundFilePath: string;
  lastAutosaveAt: Date | null;
  templateLibrary: TemplateLibrary;
  templateFileHandle: FileSystemFileHandle | null;
  templateFileName: string;
  templateFilePath: string;
  templateSearchTerm: string;
  theme: Theme;
  formulaSearchTerm: string;
  virtualListEnabled: boolean;
} = {
  formulas: [],
  mode: 'wysiwyg',
  nextIndex: 1,
  editingId: null,
  virtualListEnabled: false,
  boundFileHandle: null,
  boundFileName: '',
  boundFileHandleType: 'none',
  boundFilePath: '',
  lastAutosaveAt: null,
  templateLibrary: {
    categories: [],
    selectedCategoryId: '',
  },
  templateFileHandle: null,
  templateFileName: '',
  templateFilePath: '',
  templateSearchTerm: '',
  theme: 'light',
  formulaSearchTerm: '',
};

const AUTOSAVE_INTERVAL_MS = 60_000;
const TEMPLATE_AUTOSAVE_INTERVAL_MS = 60_000;
const TEMPLATE_POPOVER_WIDTH = 440;
const THEME_STORAGE_KEY = 'mathlive.themePreference';
const VIRTUAL_LIST_THRESHOLD = 50; // 启用虚拟列表的公式数量阈值

// DOM 对象池：复用频繁创建的 DOM 节点
const formulaCardPool = createElementPool<HTMLElement>('article', 20, 100);
const templateItemPool = createElementPool<HTMLElement>('div', 10, 50);

let autosaveIntervalId: number | null = null;
let autosaveDebounceId: number | null = null;
let templateAutosaveIntervalId: number | null = null;
let formulaVirtualList: ReturnType<typeof createVirtualList<FormulaItem>> | null = null;

const sendToElectron = (type: string, payload?: unknown) => {
  const message = JSON.stringify({ type, payload });
  if (window.electronAPI) {
    // Already handled via direct API access usually, but if we need reverse comms:
    // This part is mostly for existing status updates if needed
  }
};

const sendToFlutter = (type: string, payload?: unknown) => {
  // Flutter integration removed. This is a stub to prevent runtime errors.
};

const assertElement = <T extends Element>(element: T | null, name: string): T => {
  if (!element) {
    throw new Error(`Missing required element: ${name}`);
  }
  return element;
};

const app = assertElement(document.querySelector('#app'), '#app');

// Toast Notification System
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  const handleAnimationEnd = () => {
    toast.removeEventListener('animationend', handleAnimationEnd);
    toast.remove();
  };

  setTimeout(() => {
    toast.classList.add('toast--hiding');
    toast.addEventListener('animationend', handleAnimationEnd, { once: true });
  }, 3000);
};

// Override alert with toast for better UX
window.alert = (msg?: string) => showToast(msg || '', 'warning');

const isElectronShell = Boolean(window?.electronAPI);
const isTauriEnv = isTauri();
const tauriApi = getTauriAPI();

const extractFileName = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  return parts.pop() || path;
};

const hasBoundFile = () => {
  if (state.boundFileHandleType === 'fsa') {
    return Boolean(state.boundFileHandle);
  }
  if (state.boundFileHandleType === 'electron') {
    return Boolean(state.boundFilePath);
  }
  if (state.boundFileHandleType === 'tauri') {
    return Boolean(state.boundFilePath);
  }
  return false;
};

const getBoundFileLabel = () => {
  if (state.boundFileName) return state.boundFileName;
  if (state.boundFileHandleType === 'electron' && state.boundFilePath) {
    return extractFileName(state.boundFilePath);
  }
  if (state.boundFileHandleType === 'tauri' && state.boundFilePath) {
    return extractFileName(state.boundFilePath);
  }
  return 'formulas.json';
};

// Theme helpers keep renderer, localStorage, and Electron menu in sync.
const applyTheme = (theme: Theme) => {
  themeManager.setTheme(theme);
};

const setTheme = (theme: Theme, { skipPersist = false }: { skipPersist?: boolean } = {}) => {
  const validThemes: Theme[] = ['light', 'dark', 'blue', 'pink', 'green', 'purple', 'paper', 'sunset'];
  const nextTheme = validThemes.includes(theme) ? theme : 'light';
  if (state.theme === nextTheme && !skipPersist) {
    // Theme already set
  }
  state.theme = nextTheme;
  applyTheme(nextTheme);
  if (!skipPersist) {
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      console.info('无法保存主题偏好', error);
    }
    if (isTauriEnv) {
      tauriApi.setThemePreference(nextTheme).catch((error) => {
        console.info('无法写入 Tauri 主题偏好', error);
      });
    } else if (nextTheme === 'light' || nextTheme === 'dark') {
      window?.electronAPI?.setThemePreference?.(nextTheme);
    }
  }
};

const loadThemePreference = () => {
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    const validThemes: Theme[] = ['light', 'dark', 'blue', 'pink', 'green', 'purple', 'paper', 'sunset'];
    if (stored && validThemes.includes(stored as Theme)) {
      setTheme(stored as Theme, { skipPersist: true });
      return;
    }
  } catch (error) {
    console.info('无法读取主题偏好', error);
  }
  setTheme('light', { skipPersist: true });
};

loadThemePreference();

// Build the split-pane layout up front so all handlers can query for elements once
const layout = document.createElement('div');
layout.className = 'layout';
layout.innerHTML = `
  <section class="panel panel-input">
    <header class="panel__header">
      <div class="panel-input__actions">
        <button id="newFormulaSet" type="button" class="secondary-btn">新建公式集</button>
        <button id="loadJsonButton" type="button" class="secondary-btn">导入 JSON</button>
        <span id="autosaveStatus" class="autosave-status autosave-inline"></span>
      </div>
      <div class="mode-toggle" role="tablist" aria-label="输入模式">
        <button data-mode="wysiwyg" role="tab" aria-selected="true">可视化编辑</button>
        <button data-mode="latex" role="tab" aria-selected="false">源代码</button>
      </div>
    </header>

    <div class="input-stack" data-mode="wysiwyg">
      <div class="wysiwyg-wrapper">
        <div class="mathlive-container">

          <div class="mathfield-host"></div>
          <div class="mathlive-toolbar">
            <button id="clearMathfield" class="secondary-btn">🧹 清空</button>
            <button id="undoStep" class="secondary-btn" title="撤销">↩</button>
            <button id="redoStep" class="secondary-btn" title="重做">↪</button>
          </div>
        </div>
      </div>

      <div class="latex-wrapper" hidden>
        <label for="latexInput">LaTeX 输入</label>
        <textarea id="latexInput" spellcheck="false" placeholder="例如：\\int_0^1 x^2 \\mathrm{d}x"></textarea>
        <div class="latex-preview" aria-live="polite"></div>
      </div>

      <label for="noteInput">中文解释（可选）</label>
      <textarea id="noteInput" rows="2" placeholder="示例：该积分表示单位区间上的二次函数面积"></textarea>
      <div class="note-preview" aria-live="polite"></div>

      <div class="action-row">
        <button id="addFormula" class="primary">➕ 添加到右侧</button>
        <button id="resetCurrent">↺ 重置当前输入</button>
      </div>
      <p class="edit-hint" id="editHint" hidden>当前处于编辑模式，请保存或取消。</p>
    </div>

  </section>

  <section class="panel panel-output">
    <header class="panel__header">
      <div>
        <h2>预览 · 自动编号</h2>
        <p>左侧输入的所有公式会在此区域按顺序显示</p>
      </div>
      <div class="output-actions">
        <div class="output-actions__row">
          <div class="template-actions">
            <button id="toggleTemplatePanel" class="secondary-btn">打开模板库</button>
            <button id="bindTemplate" class="secondary-btn">绑定模板</button>
          </div>
          <label class="theme-picker">
            主题
            <select id="themeSelect">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="paper">纸张</option>
              <option value="sunset">落日</option>
            </select>
          </label>
        </div>
        <button id="exportJson" class="secondary-btn" title="导出为 JSON">导出 JSON</button>
        <button id="copyJson" class="secondary-btn" title="复制 JSON 到剪贴板">复制 JSON</button>
        <button id="exportLatex" class="secondary-btn" title="导出为 LaTeX 源码">导出 LaTeX</button>
        <button id="exportMarkdown" class="secondary-btn" title="导出为 Markdown">导出 Markdown</button>
        <button id="clearAll" class="danger">清空全部</button>
      </div>
    </header>
    <div class="memory-monitor" id="memoryMonitor">
      <div class="memory-monitor__toggle" id="memoryToggle">🧠 内存</div>
      <div class="memory-monitor__panel" id="memoryPanel" hidden>
        <div class="memory-stat">
          <span>已用:</span>
          <strong id="memoryUsed">--</strong>
        </div>
        <div class="memory-stat">
          <span>总计:</span>
          <strong id="memoryTotal">--</strong>
        </div>
        <div class="memory-stat">
          <span>使用率:</span>
          <strong id="memoryPercent">--</strong>
        </div>
        <div class="memory-stat">
          <span>字符串缓存:</span>
          <strong id="stringCacheSize">0</strong>
        </div>
        <button id="clearCachesBtn" class="secondary-btn" style="margin-top: 8px;">清理缓存</button>
      </div>
    </div>
    <div class="search-row">
      <input type="search" id="formulaSearchInput" placeholder="搜索公式 LaTeX 或说明..." />
    </div>
    <div class="formula-list" aria-live="polite"></div>
  </section>

  <div class="column-divider" id="templateDivider" role="separator" aria-label="调整模板列宽度"></div>

  <section class="panel panel-templates">
    <div class="template-popover template-panel" id="templatePopover" aria-label="模板库">
      <header class="template-popover__header">
        <div>
          <h3>模板库</h3>
          <p>选择分类、搜索并快速插入模板</p>
        </div>
        <div>
          <button id="exportTemplateJson" type="button" class="secondary-btn" title="导出模板库">导出 JSON</button>
        </div>
      </header>
      <div class="template-panel__body">
        <aside class="template-tree" aria-label="模板分类">
          <div class="template-tree__header">
            <span>分类</span>
            <div class="template-tree__actions">
              <button id="createTemplateCategory" type="button">➕ 新建分类</button>
              <button id="deleteCurrentCategory" type="button" class="danger">删除分类</button>
            </div>
          </div>
          <div class="template-tree__list" id="templateTree"></div>
        </aside>
        <div class="template-panel__content">
          <div class="template-popover__search-row">
            <input type="search" id="templateSearchInput" placeholder="搜索模板名称 / 备注 / LaTeX" />
          </div>
          <div class="template-popover__save">
            <input type="text" id="templateName" placeholder="模板名称，例如：常用积分 I" />
            <button id="saveTemplate" type="button">⭐ 保存为模板</button>
          </div>
          <div class="template-popover__list" id="templateList">
            <p class="hint">尚无模板，创建分类后即可保存。</p>
          </div>
        </div>
      </div>
    </div>
  </section>
`;

const topBar = document.createElement('section');
topBar.className = 'top-bar';
topBar.innerHTML = `
  <div class="status-bar" aria-live="polite">
    <span id="lanStatus"></span>
  </div>

  <input type="file" id="importJsonInput" accept="application/json" hidden />
  <input type="file" id="importTemplateInput" accept="application/json" hidden />
`;

app.appendChild(topBar);
app.appendChild(layout);

// Pre-cache frequently used DOM nodes for performance and readability
const mathfieldHost = assertElement(layout.querySelector<HTMLDivElement>('.mathfield-host'), '.mathfield-host');
const latexWrapper = assertElement(layout.querySelector<HTMLDivElement>('.latex-wrapper'), '.latex-wrapper');
const latexInput = assertElement(layout.querySelector<HTMLTextAreaElement>('#latexInput'), '#latexInput');
const latexPreview = assertElement(layout.querySelector<HTMLDivElement>('.latex-preview'), '.latex-preview');
const noteInput = assertElement(layout.querySelector<HTMLTextAreaElement>('#noteInput'), '#noteInput');
const notePreview = assertElement(layout.querySelector<HTMLDivElement>('.note-preview'), '.note-preview');
const addButton = assertElement(layout.querySelector<HTMLButtonElement>('#addFormula'), '#addFormula');
const resetButton = assertElement(layout.querySelector<HTMLButtonElement>('#resetCurrent'), '#resetCurrent');
const editHint = assertElement(layout.querySelector<HTMLParagraphElement>('#editHint'), '#editHint');
const clearMathfieldButton = assertElement(layout.querySelector<HTMLButtonElement>('#clearMathfield'), '#clearMathfield');
const undoStepButton = assertElement(layout.querySelector<HTMLButtonElement>('#undoStep'), '#undoStep');
const redoStepButton = assertElement(layout.querySelector<HTMLButtonElement>('#redoStep'), '#redoStep');
const quickToolbar = layout.querySelector<HTMLDivElement>('.quick-toolbar');

const importJsonInput = assertElement(topBar.querySelector<HTMLInputElement>('#importJsonInput'), '#importJsonInput');
const newFormulaSetButton = assertElement(layout.querySelector<HTMLButtonElement>('#newFormulaSet'), '#newFormulaSet');
const loadJsonButton = assertElement(layout.querySelector<HTMLButtonElement>('#loadJsonButton'), '#loadJsonButton');
const toggleTemplatePanelButton = assertElement(
  layout.querySelector<HTMLButtonElement>('#toggleTemplatePanel'),
  '#toggleTemplatePanel',
);
const bindTemplateButton = assertElement(layout.querySelector<HTMLButtonElement>('#bindTemplate'), '#bindTemplate');

const exportLatexButton = assertElement(layout.querySelector<HTMLButtonElement>('#exportLatex'), '#exportLatex');
const exportJsonButton = assertElement(layout.querySelector<HTMLButtonElement>('#exportJson'), '#exportJson');
const exportMarkdownButton = assertElement(layout.querySelector<HTMLButtonElement>('#exportMarkdown'), '#exportMarkdown');
const copyJsonButton = assertElement(layout.querySelector<HTMLButtonElement>('#copyJson'), '#copyJson');
const autosaveStatus = assertElement(layout.querySelector<HTMLSpanElement>('#autosaveStatus'), '#autosaveStatus');

const formulaList = assertElement(layout.querySelector<HTMLDivElement>('.formula-list'), '.formula-list');
const formulaSearchInput = assertElement(layout.querySelector<HTMLInputElement>('#formulaSearchInput'), '#formulaSearchInput');
const clearAllButton = assertElement(layout.querySelector<HTMLButtonElement>('#clearAll'), '#clearAll');
const modeButtons = [...layout.querySelectorAll<HTMLButtonElement>('.mode-toggle button')];
const inputStack = assertElement(layout.querySelector<HTMLDivElement>('.input-stack'), '.input-stack');
const templatePopover = assertElement(layout.querySelector<HTMLDivElement>('#templatePopover'), '#templatePopover');
const templatePopoverHeader = layout.querySelector<HTMLDivElement>('.template-popover__header');
const templateTreeContainer = assertElement(layout.querySelector<HTMLDivElement>('#templateTree'), '#templateTree');
const createTemplateCategoryButton = assertElement(layout.querySelector<HTMLButtonElement>('#createTemplateCategory'), '#createTemplateCategory');
const deleteCurrentCategoryButton = assertElement(layout.querySelector<HTMLButtonElement>('#deleteCurrentCategory'), '#deleteCurrentCategory');
const templateSearchInput = assertElement(layout.querySelector<HTMLInputElement>('#templateSearchInput'), '#templateSearchInput');
const templateNameInput = assertElement(layout.querySelector<HTMLInputElement>('#templateName'), '#templateName');
const saveTemplateButton = assertElement(layout.querySelector<HTMLButtonElement>('#saveTemplate'), '#saveTemplate');
const templateListContainer = assertElement(layout.querySelector<HTMLDivElement>('#templateList'), '#templateList');
const importTemplateInput = assertElement(topBar.querySelector<HTMLInputElement>('#importTemplateInput'), '#importTemplateInput');
const templateDivider = assertElement(layout.querySelector<HTMLDivElement>('#templateDivider'), '#templateDivider');
const statusBar = assertElement(topBar.querySelector<HTMLDivElement>('.status-bar'), '.status-bar');
const lanStatusLabel = assertElement(topBar.querySelector<HTMLSpanElement>('#lanStatus'), '#lanStatus');
const themeSelect = assertElement(layout.querySelector<HTMLSelectElement>('#themeSelect'), '#themeSelect');

const TEMPLATE_PANEL_OPEN_KEY = 'mathlive.templatePanelOpen';
const TEMPLATE_PANEL_WIDTH_KEY = 'mathlive.templatePanelWidth';
const TEMPLATE_TREE_EXPANDED_KEY = 'mathlive.templateTreeExpanded';
let isTemplatePanelOpen = false;
const templateTreeExpandedIds = new Set<string>();
let hasInitializedTemplateTree = false;
let suppressTemplateAutoExpandOnce = false;

const applyTemplatePanelState = (open: boolean) => {
  isTemplatePanelOpen = open;
  layout.classList.toggle('layout--templates-closed', !open);
  templatePopover.hidden = !open;
  toggleTemplatePanelButton.textContent = open ? '关闭模板库' : '打开模板库';
  if (open) {
    const savedWidth = window.localStorage?.getItem(TEMPLATE_PANEL_WIDTH_KEY);
    if (savedWidth) {
      layout.style.setProperty('--template-width', savedWidth);
    }
  }
  window.localStorage?.setItem(TEMPLATE_PANEL_OPEN_KEY, open ? '1' : '0');
};

const restoreTemplatePanelState = () => {
  const open = window.localStorage?.getItem(TEMPLATE_PANEL_OPEN_KEY) === '1';
  applyTemplatePanelState(open);
};

const loadTemplateTreeExpandedState = () => {
  try {
    const raw = window.localStorage?.getItem(TEMPLATE_TREE_EXPANDED_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed)) {
      templateTreeExpandedIds.clear();
      parsed.forEach((id) => templateTreeExpandedIds.add(id));
    }
  } catch (error) {
    console.info('无法读取模板分类展开状态', error);
  }
};

const saveTemplateTreeExpandedState = () => {
  try {
    window.localStorage?.setItem(TEMPLATE_TREE_EXPANDED_KEY, JSON.stringify([...templateTreeExpandedIds]));
  } catch (error) {
    console.info('无法保存模板分类展开状态', error);
  }
};

const startTemplateDividerResize = (event: PointerEvent) => {
  if (!isTemplatePanelOpen) return;
  templateDivider.setPointerCapture?.(event.pointerId);
  const onMove = (moveEvent: PointerEvent) => {
    const layoutRect = layout.getBoundingClientRect();
    const maxWidth = Math.max(260, layoutRect.width * 0.6);
    const rawWidth = layoutRect.right - moveEvent.clientX;
    const nextWidth = Math.min(Math.max(rawWidth, 260), maxWidth);
    const widthValue = `${Math.round(nextWidth)}px`;
    layout.style.setProperty('--template-width', widthValue);
    window.localStorage?.setItem(TEMPLATE_PANEL_WIDTH_KEY, widthValue);
  };
  const stop = () => {
    templateDivider.removeEventListener('pointermove', onMove);
    templateDivider.removeEventListener('pointerup', stop);
    templateDivider.removeEventListener('pointercancel', stop);
  };
  templateDivider.addEventListener('pointermove', onMove);
  templateDivider.addEventListener('pointerup', stop);
  templateDivider.addEventListener('pointercancel', stop);
};

if (statusBar) {
  statusBar.hidden = !(isElectronShell || isTauriEnv);
}

// Convert LaTeX to rendered HTML with MathLive fallback
const renderMarkup = (latex: string, options?: Record<string, unknown>) => {
  if (!convertLatexToMarkup) {
    // 如果 MathLive 还未加载，返回纯文本
    return `<span style="font-family: monospace;">${latex}</span>`;
  }
  return convertLatexToMarkup(latex, options as never);
};

// 创建 MathField（延迟加载）
let mathfield: MathfieldElement;
const createMathField = async () => {
  const MathLive = await loadMathLive();
  mathfield = new MathLive.MathfieldElement();
  mathfield.smartFence = true;
  mathfield.mathVirtualKeyboardPolicy = 'manual';
  return mathfield;
};

// Configure virtual keyboard layout via global property if needed
// window.mathVirtualKeyboard.alphabeticLayout = 'qwerty'; // Example if needed

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const generateId = (prefix = 'id') => {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    console.info('随机 ID 生成失败，使用降级方案', error);
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${randomPart}`;
};

const debounce = <T extends (...args: never[]) => void>(fn: T, delay = 160) => {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
};

// Helpers ------------------------------------------------------------------

// Derive the current LaTeX string regardless of which editing mode is active
const getCurrentLatex = () => {
  if (state.mode === 'latex') {
    return latexInput.value.trim();
  }
  return mathfield.getValue('latex-expanded');
};

// Reset both MathLive + textarea inputs back to the default blank state
const resetCurrentInput = () => {
  mathfield.setValue('');
  latexInput.value = '';
  noteInput.value = '';
  updateLatexPreview();
  updateNotePreview();
};

// Optimized to minimize DOM thrashing and MathLive re-initialization
const renderFormulaList = () => {
  const searchTerm = state.formulaSearchTerm.trim().toLowerCase();

  const filteredFormulas = state.formulas.filter((item) => {
    if (!searchTerm) return true;
    const haystack = `${item.latex} ${item.note || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!filteredFormulas.length && state.formulas.length) {
    formulaList.innerHTML = '<p class="hint">没有匹配的公式。</p>';
    if (formulaVirtualList) {
      formulaVirtualList.destroy();
      formulaVirtualList = null;
      state.virtualListEnabled = false;
    }
    return;
  }

  if (!state.formulas.length) {
    formulaList.innerHTML = '';
    if (formulaVirtualList) {
      formulaVirtualList.destroy();
      formulaVirtualList = null;
      state.virtualListEnabled = false;
    }
    return;
  }

  // 决定是否使用虚拟列表
  const shouldUseVirtualList = filteredFormulas.length >= VIRTUAL_LIST_THRESHOLD;

  if (shouldUseVirtualList && !state.virtualListEnabled) {
    // 切换到虚拟列表模式
    performanceMonitor.measureRender(() => {
      formulaList.innerHTML = '';
      formulaVirtualList = createVirtualList({
        container: formulaList,
        items: filteredFormulas,
        itemHeight: 180, // 估计的公式卡片高度
        bufferSize: 5,
        renderItem: (item, existingElement) => {
          const element = existingElement || document.createElement('article');
          element.className = 'formula-card';
          element.dataset.id = item.id;
          renderFormulaCard(item, element);
          return element;
        },
      });
      state.virtualListEnabled = true;
      console.log(`[虚拟列表] 已启用，显示 ${filteredFormulas.length} 个公式`);
    }, 'Enable Virtual List');
  } else if (!shouldUseVirtualList && state.virtualListEnabled) {
    // 切换回标准渲染模式
    if (formulaVirtualList) {
      formulaVirtualList.destroy();
      formulaVirtualList = null;
      state.virtualListEnabled = false;
    }
    console.log(`[虚拟列表] 已禁用，公式数量: ${filteredFormulas.length}`);
  }

  if (state.virtualListEnabled && formulaVirtualList) {
    // 更新虚拟列表数据
    performanceMonitor.measureRender(() => {
      formulaVirtualList!.updateItems(filteredFormulas);
    }, 'Update Virtual List');
  } else {
    // 标准渲染模式（公式数量较少）
    performanceMonitor.measureRender(() => {
      renderFormulaListStandard(filteredFormulas);
    }, 'Render Formula List');
  }
};

// 标准渲染模式（非虚拟列表）- 使用对象池优化
const renderFormulaListStandard = (filteredFormulas: FormulaItem[]) => {
  // Remove the "no match" hint if it exists and we have results
  if (formulaList.querySelector('.hint')) {
    formulaList.innerHTML = '';
  }

  // Get existing cards map
  const existingCards = new Map<string, HTMLElement>();
  [...formulaList.children].forEach((card) => {
    const element = card as HTMLElement;
    if (element.dataset.id) existingCards.set(element.dataset.id, element);
  });

  // Create a fragment for new order
  const fragment = document.createDocumentFragment();

  filteredFormulas.forEach((item) => {
    let card = existingCards.get(item.id);

    if (!card) {
      // 从对象池获取卡片元素
      card = formulaCardPool.acquire();
      card.className = 'formula-card';
      card.dataset.id = item.id;
    }

    renderFormulaCard(item, card);
    fragment.appendChild(card);
    existingCards.delete(item.id); // Mark as used
  });

  // 将未使用的卡片归还到对象池
  existingCards.forEach((card) => {
    card.remove();
    formulaCardPool.release(card);
  });

  // Append sorted/filtered cards
  formulaList.appendChild(fragment);
};

// 统一的公式卡片渲染函数（用于标准模式和虚拟列表）
const renderFormulaCard = (item: FormulaItem, card: HTMLElement) => {
  const isEditing = state.editingId === item.id;
  const noteText = item.note ? item.note.trim() : '';

  // 初始化卡片DOM结构（如果还没有）
  if (!card.querySelector('.formula-card__body')) {
    card.className = 'formula-card';
    card.dataset.id = item.id;
    card.innerHTML = `
      <header>
        <span class="formula-index">公式 ${item.index}</span>
        <div class="formula-card__actions">
          <button type="button" data-copy-latex="${item.id}" title="复制 LaTeX">TeX</button>
          <button type="button" data-copy-mathml="${item.id}" title="复制 MathML 代码">MathML</button>
          <button type="button" data-edit="${item.id}">编辑</button>
          <button type="button" data-remove="${item.id}" title="删除该公式">删除</button>
        </div>
      </header>
      <div class="formula-card__body">
        <h3 class="formula-card__title" style="display: none"></h3>
        <div class="formula-card__math"></div>
      </div>
    `;
  }

  // Update existing card state
  // 1. Editing class
  if (isEditing) card.classList.add('formula-card--editing');
  else card.classList.remove('formula-card--editing');

  // 2. Index
  const indexSpan = card.querySelector<HTMLSpanElement>('.formula-index');
  if (indexSpan && indexSpan.textContent !== `公式 ${item.index}`) {
    indexSpan.textContent = `公式 ${item.index}`;
  }

  // 3. Update data attributes for actions
  const actions = card.querySelector('.formula-card__actions');
  if (actions) {
    const copyLatexBtn = actions.querySelector('[data-copy-latex]');
    const copyMathmlBtn = actions.querySelector('[data-copy-mathml]');
    const editBtn = actions.querySelector('[data-edit]');
    const removeBtn = actions.querySelector('[data-remove]');
    if (copyLatexBtn) copyLatexBtn.setAttribute('data-copy-latex', item.id);
    if (copyMathmlBtn) copyMathmlBtn.setAttribute('data-copy-mathml', item.id);
    if (editBtn) editBtn.setAttribute('data-edit', item.id);
    if (removeBtn) removeBtn.setAttribute('data-remove', item.id);
  }

  // 4. Note
  const titleEl = card.querySelector<HTMLHeadingElement>('.formula-card__title');
  if (titleEl) {
    if (noteText) {
      titleEl.style.display = '';
      const encodedNote = encodeURIComponent(noteText);
      if (titleEl.dataset.noteLatex !== encodedNote) {
        titleEl.dataset.noteLatex = encodedNote;
        try {
          titleEl.innerHTML = renderMarkup(noteText, { serialize: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : '未知错误';
          titleEl.innerHTML = `<span class="hint">说明渲染失败：${message}</span>`;
        }
      }
    } else {
      titleEl.style.display = 'none';
    }
  }

  // 5. Math Content
  const mathContainer = card.querySelector<HTMLDivElement>('.formula-card__math');
  if (mathContainer) {
    const encodedLatex = encodeURIComponent(item.latex);
    if (mathContainer.dataset.latex !== encodedLatex) {
      mathContainer.dataset.latex = encodedLatex;
      try {
        mathContainer.innerHTML = renderMarkup(item.latex, { serialize: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        mathContainer.innerHTML = `<p class="hint">公式渲染失败：${message}</p>`;
      }
    }
  }
};

const updateAutosaveStatusText = (text: string, { variant = 'normal' }: { variant?: string } = {}) => {
  if (autosaveStatus) {
    autosaveStatus.textContent = text;
    autosaveStatus.dataset.variant = variant;
  }
  console.log(`[Autosave Status] ${text} (${variant})`);
  sendToFlutter('status-update', {
    kind: 'autosave',
    text,
    variant,
    fileName: state.boundFileName || '未绑定公式集',
  });
};

// Autosave controls --------------------------------------------------------

const stopAutoSave = () => {
  if (autosaveIntervalId) {
    clearInterval(autosaveIntervalId);
    autosaveIntervalId = null;
  }
  if (autosaveDebounceId) {
    clearTimeout(autosaveDebounceId);
    autosaveDebounceId = null;
  }
};

// Drop any bound handle and revert UI messaging when autosave cannot continue
const unbindAutosaveFile = (message?: string, variant?: string) => {
  stopAutoSave();
  state.boundFileHandle = null;
  state.boundFileName = '';
  state.boundFileHandleType = 'none';
  state.boundFilePath = '';
  state.lastAutosaveAt = null;
  updateAutosaveStatusText(message || '未绑定自动保存文件', {
    variant: message ? variant ?? 'error' : 'normal',
  });
};

// Persist the in-memory formulas array into the currently bound JSON file
const saveToBoundFile = async () => {
  if (!hasBoundFile()) return;
  try {
    if (state.boundFileHandleType === 'tauri' && state.boundFilePath) {
      await tauriApi.writeJsonFile(state.boundFilePath, JSON.stringify(state.formulas, null, 2));
    } else if (state.boundFileHandleType === 'fsa' && state.boundFileHandle) {
      if (state.boundFileHandle.requestPermission) {
        const permission = await state.boundFileHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'denied') {
          throw new Error('没有写入该文件的权限');
        }
      }
      const writable = await state.boundFileHandle.createWritable();
      await writable.write(JSON.stringify(state.formulas, null, 2));
      await writable.close();
    } else if (state.boundFileHandleType === 'electron' && state.boundFilePath) {
      await window?.electronAPI?.saveJsonFile?.({
        filePath: state.boundFilePath,
        content: JSON.stringify(state.formulas, null, 2),
      });
    }
    state.lastAutosaveAt = new Date();
    updateAutosaveStatusText(
      `已自动保存到 ${getBoundFileLabel()} · ${state.lastAutosaveAt.toLocaleTimeString()}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error(error);
    unbindAutosaveFile(`自动保存失败：${message}`);
  }
};

// Debounce rapid updates so frequent edits do not spam the file system
const scheduleAutosave = () => {
  if (!hasBoundFile()) return;
  if (autosaveDebounceId) {
    clearTimeout(autosaveDebounceId);
  }
  autosaveDebounceId = window.setTimeout(() => {
    saveToBoundFile();
  }, 1200);
};

// Boot the interval-based autosave loop once we hold a valid file handle
const startAutoSave = () => {
  stopAutoSave();
  if (!hasBoundFile()) {
    updateAutosaveStatusText('未绑定自动保存文件');
    return;
  }
  updateAutosaveStatusText(`已绑定 ${getBoundFileLabel()} · 每分钟自动保存`);
  autosaveIntervalId = window.setInterval(saveToBoundFile, AUTOSAVE_INTERVAL_MS);
};

const supportsFileSystemAccess = () => {
  if (typeof window.showOpenFilePicker !== 'function') {
    return false;
  }
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return false;
  }
  const hasUserActivation = navigator?.userActivation?.isActive;
  if (typeof hasUserActivation === 'boolean' && !hasUserActivation) {
    return false;
  }
  return true;
};

const handleLoadJsonRequest = async () => {
  if (isTauriEnv) {
    const success = await importJsonViaTauri();
    if (success) {
      return;
    }
    importJsonInput.click();
    return;
  }
  if (window?.electronAPI?.chooseJsonFile) {
    const success = await importJsonViaElectron();
    if (success) {
      return;
    }
  }
  if (supportsFileSystemAccess()) {
    bindJsonFile();
  } else {
    importJsonInput.click();
  }
};

// File operations ----------------------------------------------------------

// Attempt to read formulas from a granted file handle, then immediately bind for autosave
const importFromFileHandle = async (handle: FileSystemFileHandle) => {
  const file = await handle.getFile();
  const success = await importJsonData(file, { silent: false });
  if (!success) return;
  state.boundFileHandle = handle;
  state.boundFileName = file.name || handle.name || 'formulas.json';
  state.boundFileHandleType = 'fsa';
  state.boundFilePath = '';
  startAutoSave();
  await saveToBoundFile();
};

const importJsonViaElectron = async () => {
  try {
    const result = await window?.electronAPI?.chooseJsonFile?.();
    if (!result?.content) {
      return false;
    }
    const file = new File([result.content], extractFileName(result.filePath) || 'formulas.json', {
      type: 'application/json',
    });
    const success = await importJsonData(file, { silent: true });
    if (!success) {
      return false;
    }
    state.boundFileHandle = null;
    state.boundFileHandleType = 'electron';
    state.boundFilePath = result.filePath;
    state.boundFileName = extractFileName(result.filePath) || 'formulas.json';
    startAutoSave();
    await saveToBoundFile();
    return true;
  } catch (error) {
    console.error('无法读取 Electron JSON 文件', error);
    return false;
  }
};

const importJsonViaTauri = async () => {
  try {
    const filePath = await tauriApi.openFileDialog();
    if (!filePath) return false;
    const content = await tauriApi.readJsonFile(filePath);
    const success = await importJsonText(content, { silent: true });
    if (!success) {
      return false;
    }
    state.boundFileHandle = null;
    state.boundFileHandleType = 'tauri';
    state.boundFilePath = filePath;
    state.boundFileName = extractFileName(filePath) || 'formulas.json';
    startAutoSave();
    await saveToBoundFile();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('无法读取 Tauri JSON 文件', error);
    alert(`无法读取该 JSON 文件：${message}`);
    return false;
  }
};

// Let users choose a JSON file via File System Access API and request read/write permissions
const bindJsonFile = async () => {
  if (isTauriEnv) {
    const success = await importJsonViaTauri();
    if (!success) {
      alert('无法读取该 JSON 文件');
    }
    return;
  }
  if (!supportsFileSystemAccess()) {
    alert('当前浏览器暂不支持自动保存，请使用“导入 JSON”手动加载。');
    return;
  }
  try {
    const handles = await window.showOpenFilePicker?.({
      multiple: false,
      types: [
        {
          description: 'JSON 文件',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    const [handle] = handles ?? [];
    if (!handle) return;
    if (handle.requestPermission) {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission === 'denied') {
        alert('需要对该文件的读写权限才能自动保存。');
        return;
      }
    }
    await importFromFileHandle(handle);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    if (err?.name === 'AbortError') {
      return;
    }
    if (err?.name === 'SecurityError' || err?.name === 'NotAllowedError') {
      importJsonInput.click();
      return;
    }
    alert(`绑定失败：${err?.message || '未知错误'}`);
  }
};

// Button copy changes when switching between create vs edit flows
const updateActionButtons = () => {
  if (state.editingId) {
    addButton.textContent = '💾 保存修改';
    resetButton.textContent = '取消编辑';
    editHint.hidden = false;
  } else {
    addButton.textContent = '➕ 添加到右侧';
    resetButton.textContent = '↺ 重置当前输入';
    editHint.hidden = true;
  }
};

// Hydrate inputs with the selected formula so users can tweak existing entries
const enterEditMode = (formula: FormulaItem) => {
  state.editingId = formula.id;
  mathfield.setValue(formula.latex);
  latexInput.value = formula.latex;
  noteInput.value = formula.note ?? '';
  updateLatexPreview();
  updateNotePreview();
  updateActionButtons();
  renderFormulaList();
  mathfield.focus();
};

// Leave edit mode and optionally keep current field values (useful after save)
const exitEditMode = ({ keepInputs = false, skipRender = false }: { keepInputs?: boolean; skipRender?: boolean } = {}) => {
  if (!state.editingId) return;
  state.editingId = null;
  updateActionButtons();
  if (!keepInputs) {
    resetCurrentInput();
  }
  if (!skipRender) {
    renderFormulaList();
  }
};

// Create or update a formula entry depending on whether edit mode is active
const addFormula = () => {
  const latex = getCurrentLatex();
  if (!latex) {
    alert('请输入 LaTeX 内容或使用键盘输入公式');
    return;
  }

  const note = noteInput.value.trim();
  
  // 使用字符串缓存减少重复存储
  const cachedLatex = stringCache.intern(latex);
  const cachedNote = note ? stringCache.intern(note) : '';
  
  if (state.editingId) {
    state.formulas = state.formulas.map((item) =>
      item.id === state.editingId
        ? {
            ...item,
            latex: cachedLatex,
            note: cachedNote,
          }
        : item,
    );
    updateActionButtons();
    scheduleAutosave();
    exitEditMode({ skipRender: true });
    return;
  }

  state.formulas.push({
    id: generateId('formula'),
    index: state.nextIndex,
    latex: cachedLatex,
    note: cachedNote,
  });

  state.nextIndex += 1;
  renderFormulaList();
  scheduleAutosave();
  resetCurrentInput();
};

// Remove by id and gracefully exit edit mode if the active entry disappeared
const removeFormula = (id: string) => {
  const removingCurrent = state.editingId === id;
  state.formulas = state.formulas.filter((item) => item.id !== id);
  renderFormulaList();
  scheduleAutosave();
  if (removingCurrent) {
    exitEditMode({ skipRender: true });
  }
};

// Nuke the entire list after user confirmation to prevent accidental loss
const clearAll = () => {
  if (!state.formulas.length) return;
  if (confirm('确认清空所有公式吗？')) {
    state.formulas = [];
    state.nextIndex = 1;
    exitEditMode({ skipRender: true });
    renderFormulaList();
    scheduleAutosave();
    
    // 清理内存缓存
    stringCache.clear();
    descendantCategoryIdsCache.clear();
  }
};

const startNewFormulaSet = () => {
  if (state.formulas.length) {
    const shouldProceed = confirm('将创建新的公式集，并清空当前所有内容，是否继续？');
    if (!shouldProceed) return;
  }
  state.formulas = [];
  state.nextIndex = 1;
  exitEditMode({ skipRender: true });
  resetCurrentInput();
  renderFormulaList();
  unbindAutosaveFile('已创建新的公式集（未绑定文件）', 'warning');
};

// Toggle between WYSIWYG MathLive and raw LaTeX textarea modes
const switchMode = (mode: Mode) => {
  state.mode = mode;
  inputStack.dataset.mode = mode;
  const wysiwygWrapper = mathfield.closest('.wysiwyg-wrapper') as HTMLElement | null;
  if (wysiwygWrapper) {
    wysiwygWrapper.hidden = mode !== 'wysiwyg';
  }
  latexWrapper.hidden = mode !== 'latex';
  modeButtons.forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.mode === mode ? 'true' : 'false');
  });

  if (mode === 'latex') {
    latexInput.value = mathfield.getValue('latex-expanded');
    updateLatexPreview();
  } else {
    mathfield.setValue(latexInput.value);
  }
};

// Render live LaTeX preview inside the helper panel or show a hint when empty
const updateLatexPreview = () => {
  const latex = latexInput.value.trim();
  if (!latex) {
    latexPreview.innerHTML = '<p class="hint">实时渲染预览区域</p>';
    return;
  }
  latexPreview.innerHTML = renderMarkup(latex, { serialize: false });
};

// Notes also accept LaTeX, so they share the same render-with-fallback flow
const updateNotePreview = () => {
  const note = noteInput.value.trim();
  if (!note) {
    notePreview.innerHTML = '<p class="hint">中文说明可使用 LaTeX，例如：\\text{傅里叶变换公式}</p>';
    return;
  }
  try {
    notePreview.innerHTML = renderMarkup(note, { serialize: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    notePreview.innerHTML = `<p class="hint">无法渲染：${message}</p>`;
  }
};

const debouncedLatexPreview = debounce(updateLatexPreview, 180);
const debouncedNotePreview = debounce(updateNotePreview, 180);

// Utility to trigger client-side downloads for JSON/Markdown/TeX data
const downloadFile = (filename: string, content: string | Blob, mime = 'application/json') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// Export the raw state payload so users can re-import later or share with teammates
const exportJson = async () => {
  if (!state.formulas.length) {
    alert('暂无可导出的内容');
    return;
  }
  if (isTauriEnv) {
    try {
      const path = await tauriApi.saveFileDialog();
      if (!path) return;
      await tauriApi.writeJsonFile(path, JSON.stringify(state.formulas, null, 2));
      showToast('已导出 JSON', 'success');
    } catch (error) {
      console.error('导出 JSON 失败', error);
      alert('导出 JSON 失败');
    }
    return;
  }
  downloadFile('formulas.json', JSON.stringify(state.formulas, null, 2));
};

// Wrap each formula inside an equation environment and emit a minimal TeX document
const exportLatex = async () => {
  if (!state.formulas.length) {
    alert('暂无可导出的内容');
    return;
  }

  if (isTauriEnv) {
    try {
      const documentLatex = await tauriApi.formatLatex(
        state.formulas.map((item) => ({ latex: item.latex, note: item.note })),
      );
      if (!documentLatex) return;
      const path = await tauriApi.exportLatexFile(documentLatex);
      if (!path) return;
      showToast('已导出 LaTeX', 'success');
    } catch (error) {
      console.error('导出 LaTeX 失败', error);
      alert('导出 LaTeX 失败');
    }
    return;
  }
  const escapeLatexText = (text: string) => text.replace(/[\\#%&_$^{}]/g, (match) => `\\${match}`);

  const body = state.formulas
    .map((item, idx) => {
      const noteBlock = item.note?.trim()
        ? `\\noindent\\textbf{${escapeLatexText(item.note.trim())}}\\\\\n`
        : '';
      return `${noteBlock}\\begin{equation}\\label{eq:${idx + 1}}\n${item.latex}\n\\end{equation}`;
    })
    .join('\n');

  const documentLatex = `\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{ctex}\n\\begin{document}\n${body}\n\\end{document}\n`;
  downloadFile('formulas.tex', documentLatex, 'text/x-tex');
};

// Shared guard to avoid generating files when nothing has been authored yet
const ensureFormulasAvailable = () => {
  if (!state.formulas.length) {
    alert('暂无可导出的内容');
    return false;
  }
  return true;
};

// Produce a README-friendly Markdown document with numbered sections
const exportMarkdown = async () => {
  if (!ensureFormulasAvailable()) return;
  if (isTauriEnv) {
    try {
      const markdown = await tauriApi.formatMarkdown(
        state.formulas.map((item) => ({ latex: item.latex, note: item.note })),
      );
      if (!markdown) return;
      const path = await tauriApi.exportMarkdownFile(markdown);
      if (!path) return;
      showToast('已导出 Markdown', 'success');
    } catch (error) {
      console.error('导出 Markdown 失败', error);
      alert('导出 Markdown 失败');
    }
    return;
  }
  const segments = state.formulas.map((item, idx) => {
    const parts = [`### 公式 ${idx + 1}`];
    if (item.note?.trim()) {
      parts.push(`**${item.note.trim()}**`);
    }
    parts.push('$$');
    parts.push(item.latex);
    parts.push('$$');
    return parts.join('\n\n');
  });
  const markdown = segments.join('\n\n');
  downloadFile('formulas.md', markdown, 'text/markdown');
};

const exportText = () => {
  if (!ensureFormulasAvailable()) return;
  const segments = state.formulas.map((item, idx) => {
    const parts = [`[公式 ${idx + 1}]`];
    if (item.note?.trim()) {
      parts.push(`说明: ${item.note.trim()}`);
    }
    parts.push(`LaTeX: ${item.latex}`);
    return parts.join('\n');
  });
  const textContent = segments.join('\n\n----------------------------------------\n\n');
  downloadFile('formulas.txt', textContent, 'text/plain');
};

// One-click clipboard helper for quickly sharing JSON without downloading files
const copyJsonToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.formulas, null, 2));
    showToast('JSON 已复制', 'success');
  } catch (err) {
    alert('复制失败，请手动选择 JSON 文本');
  }
};

// Parse and sanitize imported JSON, ensuring each entry has stable ids + indexes
const applyImportedFormulas = (sanitized: FormulaItem[], { silent = false }: { silent?: boolean } = {}) => {
  if (!sanitized.length && !silent) {
    alert('JSON 中没有可用的公式条目');
  }
  state.formulas = sanitized;
  const maxIndex = sanitized.reduce((max, entry) => Math.max(max, entry.index ?? 0), 0);
  state.nextIndex = maxIndex + 1 || 1;
  exitEditMode({ skipRender: true });
  renderFormulaList();
  resetCurrentInput();
  scheduleAutosave();
  return true;
};

const importJsonText = async (content: string, { silent = false }: { silent?: boolean } = {}) => {
  try {
    if (isTauriEnv) {
      const sanitized = await tauriApi.normalizeFormulas(content);
      return applyImportedFormulas(sanitized as FormulaItem[], { silent });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error('文件内容不是有效的 JSON 格式');
    }

    if (!Array.isArray(parsed)) {
      if (parsed && typeof parsed === 'object' && (parsed as { categories?: unknown }).categories) {
        throw new Error('这是模板库文件，请使用“绑定模板”功能导入');
      }
      throw new Error('文件格式错误：公式集必须是 JSON 数组');
    }

    const sanitized = parsed
      .map((item, idx) => {
        const entry = item as { latex?: string; id?: string; index?: number; note?: string } | null;
        if (!entry || typeof entry.latex !== 'string') return null;
        const latex = entry.latex.trim();
        if (!latex) return null;
        return {
          id: typeof entry.id === 'string' ? entry.id : generateId('formula'),
          index: typeof entry.index === 'number' ? entry.index : idx + 1,
          latex,
          note: typeof entry.note === 'string' ? entry.note.trim() : '',
        } as FormulaItem;
      })
      .filter(Boolean) as FormulaItem[];

    return applyImportedFormulas(sanitized, { silent });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (!silent) {
      alert(`导入失败：${message}`);
    } else {
      console.error('导入失败', error);
    }
    return false;
  }
};

const importJsonData = async (file: File, { silent = false }: { silent?: boolean } = {}) => {
  try {
    const content = await file.text();
    return await importJsonText(content, { silent });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (!silent) {
      alert(`导入失败：${message}`);
    } else {
      console.error('导入失败', error);
    }
    return false;
  }
};

// Template library helpers -------------------------------------------------

const normalizeTemplateCategories = (
  categories: unknown,
  parentId?: string,
  depth = 1,
  acc: TemplateCategory[] = [],
) => {
  if (!Array.isArray(categories) || depth > 6) return acc;
  categories.forEach((category, idx) => {
    const source = category as {
      name?: string;
      templates?: unknown;
      id?: string;
      categories?: unknown;
      children?: unknown;
      parentId?: string;
    } | null;
    const name = typeof source?.name === 'string' ? source.name.trim() : '';
    const templates = Array.isArray(source?.templates)
      ? source.templates
          .map((tpl, tplIdx) => {
            const template = tpl as { latex?: string; id?: string; name?: string; note?: string } | null;
            const latex = typeof template?.latex === 'string' ? template.latex.trim() : '';
            if (!latex) return null;
            return {
              id: typeof template?.id === 'string' && template.id ? template.id : generateId('template'),
              name:
                typeof template?.name === 'string' && template.name.trim()
                  ? template.name.trim()
                  : `模板 ${tplIdx + 1}`,
              latex,
              note: typeof template?.note === 'string' ? template.note.trim() : '',
            } as TemplateItem;
          })
          .filter(Boolean)
      : [];
    const id = typeof source?.id === 'string' && source.id ? source.id : generateId('category');
    const safeName = name || `分类 ${idx + 1}`;
    acc.push({
      id,
      name: safeName,
      templates,
      parentId: source?.parentId || parentId,
    } as TemplateCategory);
    const childCategories = Array.isArray(source?.categories)
      ? source?.categories
      : Array.isArray(source?.children)
        ? source?.children
        : null;
    if (childCategories) {
      normalizeTemplateCategories(childCategories, id, depth + 1, acc);
    }
  });
  return acc;
};

const saveTemplateLibraryToLocalStorage = () => {
  try {
    window.localStorage?.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(state.templateLibrary));
  } catch (error) {
    console.info('无法写入模板库缓存', error);
  }
};

const loadTemplateLibraryFromLocalStorage = () => {
  try {
    const cached = window.localStorage?.getItem(TEMPLATE_STORAGE_KEY);
    if (!cached) return;
    const parsed = JSON.parse(cached) as TemplateLibrary;
    const categories = normalizeTemplateCategories(parsed?.categories ?? []);
    state.templateLibrary.categories = categories;
    const desiredId = parsed?.selectedCategoryId;
    const selectedExists = categories.find((cat) => cat.id === desiredId)?.id;
    state.templateLibrary.selectedCategoryId = selectedExists || ALL_CATEGORY_ID;
    resetTemplateSearchTerm();
  } catch (error) {
    console.info('无法读取模板库缓存', error);
  }
};

const focusTemplateSearchSoon = () => {
  if (!templateSearchInput) return;
  requestAnimationFrame(() => {
    templateSearchInput.focus();
    templateSearchInput.select();
  });
};
const focusTemplatePanel = () => {
  if (!templatePopover) return;
  templatePopover.hidden = false;
  templatePopover.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  focusTemplateSearchSoon();
};

const toggleTemplatePopover = () => {
  focusTemplatePanel();
};

const setTemplateStatusText = (text: string, { variant = 'normal' }: { variant?: string } = {}) => {
  console.log(`[Template Status] ${text} (${variant})`);
  sendToFlutter('status-update', {
    kind: 'template',
    text,
    variant,
    fileName: state.templateFileName || '未绑定模板库',
  });
};

const resetTemplateSearchTerm = () => {
  state.templateSearchTerm = '';
  if (templateSearchInput) {
    templateSearchInput.value = '';
  }
};

const stopTemplateAutosave = () => {
  if (templateAutosaveIntervalId) {
    clearInterval(templateAutosaveIntervalId);
    templateAutosaveIntervalId = null;
  }
};

const unbindTemplateFile = (message?: string, variant?: string) => {
  stopTemplateAutosave();
  state.templateFileHandle = null;
  state.templateFileName = '';
  state.templateFilePath = '';
  setTemplateStatusText(message || '未绑定模板文件', {
    variant: message ? variant ?? 'warning' : 'normal',
  });
};

const startTemplateAutosave = () => {
  stopTemplateAutosave();
  if (!state.templateFileHandle && !state.templateFilePath) {
    setTemplateStatusText('未绑定模板文件');
    return;
  }
  setTemplateStatusText(`已绑定 ${state.templateFileName || 'template-library.json'} · 每分钟同步`);
  templateAutosaveIntervalId = window.setInterval(
    saveTemplatesToBoundFile,
    TEMPLATE_AUTOSAVE_INTERVAL_MS,
  );
};

const getTemplateChildren = (parentId?: string) =>
  state.templateLibrary.categories.filter((cat) => (cat.parentId || '') === (parentId || ''));

// 优化：减少数组创建，使用缓存
const getAllTemplates = (() => {
  let cache: Array<{template: TemplateItem, category: TemplateCategory}> | null = null;
  let lastCategoriesLength = 0;
  
  return () => {
    // 简单的缓存失效策略：检查分类数量是否变化
    if (cache && lastCategoriesLength === state.templateLibrary.categories.length) {
      return cache;
    }
    
    const result: Array<{template: TemplateItem, category: TemplateCategory}> = [];
    for (const category of state.templateLibrary.categories) {
      for (const template of category.templates) {
        result.push({ template, category });
      }
    }
    
    cache = result;
    lastCategoriesLength = state.templateLibrary.categories.length;
    return result;
  };
})();

const getTemplateCategoryDepth = (categoryId?: string) => {
  if (!categoryId) return 0;
  let depth = 1;
  let current = state.templateLibrary.categories.find((cat) => cat.id === categoryId) || null;
  while (current?.parentId) {
    depth += 1;
    current = state.templateLibrary.categories.find((cat) => cat.id === current?.parentId) || null;
    if (depth > 6) break;
  }
  return depth;
};

// 优化：使用 Map 缓存后代 ID，避免重复计算
const descendantCategoryIdsCache = new Map<string, string[]>();

const clearDescendantCache = () => descendantCategoryIdsCache.clear();

const getDescendantCategoryIds = (categoryId: string): string[] => {
  if (descendantCategoryIdsCache.has(categoryId)) {
    return descendantCategoryIdsCache.get(categoryId)!;
  }
  
  const result: string[] = [categoryId];
  const children = getTemplateChildren(categoryId);
  
  for (const child of children) {
    result.push(...getDescendantCategoryIds(child.id));
  }
  
  descendantCategoryIdsCache.set(categoryId, result);
  return result;
};

const getCategoryTemplateCount = (categoryId: string) => {
  const ids = new Set(getDescendantCategoryIds(categoryId));
  return state.templateLibrary.categories.reduce((total, category) => {
    if (ids.has(category.id)) {
      return total + category.templates.length;
    }
    return total;
  }, 0);
};

const initializeTemplateTreeExpandedState = () => {
  if (hasInitializedTemplateTree) return;
  hasInitializedTemplateTree = true;
  if (templateTreeExpandedIds.size > 0) return;
  templateTreeExpandedIds.add(ALL_CATEGORY_ID);
  const roots = getTemplateChildren(undefined);
  roots.forEach((category) => {
    if (getTemplateChildren(category.id).length > 0) {
      templateTreeExpandedIds.add(category.id);
    }
  });
};

const ensureTemplateTreeExpandedForSelection = (selectedId: string) => {
  if (!selectedId || selectedId === ALL_CATEGORY_ID) return;
  templateTreeExpandedIds.add(ALL_CATEGORY_ID);
  let current = state.templateLibrary.categories.find((cat) => cat.id === selectedId) || null;
  while (current?.parentId) {
    templateTreeExpandedIds.add(current.parentId);
    current = state.templateLibrary.categories.find((cat) => cat.id === current?.parentId) || null;
  }
};

const renderTemplateCategoryOptions = () => {
  if (!templateTreeContainer) return;
  templateTreeContainer.innerHTML = '';
  const { categories } = state.templateLibrary;
  if (!categories.length) {
    state.templateLibrary.selectedCategoryId = '';
  }

  initializeTemplateTreeExpandedState();

  const selectedId = state.templateLibrary.selectedCategoryId || ALL_CATEGORY_ID;
  if (!state.templateLibrary.selectedCategoryId) {
    state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
  }

  if (!suppressTemplateAutoExpandOnce) {
    ensureTemplateTreeExpandedForSelection(selectedId);
  }

  const createTreeItem = (id: string, name: string, count?: number, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'template-tree__item';
    item.dataset.templateCategory = id;
    if (disabled) {
      item.disabled = true;
    }
    const badge = typeof count === 'number' ? ` (${count})` : '';
    item.textContent = `${name}${badge}`;
    if (id === selectedId) {
      item.classList.add('is-active');
    }
    return item;
  };

  const createToggleButton = (categoryId: string, hasChildren: boolean, expanded: boolean) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template-tree__toggle';
    button.dataset.templateToggle = categoryId;
    if (!hasChildren) {
      button.disabled = true;
      button.textContent = '';
      button.setAttribute('aria-hidden', 'true');
    } else {
      button.textContent = expanded ? '▾' : '▸';
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.setAttribute('aria-label', expanded ? '折叠分类' : '展开分类');
    }
    return button;
  };

  const createTreeRow = (depth: number) => {
    const row = document.createElement('div');
    row.className = 'template-tree__row';
    row.style.setProperty('--template-tree-depth', `${Math.min(depth, 6)}`);
    return row;
  };

  const allCount = getAllTemplates().length;
  const allRow = createTreeRow(0);
  const allHasChildren = categories.length > 0;
  const allExpanded = templateTreeExpandedIds.has(ALL_CATEGORY_ID);
  allRow.appendChild(createToggleButton(ALL_CATEGORY_ID, allHasChildren, allExpanded));
  const allButton = createTreeItem(ALL_CATEGORY_ID, 'All', allCount);
  allRow.appendChild(allButton);
  if (ALL_CATEGORY_ID === selectedId) {
    allRow.classList.add('is-active');
  }
  templateTreeContainer.appendChild(allRow);

  const renderTreeLevel = (parentId?: string, depth = 0) => {
    const children = getTemplateChildren(parentId);
    children.forEach((category) => {
      const nextDepth = depth + 1;
      const row = createTreeRow(nextDepth);
      const hasChildren = getTemplateChildren(category.id).length > 0;
      const expanded = templateTreeExpandedIds.has(category.id);
      const toggleButton = createToggleButton(category.id, hasChildren, expanded);
      const button = createTreeItem(category.id, category.name, getCategoryTemplateCount(category.id));
      row.appendChild(toggleButton);
      row.appendChild(button);
      if (category.id === selectedId) {
        row.classList.add('is-active');
      }
      templateTreeContainer.appendChild(row);
      if (hasChildren && expanded) {
        renderTreeLevel(category.id, nextDepth);
      }
    });
  };

  if (allExpanded) {
    renderTreeLevel(undefined, 0);
  }

  suppressTemplateAutoExpandOnce = false;
};

const renderTemplateList = () => {
  if (!templateListContainer) return;
  const hasCategories = state.templateLibrary.categories.length > 0;
  templateListContainer.innerHTML = '';
  if (!hasCategories) {
    templateListContainer.innerHTML = '<p class="hint">模板库为空，请先新建分类。</p>';
    return;
  }

  const activeCategoryId = state.templateLibrary.selectedCategoryId || ALL_CATEGORY_ID;

  const search = (state.templateSearchTerm || '').trim().toLowerCase();
  const matchesSearch = (template: TemplateItem) => {
    if (!search) return true;
    const haystack = `${template.name} ${template.note || ''} ${template.latex}`.toLowerCase();
    return haystack.includes(search);
  };

  const templatesWithCategory =
    activeCategoryId === ALL_CATEGORY_ID
      ? getAllTemplates()
      : getSelectedTemplateCategory()
        ? getSelectedTemplateCategory()!.templates.map((template) => ({
            template,
            category: getSelectedTemplateCategory()!,
          }))
        : [];

  if (!templatesWithCategory.length) {
    templateListContainer.innerHTML = search
      ? '<p class="hint">没有匹配的模板，尝试调整关键词。</p>'
      : '<p class="hint">该分类暂无模板，使用上方按钮保存。</p>';
    return;
  }

  const filteredTemplates = templatesWithCategory.filter(({ template, category }) => {
    if (!search) return true;
    const haystack = `${template.name} ${template.note || ''} ${template.latex} ${category.name}`.toLowerCase();
    return haystack.includes(search);
  });

  if (!filteredTemplates.length) {
    templateListContainer.innerHTML = '<p class="hint">没有匹配的模板，尝试调整关键词。</p>';
    return;
  }

  filteredTemplates.forEach(({ template, category }) => {
    const item = document.createElement('article');
    item.className = 'template-menu-item';
    item.innerHTML = `
      <button type="button" class="template-menu-item__main" data-template-insert="${template.id}" data-template-category="${category.id}">
        <span class="template-menu-item__title">${template.name}</span>
        <span class="template-menu-item__category">${category.name}</span>
        <span class="template-menu-item__note">${template.note ? template.note : '无说明'}</span>
        <div class="template-menu-item__math" data-template-latex="${encodeURIComponent(template.latex)}"></div>
      </button>
      <button type="button" class="template-menu-item__delete" title="删除该模板" data-template-remove="${template.id}" data-template-category="${category.id}">✕</button>
    `;
    templateListContainer.appendChild(item);
  });

  [...templateListContainer.querySelectorAll<HTMLDivElement>('[data-template-latex]')].forEach((node) => {
    const latex = decodeURIComponent(node.dataset.templateLatex || '');
    try {
      node.innerHTML = renderMarkup(latex, { serialize: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      node.innerHTML = `<p class="hint">模板渲染失败：${message}</p>`;
    }
  });
};

const getSelectedTemplateCategory = () =>
  state.templateLibrary.selectedCategoryId === ALL_CATEGORY_ID
    ? null
    : state.templateLibrary.categories.find((cat) => cat.id === state.templateLibrary.selectedCategoryId) || null;

const selectTemplateCategory = (categoryId: string) => {
  state.templateLibrary.selectedCategoryId = categoryId || ALL_CATEGORY_ID;
  saveTemplateLibraryToLocalStorage();
};

const handleCreateTemplateCategory = () => {
  const name = prompt('请输入新的模板分类名称：');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const exists = state.templateLibrary.categories.some((cat) => cat.name === trimmed);
  if (exists && !confirm('已有同名分类，仍然创建吗？')) {
    return;
  }
  const parentId = state.templateLibrary.selectedCategoryId && state.templateLibrary.selectedCategoryId !== ALL_CATEGORY_ID
    ? state.templateLibrary.selectedCategoryId
    : undefined;
  const parentDepth = getTemplateCategoryDepth(parentId);
  if (parentDepth >= 6) {
    alert('已达到最大分类层级（6级）');
    return;
  }
  const newCategory = {
    id: generateId('category'),
    name: trimmed,
    templates: [],
    parentId,
  } as TemplateCategory;
  state.templateLibrary.categories.push(newCategory);
  selectTemplateCategory(newCategory.id);
  renderTemplateCategoryOptions();
  renderTemplateList();
  persistTemplateLibrary();
};

const persistTemplateLibrary = async ({ skipBoundWrite = false }: { skipBoundWrite?: boolean } = {}) => {
  saveTemplateLibraryToLocalStorage();
  if (state.templateFileHandle || state.templateFilePath) {
    startTemplateAutosave();
  }
  if (!skipBoundWrite) {
    await saveTemplatesToBoundFile();
  }
};

const saveTemplatesToBoundFile = async () => {
  if (!state.templateFileHandle && !state.templateFilePath) return;
  try {
    if (state.templateFilePath && isTauriEnv) {
      await tauriApi.writeJsonFile(
        state.templateFilePath,
        JSON.stringify({ categories: state.templateLibrary.categories }, null, 2),
      );
    } else if (state.templateFileHandle) {
      if (state.templateFileHandle.requestPermission) {
        const permission = await state.templateFileHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'denied') {
          throw new Error('没有写入模板文件的权限');
        }
      }
      const writable = await state.templateFileHandle.createWritable();
      await writable.write(JSON.stringify({ categories: state.templateLibrary.categories }, null, 2));
      await writable.close();
    }
    setTemplateStatusText(`已写入 ${state.templateFileName || 'template-library.json'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error(error);
    unbindTemplateFile(`写入模板失败：${message}`, 'error');
  }
};

const saveTemplateEntry = async () => {
  const category = getSelectedTemplateCategory();
  if (!category) {
    alert('请先选择一个模板分类（All 不可保存）');
    return;
  }
  const templateName = templateNameInput.value.trim();
  if (!templateName) {
    alert('请为模板输入一个名称');
    return;
  }
  const latex = getCurrentLatex();
  if (!latex) {
    alert('当前没有可保存的公式内容');
    return;
  }
  const note = noteInput.value.trim();
  const exists = category.templates.find((tpl) => tpl.name === templateName);
  if (exists && !confirm('已有同名模板，是否覆盖？')) {
    return;
  }
  const templatePayload: TemplateItem = {
    id: exists ? exists.id : generateId('template'),
    name: templateName,
    latex,
    note,
  };
  if (exists) {
    category.templates = category.templates.map((tpl) => (tpl.id === exists.id ? templatePayload : tpl));
  } else {
    category.templates.push(templatePayload);
  }
  templateNameInput.value = '';
  renderTemplateCategoryOptions();
  renderTemplateList();
  await persistTemplateLibrary();
  setTemplateStatusText('模板已保存到当前库');
};

const applyTemplateToEditor = (template: TemplateItem) => {
  mathfield.setValue(template.latex);
  latexInput.value = template.latex;
  noteInput.value = template.note || '';
  updateLatexPreview();
  updateNotePreview();
  switchMode(state.mode);
  mathfield.focus();
};

const removeTemplateEntry = async (categoryId: string, templateId: string) => {
  const category = state.templateLibrary.categories.find((cat) => cat.id === categoryId);
  if (!category) return;
  const target = category.templates.find((tpl) => tpl.id === templateId);
  if (!target) return;
  if (!confirm(`确认删除模板「${target.name}」吗？`)) {
    return;
  }
  category.templates = category.templates.filter((tpl) => tpl.id !== templateId);
  
  // 清理缓存
  descendantCategoryIdsCache.clear();
  
  renderTemplateCategoryOptions();
  renderTemplateList();
  await persistTemplateLibrary();
};

const removeTemplateCategory = async (categoryId: string) => {
  if (categoryId === ALL_CATEGORY_ID) {
    alert('All 分类不可删除');
    return;
  }
  const category = state.templateLibrary.categories.find((cat) => cat.id === categoryId);
  if (!category) return;
  if (!confirm(`删除分类「${category.name}」及其全部模板？`)) {
    return;
  }
  const idsToRemove = new Set(getDescendantCategoryIds(categoryId));
  state.templateLibrary.categories = state.templateLibrary.categories.filter((cat) => !idsToRemove.has(cat.id));
  if (idsToRemove.has(state.templateLibrary.selectedCategoryId)) {
    state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
  }
  
  // 清理缓存
  descendantCategoryIdsCache.clear();
  
  renderTemplateCategoryOptions();
  renderTemplateList();
  await persistTemplateLibrary();
};

const importTemplateText = async (content: string, { silent = false }: { silent?: boolean } = {}) => {
  try {
    if (isTauriEnv) {
      const library = await tauriApi.normalizeTemplates(content);
      state.templateLibrary.categories = library.categories as TemplateCategory[];
      state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
    } else {
      const parsed = JSON.parse(content) as { categories?: unknown } | unknown[];
      const categories = Array.isArray((parsed as { categories?: unknown }).categories)
        ? (parsed as { categories?: unknown }).categories
        : parsed;
      const normalized = normalizeTemplateCategories(categories);
      state.templateLibrary.categories = normalized;
      state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
    }
    resetTemplateSearchTerm();
    renderTemplateCategoryOptions();
    renderTemplateList();
    if (state.templateLibrary.categories.length) {
      setTemplateStatusText(`已加载 ${state.templateLibrary.categories.length} 个模板分类`);
    } else {
      setTemplateStatusText('模板文件为空', { variant: 'warning' });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (!silent) {
      alert(`导入模板失败：${message}`);
    } else {
      console.error('导入模板失败', error);
    }
    return false;
  }
};

const importTemplateData = async (file: File, { silent = false }: { silent?: boolean } = {}) => {
  try {
    const content = await file.text();
    return await importTemplateText(content, { silent });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (!silent) {
      alert(`导入模板失败：${message}`);
    } else {
      console.error('导入模板失败', error);
    }
    return false;
  }
};

const loadSampleTemplateLibrary = async () => {
  try {
    const categories = normalizeTemplateCategories(sampleTemplateLibrary?.categories ?? []);
    if (!categories.length) {
      alert('示例模板文件为空或格式不正确');
      return;
    }
    state.templateLibrary.categories = categories;
    state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
    resetTemplateSearchTerm();
    renderTemplateCategoryOptions();
    renderTemplateList();
    await persistTemplateLibrary({ skipBoundWrite: true });
    unbindTemplateFile('已加载示例模板（未绑定文件）', 'warning');
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    alert(`无法加载示例模板：${message}`);
  }
};

const handleTemplateFileHandle = async (handle: FileSystemFileHandle) => {
  if (!handle) return;
  if (handle.requestPermission) {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'denied') {
      alert('需要读写权限才能绑定模板文件');
      return;
    }
  }
  const file = await handle.getFile();
  const success = await importTemplateData(file, { silent: true });
  if (!success) {
    alert('无法读取该模板文件');
    return;
  }
  state.templateFileHandle = handle;
  state.templateFilePath = '';
  state.templateFileName = file.name || handle.name || 'template-library.json';
  await persistTemplateLibrary({ skipBoundWrite: true });
  await saveTemplatesToBoundFile();
  startTemplateAutosave();
  setTemplateStatusText(`已绑定 ${state.templateFileName} · 每分钟同步`);
};

const importTemplateViaTauri = async () => {
  try {
    const filePath = await tauriApi.openFileDialog();
    if (!filePath) return false;
    const content = await tauriApi.readJsonFile(filePath);
    const success = await importTemplateText(content, { silent: true });
    if (!success) {
      alert('无法读取该模板文件');
      return false;
    }
    state.templateFileHandle = null;
    state.templateFilePath = filePath;
    state.templateFileName = extractFileName(filePath) || 'template-library.json';
    await persistTemplateLibrary({ skipBoundWrite: true });
    await saveTemplatesToBoundFile();
    startTemplateAutosave();
    setTemplateStatusText(`已绑定 ${state.templateFileName} · 每分钟同步`);
    return true;
  } catch (error) {
    console.error('无法读取 Tauri 模板文件', error);
    alert('选择模板文件失败');
    return false;
  }
};

const chooseTemplateLibraryFile = async () => {
  if (isTauriEnv) {
    const success = await importTemplateViaTauri();
    if (!success) {
      importTemplateInput.click();
    }
    return;
  }
  if (!supportsFileSystemAccess()) {
    importTemplateInput.click();
    return;
  }
  try {
    const handles = await window.showOpenFilePicker?.({
      multiple: false,
      types: [
        {
          description: '模板 JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    const [handle] = handles ?? [];
    await handleTemplateFileHandle(handle);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    if (err?.name !== 'AbortError') {
      alert(`选择模板文件失败：${err?.message || '未知错误'}`);
    }
  }
};

const exportTemplateLibrary = async () => {
  if (!state.templateLibrary.categories.length) {
    alert('模板库为空，暂无法导出');
    return;
  }
  if (isTauriEnv) {
    try {
      const path = await tauriApi.saveFileDialog();
      if (!path) return;
      await tauriApi.writeJsonFile(
        path,
        JSON.stringify(
          {
            categories: state.templateLibrary.categories,
          },
          null,
          2,
        ),
      );
      showToast('已导出模板库', 'success');
    } catch (error) {
      console.error('导出模板库失败', error);
      alert('导出模板库失败');
    }
    return;
  }
  downloadFile(
    'template-library.json',
    JSON.stringify(
      {
        categories: state.templateLibrary.categories,
      },
      null,
      2,
    ),
  );
};

// Event bindings -----------------------------------------------------------
createTemplateCategoryButton.addEventListener('click', handleCreateTemplateCategory);
deleteCurrentCategoryButton.addEventListener('click', () => {
  if (!state.templateLibrary.selectedCategoryId) {
    alert('当前没有可删除的分类');
    return;
  }
  removeTemplateCategory(state.templateLibrary.selectedCategoryId);
});
templateSearchInput.addEventListener('input', (event) => {
  state.templateSearchTerm = (event.target as HTMLInputElement).value;
  renderTemplateList();
});
templateTreeContainer.addEventListener('click', (event) => {
  const toggleTarget = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.template-tree__toggle');
  if (toggleTarget?.dataset.templateToggle) {
    const id = toggleTarget.dataset.templateToggle;
    if (templateTreeExpandedIds.has(id)) {
      if (id === ALL_CATEGORY_ID) {
        if (state.templateLibrary.selectedCategoryId && state.templateLibrary.selectedCategoryId !== ALL_CATEGORY_ID) {
          state.templateLibrary.selectedCategoryId = ALL_CATEGORY_ID;
        }
        templateTreeExpandedIds.clear();
      } else {
        const descendants = getDescendantCategoryIds(id);
        if (descendants.includes(state.templateLibrary.selectedCategoryId)) {
          state.templateLibrary.selectedCategoryId = id;
        }
        descendants.forEach((descendantId) => templateTreeExpandedIds.delete(descendantId));
      }
    } else {
      templateTreeExpandedIds.add(id);
    }
    suppressTemplateAutoExpandOnce = true;
    saveTemplateTreeExpandedState();
    renderTemplateCategoryOptions();
    return;
  }

  const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.template-tree__item');
  if (!target?.dataset.templateCategory) return;
  selectTemplateCategory(target.dataset.templateCategory);
  renderTemplateCategoryOptions();
  renderTemplateList();
});
saveTemplateButton.addEventListener('click', () => {
  saveTemplateEntry();
});
templateListContainer.addEventListener('click', (event) => {
  const insertBtn = (event.target as HTMLElement | null)?.closest('[data-template-insert]') as HTMLElement | null;
  if (insertBtn) {
    const categoryId = insertBtn.dataset.templateCategory;
    const category = state.templateLibrary.categories.find((cat) => cat.id === categoryId);
    const template = category?.templates.find((tpl) => tpl.id === insertBtn.dataset.templateInsert);
    if (template) {
      applyTemplateToEditor(template);
    }
    return;
  }

  const removeTemplateBtn = (event.target as HTMLElement | null)?.closest('[data-template-remove]') as HTMLElement | null;
  if (removeTemplateBtn) {
    removeTemplateEntry(
      removeTemplateBtn.dataset.templateCategory || '',
      removeTemplateBtn.dataset.templateRemove || '',
    );
  }
});

importTemplateInput.addEventListener('change', async (event) => {
  const [file] = (event.target as HTMLInputElement).files || [];
  if (file) {
    const success = await importTemplateData(file);
    if (success) {
      await persistTemplateLibrary();
      unbindTemplateFile('已导入模板（未绑定文件）', 'warning');
    }
  }
  (event.target as HTMLInputElement).value = '';
});

const exportTemplateJsonButton = assertElement(
  layout.querySelector<HTMLButtonElement>('#exportTemplateJson'),
  '#exportTemplateJson',
);

const menuActionHandlers: Record<string, () => void> = {
  newFormulaSet: startNewFormulaSet,
  loadJson: handleLoadJsonRequest,
  exportJson,
  copyJson: copyJsonToClipboard,
  exportLatex,
  exportMarkdown,
  toggleTemplatePopover,
  bindTemplateFile: chooseTemplateLibraryFile,
  loadSampleTemplates: loadSampleTemplateLibrary,
  exportTemplateLibrary,
  setThemeLight: () => setTheme('light'),
  setThemeDark: () => setTheme('dark'),
  toggleTheme: () => {
    const themes: Theme[] = ['light', 'dark', 'blue', 'pink', 'green', 'purple', 'paper', 'sunset'];
    const currentIndex = themes.indexOf(state.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  },
};

// Listen for Flutter events (Native)
window.addEventListener('flutter-menu-action', (event) => {
  const action = (event as CustomEvent<string>).detail;
  const handler = menuActionHandlers[action];
  if (handler) handler();
});

// Listen for Flutter events (Web)
window.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data?.type === 'event' && data?.name === 'flutter-menu-action') {
      const action = data.payload;
      const handler = menuActionHandlers[action];
      if (handler) handler();
    }
  } catch (e) {
    // ignore
  }
});

const registerElectronMenuBridge = () => {
  const api = window?.electronAPI;

  if (!api?.onMenuAction) {
    if (lanStatusLabel) {
      lanStatusLabel.textContent = '';
    }
    if (isTauriEnv && statusBar) {
      statusBar.hidden = false;
    }
    return;
  }
  document.body.classList.add('desktop-shell');
  if (statusBar) {
    statusBar.hidden = false;
  }
  if (lanStatusLabel) {
    lanStatusLabel.textContent = '网络伺服未启动';
  }
  // Electron API只支持light/dark
  if (state.theme === 'light' || state.theme === 'dark') {
    window?.electronAPI?.setThemePreference?.(state.theme);
  }

  api.onMenuAction((_, action) => {
    const handler = menuActionHandlers[action];
    if (handler) {
      handler();
    }
  });

  api.onNetworkStatus((_, payload) => {
    if (!lanStatusLabel) return;
    if (payload?.running && Array.isArray(payload.addresses) && payload.addresses.length) {
      if (typeof lanStatusLabel.replaceChildren === 'function') {
        lanStatusLabel.replaceChildren();
      } else {
        lanStatusLabel.innerHTML = '';
      }
      lanStatusLabel.append('网络伺服运行中：');
      payload.addresses.forEach((url: string, idx: number) => {
        if (idx > 0) {
          lanStatusLabel.append(' ');
        }
        const urlSpan = document.createElement('span');
        urlSpan.className = 'lan-link';
        urlSpan.textContent = url;
        lanStatusLabel.append(urlSpan);
      });
      return;
    }
    lanStatusLabel.textContent = '网络伺服未启动';
  });
};

addButton.addEventListener('click', addFormula);
resetButton.addEventListener('click', () => {
  if (state.editingId) {
    exitEditMode();
  } else {
    resetCurrentInput();
  }
});
undoStepButton.addEventListener('click', () => mathfield.executeCommand('undo'));
redoStepButton.addEventListener('click', () => mathfield.executeCommand('redo'));
clearMathfieldButton.addEventListener('click', () => mathfield.setValue(''));

importJsonInput.addEventListener('change', async (event) => {
  const [file] = (event.target as HTMLInputElement).files || [];
  if (file) {
    const success = await importJsonData(file);
    if (success) {
      state.boundFileName = file.name;
      if (!supportsFileSystemAccess()) {
        updateAutosaveStatusText(`已加载 ${file.name} (只读)`, { variant: 'warning' });
      }
    }
  }
  (event.target as HTMLInputElement).value = '';
});

exportLatexButton.addEventListener('click', exportLatex);
exportJsonButton.addEventListener('click', exportJson);
exportMarkdownButton.addEventListener('click', exportMarkdown);
copyJsonButton.addEventListener('click', copyJsonToClipboard);
exportTemplateJsonButton.addEventListener('click', exportTemplateLibrary);

newFormulaSetButton.addEventListener('click', startNewFormulaSet);
loadJsonButton.addEventListener('click', handleLoadJsonRequest);
bindTemplateButton.addEventListener('click', chooseTemplateLibraryFile);

clearAllButton.addEventListener('click', clearAll);
latexInput.addEventListener('input', debouncedLatexPreview);
noteInput.addEventListener('input', debouncedNotePreview);
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchMode((btn.dataset.mode || 'wysiwyg') as Mode));
});

// 主题选择器事件监听器
themeSelect.addEventListener('change', (event) => {
  const theme = (event.target as HTMLSelectElement).value as Theme;
  setTheme(theme);
});
// 初始化主题选择器的值
themeSelect.value = state.theme;

// 模板列开关与宽度恢复
restoreTemplatePanelState();
toggleTemplatePanelButton.addEventListener('click', () => {
  applyTemplatePanelState(!isTemplatePanelOpen);
});
templateDivider.addEventListener('pointerdown', startTemplateDividerResize);

formulaList.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement | null;
  const removeTarget = target?.closest('[data-remove]') as HTMLElement | null;
  if (removeTarget?.dataset.remove) {
    removeFormula(removeTarget.dataset.remove);
    return;
  }

  const editTarget = target?.closest('[data-edit]') as HTMLElement | null;
  if (editTarget?.dataset.edit) {
    const formula = state.formulas.find((item) => item.id === editTarget.dataset.edit);
    if (formula) {
      enterEditMode(formula);
    }
    return;
  }

  const copyLatexTarget = target?.closest('[data-copy-latex]') as HTMLElement | null;
  if (copyLatexTarget?.dataset.copyLatex) {
    const formula = state.formulas.find((item) => item.id === copyLatexTarget.dataset.copyLatex);
    if (formula) {
      try {
        await navigator.clipboard.writeText(formula.latex);
        showToast('LaTeX 已复制', 'success');
      } catch (err) {
        showToast('复制失败', 'error');
      }
    }
    return;
  }

  const copyMathMLTarget = target?.closest('[data-copy-mathml]') as HTMLElement | null;
  if (copyMathMLTarget?.dataset.copyMathML) {
    const formula = state.formulas.find((item) => item.id === copyMathMLTarget.dataset.copyMathML);
    if (formula) {
      try {
        const mathML = renderMarkup(formula.latex, { format: 'mathml' });
        await navigator.clipboard.writeText(mathML);
        showToast('MathML 代码已复制', 'success');
      } catch (err) {
        showToast('复制失败', 'error');
      }
    }
    return;
  }

  const card = target?.closest('.formula-card') as HTMLElement | null;
  if (card && !target?.closest('.formula-card__actions')) {
    const formula = state.formulas.find((item) => item.id === card.dataset.id);
    if (formula) {
      enterEditMode(formula);
    }
  }
});

formulaSearchInput.addEventListener('input', (event) => {
  state.formulaSearchTerm = (event.target as HTMLInputElement).value;
  renderFormulaList();
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    // If focus is in mathfield or latexInput or noteInput, add formula
    const active = document.activeElement as HTMLElement | null;
    if (active === mathfield || active === latexInput || active === noteInput || active?.closest('math-field')) {
      addFormula();
    }
  }
});

registerElectronMenuBridge();

loadTemplateLibraryFromLocalStorage();
loadTemplateTreeExpandedState();
renderTemplateCategoryOptions();
renderTemplateList();
if (state.templateLibrary.categories.length) {
  setTemplateStatusText('已加载浏览器缓存模板（未绑定文件）', { variant: 'warning' });
} else {
  setTemplateStatusText('未加载模板库');
}

updateLatexPreview();
updateNotePreview();
switchMode('wysiwyg');
updateActionButtons();
renderFormulaList();
updateAutosaveStatusText('未绑定自动保存文件');

// 初始化自动补全
const autoCompleter = new AutoCompleter();
autoCompleter.attach(latexInput);

// 初始化性能监控（开发模式下显示）
if (typeof window !== 'undefined') {
  document.body.appendChild(performanceMonitor.createOverlay());
  console.log('[Performance Monitor] Enabled');
}

// 初始化内存监控
const memoryToggle = layout.querySelector<HTMLDivElement>('#memoryToggle');
const memoryPanel = layout.querySelector<HTMLDivElement>('#memoryPanel');
const memoryUsedEl = layout.querySelector<HTMLElement>('#memoryUsed');
const memoryTotalEl = layout.querySelector<HTMLElement>('#memoryTotal');
const memoryPercentEl = layout.querySelector<HTMLElement>('#memoryPercent');
const stringCacheSizeEl = layout.querySelector<HTMLElement>('#stringCacheSize');
const clearCachesBtn = layout.querySelector<HTMLButtonElement>('#clearCachesBtn');

if (memoryToggle && memoryPanel) {
  memoryToggle.addEventListener('click', () => {
    const isHidden = memoryPanel.hasAttribute('hidden');
    if (isHidden) {
      memoryPanel.removeAttribute('hidden');
      updateMemoryStats();
    } else {
      memoryPanel.setAttribute('hidden', '');
    }
  });
}

if (clearCachesBtn) {
  clearCachesBtn.addEventListener('click', () => {
    stringCache.clear();
    descendantCategoryIdsCache.clear();
    showToast('缓存已清理', 'success');
    updateMemoryStats();
  });
}

const updateMemoryStats = () => {
  const usage = memoryMonitor.getCurrentMemoryUsage();
  if (usage && memoryUsedEl && memoryTotalEl && memoryPercentEl) {
    memoryUsedEl.textContent = `${usage.used} MB`;
    memoryTotalEl.textContent = `${usage.total} MB`;
    memoryPercentEl.textContent = `${usage.percentage}%`;
  }
  if (stringCacheSizeEl) {
    stringCacheSizeEl.textContent = String(stringCache.size);
  }
};

// 每5秒更新一次内存统计
setInterval(updateMemoryStats, 5000);
updateMemoryStats();

// 异步加载 MathLive 并初始化
(async () => {
  try {
    await createMathField();
    mathfieldHost.appendChild(mathfield);
    
    // 初始化快速工具栏图标
    if (quickToolbar) {
      [...quickToolbar.querySelectorAll<HTMLButtonElement>('[data-insert]')].forEach((btn) => {
        btn.innerHTML = renderMarkup(btn.dataset.insert || '', { serialize: false });
      });

      quickToolbar.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement | null)?.closest('button');
        if (btn && btn.dataset.insert) {
          mathfield.executeCommand(['insert', btn.dataset.insert]);
          mathfield.focus();
        }
      });

      // Re-render toolbar icons properly using MathLive
      requestAnimationFrame(() => {
        const icons = quickToolbar.querySelectorAll<HTMLSpanElement>('.latex-icon');
        icons.forEach((icon) => {
          try {
            icon.innerHTML = renderMarkup(icon.textContent || '', { serialize: false });
          } catch (e) {
            // ignore
          }
        });
      });

      quickToolbar.querySelectorAll<HTMLDetailsElement>('.toolbar-group').forEach((group) => {
        group.addEventListener('mouseenter', () => {
          group.open = true;
        });
        group.addEventListener('mouseleave', () => {
          group.open = false;
        });
      });
    }
    
    console.log('[MathLive] 已成功加载');
  } catch (error) {
    console.error('[MathLive] 加载失败:', error);
    showToast('MathLive 加载失败，请刷新页面重试', 'error');
  }
})();

// Notify parent (Flutter) that we are ready to receive messages
if (window.parent && window.parent !== window) {
  window.parent.postMessage(JSON.stringify({ type: 'bridge-ready' }), '*');
}
