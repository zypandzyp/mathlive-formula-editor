/**
 * LaTeX 智能补全系统
 * 提供常用符号、函数和环境的自动补全
 */

export interface CompletionItem {
  label: string;
  insertText: string;
  description?: string;
  category: string;
  snippet?: boolean;
}

export const completionItems: CompletionItem[] = [
  // 基础数学符号
  { label: '\\alpha', insertText: '\\alpha', description: 'α - 希腊字母', category: '希腊字母' },
  { label: '\\beta', insertText: '\\beta', description: 'β - 希腊字母', category: '希腊字母' },
  { label: '\\gamma', insertText: '\\gamma', description: 'γ - 希腊字母', category: '希腊字母' },
  { label: '\\delta', insertText: '\\delta', description: 'δ - 希腊字母', category: '希腊字母' },
  { label: '\\epsilon', insertText: '\\epsilon', description: 'ε - 希腊字母', category: '希腊字母' },
  { label: '\\theta', insertText: '\\theta', description: 'θ - 希腊字母', category: '希腊字母' },
  { label: '\\lambda', insertText: '\\lambda', description: 'λ - 希腊字母', category: '希腊字母' },
  { label: '\\mu', insertText: '\\mu', description: 'μ - 希腊字母', category: '希腊字母' },
  { label: '\\pi', insertText: '\\pi', description: 'π - 希腊字母', category: '希腊字母' },
  { label: '\\sigma', insertText: '\\sigma', description: 'σ - 希腊字母', category: '希腊字母' },
  { label: '\\phi', insertText: '\\phi', description: 'φ - 希腊字母', category: '希腊字母' },
  { label: '\\omega', insertText: '\\omega', description: 'ω - 希腊字母', category: '希腊字母' },
  { label: '\\Delta', insertText: '\\Delta', description: 'Δ - 大写希腊字母', category: '希腊字母' },
  { label: '\\Omega', insertText: '\\Omega', description: 'Ω - 大写希腊字母', category: '希腊字母' },

  // 分式和根号
  { label: '\\frac', insertText: '\\frac{$1}{$2}', description: '分式', category: '基础', snippet: true },
  { label: '\\sqrt', insertText: '\\sqrt{$1}', description: '平方根', category: '基础', snippet: true },
  { label: '\\sqrt[n]', insertText: '\\sqrt[$1]{$2}', description: 'n次方根', category: '基础', snippet: true },

  // 上下标
  { label: '^', insertText: '^{$1}', description: '上标', category: '基础', snippet: true },
  { label: '_', insertText: '_{$1}', description: '下标', category: '基础', snippet: true },

  // 求和、积分
  { label: '\\sum', insertText: '\\sum_{$1}^{$2}', description: '求和', category: '微积分', snippet: true },
  { label: '\\prod', insertText: '\\prod_{$1}^{$2}', description: '连乘', category: '微积分', snippet: true },
  { label: '\\int', insertText: '\\int_{$1}^{$2}', description: '积分', category: '微积分', snippet: true },
  { label: '\\oint', insertText: '\\oint', description: '闭路积分', category: '微积分' },
  { label: '\\iint', insertText: '\\iint', description: '二重积分', category: '微积分' },
  { label: '\\lim', insertText: '\\lim_{$1 \\to $2}', description: '极限', category: '微积分', snippet: true },

  // 导数
  { label: '\\partial', insertText: '\\partial', description: '偏导数符号', category: '微积分' },
  { label: '\\nabla', insertText: '\\nabla', description: '梯度符号', category: '微积分' },

  // 关系符号
  { label: '\\leq', insertText: '\\leq', description: '≤ 小于等于', category: '关系' },
  { label: '\\geq', insertText: '\\geq', description: '≥ 大于等于', category: '关系' },
  { label: '\\neq', insertText: '\\neq', description: '≠ 不等于', category: '关系' },
  { label: '\\approx', insertText: '\\approx', description: '≈ 约等于', category: '关系' },
  { label: '\\equiv', insertText: '\\equiv', description: '≡ 恒等于', category: '关系' },
  { label: '\\sim', insertText: '\\sim', description: '∼ 相似', category: '关系' },

  // 集合
  { label: '\\in', insertText: '\\in', description: '∈ 属于', category: '集合' },
  { label: '\\notin', insertText: '\\notin', description: '∉ 不属于', category: '集合' },
  { label: '\\subset', insertText: '\\subset', description: '⊂ 子集', category: '集合' },
  { label: '\\subseteq', insertText: '\\subseteq', description: '⊆ 子集或相等', category: '集合' },
  { label: '\\cup', insertText: '\\cup', description: '∪ 并集', category: '集合' },
  { label: '\\cap', insertText: '\\cap', description: '∩ 交集', category: '集合' },
  { label: '\\emptyset', insertText: '\\emptyset', description: '∅ 空集', category: '集合' },

  // 逻辑
  { label: '\\forall', insertText: '\\forall', description: '∀ 对于所有', category: '逻辑' },
  { label: '\\exists', insertText: '\\exists', description: '∃ 存在', category: '逻辑' },
  { label: '\\nexists', insertText: '\\nexists', description: '∄ 不存在', category: '逻辑' },
  { label: '\\land', insertText: '\\land', description: '∧ 逻辑与', category: '逻辑' },
  { label: '\\lor', insertText: '\\lor', description: '∨ 逻辑或', category: '逻辑' },
  { label: '\\neg', insertText: '\\neg', description: '¬ 逻辑非', category: '逻辑' },

  // 箭头
  { label: '\\to', insertText: '\\to', description: '→ 右箭头', category: '箭头' },
  { label: '\\rightarrow', insertText: '\\rightarrow', description: '→ 右箭头', category: '箭头' },
  { label: '\\leftarrow', insertText: '\\leftarrow', description: '← 左箭头', category: '箭头' },
  { label: '\\Rightarrow', insertText: '\\Rightarrow', description: '⇒ 推导', category: '箭头' },
  { label: '\\Leftarrow', insertText: '\\Leftarrow', description: '⇐ 逆推导', category: '箭头' },
  { label: '\\iff', insertText: '\\iff', description: '⇔ 当且仅当', category: '箭头' },

  // 括号
  { label: '\\left(', insertText: '\\left($1\\right)', description: '自适应圆括号', category: '括号', snippet: true },
  { label: '\\left[', insertText: '\\left[$1\\right]', description: '自适应方括号', category: '括号', snippet: true },
  { label: '\\left\\{', insertText: '\\left\\{$1\\right\\}', description: '自适应大括号', category: '括号', snippet: true },

  // 矩阵
  { label: '\\matrix', insertText: '\\begin{matrix}\n$1\n\\end{matrix}', description: '矩阵', category: '矩阵', snippet: true },
  { label: '\\pmatrix', insertText: '\\begin{pmatrix}\n$1\n\\end{pmatrix}', description: '带圆括号矩阵', category: '矩阵', snippet: true },
  { label: '\\bmatrix', insertText: '\\begin{bmatrix}\n$1\n\\end{bmatrix}', description: '带方括号矩阵', category: '矩阵', snippet: true },

  // 三角函数
  { label: '\\sin', insertText: '\\sin', description: '正弦', category: '三角函数' },
  { label: '\\cos', insertText: '\\cos', description: '余弦', category: '三角函数' },
  { label: '\\tan', insertText: '\\tan', description: '正切', category: '三角函数' },
  { label: '\\cot', insertText: '\\cot', description: '余切', category: '三角函数' },
  { label: '\\arcsin', insertText: '\\arcsin', description: '反正弦', category: '三角函数' },
  { label: '\\arccos', insertText: '\\arccos', description: '反余弦', category: '三角函数' },
  { label: '\\arctan', insertText: '\\arctan', description: '反正切', category: '三角函数' },

  // 对数与指数
  { label: '\\log', insertText: '\\log', description: '对数', category: '函数' },
  { label: '\\ln', insertText: '\\ln', description: '自然对数', category: '函数' },
  { label: '\\exp', insertText: '\\exp', description: '指数函数', category: '函数' },

  // 其他符号
  { label: '\\infty', insertText: '\\infty', description: '∞ 无穷大', category: '其他' },
  { label: '\\pm', insertText: '\\pm', description: '± 正负号', category: '其他' },
  { label: '\\times', insertText: '\\times', description: '× 乘号', category: '其他' },
  { label: '\\div', insertText: '\\div', description: '÷ 除号', category: '其他' },
  { label: '\\cdot', insertText: '\\cdot', description: '· 点乘', category: '其他' },
  { label: '\\ldots', insertText: '\\ldots', description: '… 省略号', category: '其他' },
];

