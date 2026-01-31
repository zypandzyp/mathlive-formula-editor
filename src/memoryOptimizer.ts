/**
 * 内存优化工具模块
 * 提供字符串缓存、对象池、弱引用缓存等功能减少内存占用
 */

/**
 * 字符串缓存池 - 使用 WeakMap 避免重复存储相同字符串
 * WeakMap 的键（对象）可以被垃圾回收，不会造成内存泄漏
 */
class StringCache {
  private cache = new Map<string, string>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * 获取字符串的缓存版本（如果存在相同内容的字符串，返回缓存的引用）
   */
  intern(str: string): string {
    if (this.cache.has(str)) {
      return this.cache.get(str)!;
    }

    // 限制缓存大小，防止无限增长
    if (this.cache.size >= this.maxSize) {
      // 使用 FIFO 策略，删除第一个元素
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(str, str);
    return str;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * DOM 节点对象池 - 复用 DOM 节点减少创建和销毁开销
 */
class DOMElementPool<T extends HTMLElement = HTMLElement> {
  private pool: T[] = [];
  private maxSize: number;
  private createElement: () => T;

  constructor(createElement: () => T, initialSize = 10, maxSize = 100) {
    this.createElement = createElement;
    this.maxSize = maxSize;
    // 预创建一些元素
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createElement());
    }
  }

  /**
   * 获取一个元素（从池中取或创建新的）
   */
  acquire(): T {
    return this.pool.pop() || this.createElement();
  }

  /**
   * 归还元素到池中
   */
  release(element: T): void {
    if (this.pool.length < this.maxSize) {
      // 清理元素状态
      element.className = '';
      element.textContent = '';
      element.removeAttribute('style');
      // 移除所有子节点
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      this.pool.push(element);
    }
    // 如果池已满，让元素被垃圾回收
  }

  /**
   * 清空对象池
   */
  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

/**
 * 渲染结果缓存 - 使用 WeakMap 缓存昂贵的计算结果
 */
class RenderCache<K extends object, V> {
  private cache = new WeakMap<K, V>();

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }
}

/**
 * 批量操作优化器 - 减少数组创建
 */
export class BatchOptimizer {
  /**
   * 就地过滤数组（不创建新数组）
   */
  static filterInPlace<T>(array: T[], predicate: (item: T, index: number) => boolean): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < array.length; readIndex++) {
      if (predicate(array[readIndex], readIndex)) {
        if (writeIndex !== readIndex) {
          array[writeIndex] = array[readIndex];
        }
        writeIndex++;
      }
    }
    array.length = writeIndex;
  }

  /**
   * 优化的 map 操作（减少中间数组）
   */
  static mapInPlace<T>(array: T[], mapper: (item: T, index: number) => T): void {
    for (let i = 0; i < array.length; i++) {
      array[i] = mapper(array[i], i);
    }
  }

  /**
   * 查找并返回第一个匹配项（避免创建新数组）
   */
  static findFirst<T>(array: T[], predicate: (item: T) => boolean): T | undefined {
    for (const item of array) {
      if (predicate(item)) return item;
    }
    return undefined;
  }
}

/**
 * 内存监控工具
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private lastMeasurement: { usedJSHeapSize: number; totalJSHeapSize: number; timestamp: number } | null = null;

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * 获取当前内存使用情况（仅在支持的浏览器中）
   */
  getCurrentMemoryUsage(): { used: number; total: number; percentage: number } | null {
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const used = memory.usedJSHeapSize;
      const total = memory.totalJSHeapSize;
      
      this.lastMeasurement = {
        usedJSHeapSize: used,
        totalJSHeapSize: total,
        timestamp: Date.now()
      };

      return {
        used: Math.round(used / 1024 / 1024), // MB
        total: Math.round(total / 1024 / 1024), // MB
        percentage: Math.round((used / total) * 100)
      };
    }
    return null;
  }

  /**
   * 记录内存快照
   */
  logMemorySnapshot(label: string): void {
    const usage = this.getCurrentMemoryUsage();
    if (usage) {
      console.log(`[Memory ${label}] Used: ${usage.used}MB / ${usage.total}MB (${usage.percentage}%)`);
    }
  }

  /**
   * 监控内存增长
   */
  measureMemoryGrowth(callback: () => void, label: string): void {
    const before = this.getCurrentMemoryUsage();
    callback();
    setTimeout(() => {
      const after = this.getCurrentMemoryUsage();
      if (before && after) {
        const growth = after.used - before.used;
        console.log(`[Memory Growth ${label}] ${growth > 0 ? '+' : ''}${growth}MB`);
      }
    }, 100);
  }
}

// 导出单例实例
export const stringCache = new StringCache();
export const memoryMonitor = MemoryMonitor.getInstance();

// 导出 DOM 元素池工厂
export function createElementPool<T extends HTMLElement = HTMLElement>(
  tagName: string,
  initialSize = 10,
  maxSize = 100
): DOMElementPool<T> {
  return new DOMElementPool<T>(
    () => document.createElement(tagName) as T,
    initialSize,
    maxSize
  );
}

// 导出渲染缓存工厂
export function createRenderCache<K extends object, V>(): RenderCache<K, V> {
  return new RenderCache<K, V>();
}
