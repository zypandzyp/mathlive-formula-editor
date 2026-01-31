/**
 * 虚拟列表实现 - 优化大量公式渲染性能
 * 仅渲染可视区域及缓冲区内的元素
 */

export type VirtualListItem<T = unknown> = T & { id: string };

export interface VirtualListOptions<T> {
  container: HTMLElement;
  items: VirtualListItem<T>[];
  itemHeight: number;
  bufferSize?: number;
  renderItem: (item: VirtualListItem<T>, existingElement?: HTMLElement) => HTMLElement;
  onVisibleRangeChange?: (start: number, end: number) => void;
}

export class VirtualList<T = unknown> {
  private container: HTMLElement;
  private viewport: HTMLElement;
  private content: HTMLElement;
  private items: VirtualListItem<T>[];
  private itemHeight: number;
  private bufferSize: number;
  private renderItem: (item: VirtualListItem<T>, existingElement?: HTMLElement) => HTMLElement;
  private onVisibleRangeChange?: (start: number, end: number) => void;
  
  private visibleStart = 0;
  private visibleEnd = 0;
  private renderedElements = new Map<string, HTMLElement>();
  private scrollRAF: number | null = null;

  constructor(options: VirtualListOptions<T>) {
    this.container = options.container;
    this.items = options.items;
    this.itemHeight = options.itemHeight;
    this.bufferSize = options.bufferSize ?? 5;
    this.renderItem = options.renderItem;
    this.onVisibleRangeChange = options.onVisibleRangeChange;

    // 创建视口和内容容器
    this.viewport = document.createElement('div');
    this.viewport.style.cssText = 'overflow-y: auto; height: 100%; position: relative;';
    
    this.content = document.createElement('div');
    this.content.style.cssText = 'position: relative; width: 100%;';
    
    this.viewport.appendChild(this.content);
    this.container.appendChild(this.viewport);

    // 绑定滚动事件
    this.viewport.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    
    // 初始渲染
    this.updateVisibleRange();
    this.render();
  }

  private handleScroll(): void {
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    this.scrollRAF = requestAnimationFrame(() => {
      this.updateVisibleRange();
      this.render();
      this.scrollRAF = null;
    });
  }

  private updateVisibleRange(): void {
    const scrollTop = this.viewport.scrollTop;
    const viewportHeight = this.viewport.clientHeight;
    
    const start = Math.floor(scrollTop / this.itemHeight);
    const visibleCount = Math.ceil(viewportHeight / this.itemHeight);
    const end = start + visibleCount;

    this.visibleStart = Math.max(0, start - this.bufferSize);
    this.visibleEnd = Math.min(this.items.length, end + this.bufferSize);

    this.onVisibleRangeChange?.(this.visibleStart, this.visibleEnd);
  }

  private render(): void {
    // 设置内容容器高度
    const totalHeight = this.items.length * this.itemHeight;
    this.content.style.height = `${totalHeight}px`;

    // 移除不在可视范围内的元素
    const visibleIds = new Set(
      this.items.slice(this.visibleStart, this.visibleEnd).map((item) => item.id)
    );
    
    for (const [id, element] of this.renderedElements.entries()) {
      if (!visibleIds.has(id)) {
        element.remove();
        this.renderedElements.delete(id);
      }
    }

    // 渲染可视范围内的元素
    for (let i = this.visibleStart; i < this.visibleEnd; i++) {
      const item = this.items[i];
      if (!item) continue;

      let element = this.renderedElements.get(item.id);
      
      if (!element) {
        element = this.renderItem(item);
        element.style.position = 'absolute';
        element.style.width = '100%';
        element.style.top = `${i * this.itemHeight}px`;
        element.dataset.virtualIndex = String(i);
        this.content.appendChild(element);
        this.renderedElements.set(item.id, element);
      } else {
        // 更新现有元素
        const updated = this.renderItem(item, element);
        if (updated !== element) {
          element.replaceWith(updated);
          this.renderedElements.set(item.id, updated);
          element = updated;
        }
        // 更新位置
        element.style.top = `${i * this.itemHeight}px`;
        element.dataset.virtualIndex = String(i);
      }
    }
  }

  public updateItems(items: VirtualListItem<T>[]): void {
    this.items = items;
    this.updateVisibleRange();
    this.render();
  }

  public scrollToIndex(index: number): void {
    const targetScroll = index * this.itemHeight;
    this.viewport.scrollTop = targetScroll;
  }

  public destroy(): void {
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
    }
    this.viewport.remove();
    this.renderedElements.clear();
  }

  public refresh(): void {
    this.updateVisibleRange();
    this.render();
  }
}

/**
 * 简化的虚拟列表创建函数
 */
export function createVirtualList<T>(options: VirtualListOptions<T>): VirtualList<T> {
  return new VirtualList(options);
}