export class AutoCompleter {
  private items: CompletionItem[] = completionItems;
  private activeElement: HTMLTextAreaElement | null = null;
  private popup: HTMLDivElement | null = null;
  private selectedIndex = -1;

  constructor() {
    this.createPopup();
  }

  private createPopup(): void {
    this.popup = document.createElement('div');
    this.popup.className = 'autocomplete-popup';
    this.popup.style.cssText = `
      position: absolute;
      background: var(--panel-bg, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-height: 300px;
      overflow-y: auto;
      display: none;
      z-index: 1000;
      min-width: 280px;
    `;
    document.body.appendChild(this.popup);
  }

  public attach(element: HTMLTextAreaElement): void {
    this.activeElement = element;
    
    element.addEventListener('input', this.handleInput.bind(this));
    element.addEventListener('keydown', this.handleKeydown.bind(this));
    element.addEventListener('blur', () => {
      setTimeout(() => this.hide(), 200);
    });
  }

  private handleInput(): void {
    if (!this.activeElement) return;

    const cursorPos = this.activeElement.selectionStart;
    const text = this.activeElement.value.substring(0, cursorPos);
    const match = text.match(/\\[a-zA-Z]*$/);

    if (match) {
      const query = match[0];
      const matches = this.search(query);
      if (matches.length > 0) {
        this.show(matches);
      } else {
        this.hide();
      }
    } else {
      this.hide();
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.popup || this.popup.style.display === 'none') return;

    const items = this.popup.querySelectorAll('.autocomplete-item');
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        break;
      case 'Enter':
      case 'Tab':
        if (this.selectedIndex >= 0) {
          e.preventDefault();
          const item = items[this.selectedIndex] as HTMLElement;
          item.click();
        }
        break;
      case 'Escape':
        this.hide();
        break;
    }
  }

  private search(query: string): CompletionItem[] {
    const lowerQuery = query.toLowerCase();
    return this.items
      .filter((item) => item.label.toLowerCase().startsWith(lowerQuery))
      .slice(0, 10);
  }

  private show(matches: CompletionItem[]): void {
    if (!this.popup || !this.activeElement) return;

    this.popup.innerHTML = '';
    this.selectedIndex = 0;

    matches.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background 0.15s;
      `;
      
      div.innerHTML = `
        <span style="font-family: monospace; font-weight: 600;">${item.label}</span>
        <span style="font-size: 0.85em; color: var(--text-secondary); margin-left: 12px;">${item.description || ''}</span>
      `;

      div.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      div.addEventListener('click', () => {
        this.insert(item);
      });

      this.popup!.appendChild(div);
    });

    this.updateSelection();
    this.position();
    this.popup.style.display = 'block';
  }

  private updateSelection(): void {
    if (!this.popup) return;

    const items = this.popup.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
      const element = item as HTMLElement;
      if (index === this.selectedIndex) {
        element.style.background = 'var(--primary, #155eef)';
        element.style.color = '#fff';
        element.scrollIntoView({ block: 'nearest' });
      } else {
        element.style.background = '';
        element.style.color = '';
      }
    });
  }

  private position(): void {
    if (!this.popup || !this.activeElement) return;

    const rect = this.activeElement.getBoundingClientRect();
    const cursorPos = this.activeElement.selectionStart;
    
    // 简化定位：显示在输入框下方
    this.popup.style.left = `${rect.left}px`;
    this.popup.style.top = `${rect.bottom + 4}px`;
  }

  private insert(item: CompletionItem): void {
    if (!this.activeElement) return;

    const cursorPos = this.activeElement.selectionStart;
    const text = this.activeElement.value;
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    
    const match = beforeCursor.match(/\\[a-zA-Z]*$/);
    if (!match) return;

    const newText = beforeCursor.substring(0, beforeCursor.length - match[0].length) + 
                    item.insertText + 
                    afterCursor;
    
    this.activeElement.value = newText;
    
    // 设置光标位置（简化处理）
    const newCursorPos = cursorPos - match[0].length + item.insertText.length;
    this.activeElement.setSelectionRange(newCursorPos, newCursorPos);
    
    this.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    this.hide();
  }

  private hide(): void {
    if (this.popup) {
      this.popup.style.display = 'none';
    }
    this.selectedIndex = -1;
  }

  public destroy(): void {
    this.popup?.remove();
  }
}
