/**
 * 性能监控工具
 * 用于跟踪和优化应用性能
 */

export interface PerformanceMetrics {
  renderTime: number;
  fps: number;
  memoryUsage?: number;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private renderTimes: number[] = [];
  private maxSamples = 60;

  constructor() {
    this.startMonitoring();
  }

  private startMonitoring(): void {
    const measureFrame = () => {
      const now = performance.now();
      const delta = now - this.lastTime;
      
      if (delta >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastTime = now;
      }
      
      this.frameCount++;
      requestAnimationFrame(measureFrame);
    };

    requestAnimationFrame(measureFrame);
  }

  public measureRender<T>(fn: () => T, label?: string): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    this.renderTimes.push(duration);
    if (this.renderTimes.length > this.maxSamples) {
      this.renderTimes.shift();
    }

    if (label && duration > 16) {
      console.info(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
    }

    return result;
  }

  public async measureRenderAsync<T>(fn: () => Promise<T>, label?: string): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    this.renderTimes.push(duration);
    if (this.renderTimes.length > this.maxSamples) {
      this.renderTimes.shift();
    }

    if (label && duration > 50) {
      console.info(`[Performance] ${label} took ${duration.toFixed(2)}ms (async)`);
    }

    return result;
  }

  public getMetrics(): PerformanceMetrics {
    const avgRenderTime = this.renderTimes.length
      ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length
      : 0;

    const metrics: PerformanceMetrics = {
      renderTime: avgRenderTime,
      fps: this.fps,
    };

    if ('memory' in performance) {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (memory) {
        metrics.memoryUsage = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      }
    }

    return metrics;
  }

  public logMetrics(): void {
    const metrics = this.getMetrics();
    console.log('[Performance Metrics]', {
      'Avg Render Time': `${metrics.renderTime.toFixed(2)}ms`,
      'FPS': metrics.fps,
      'Memory Usage': metrics.memoryUsage ? `${metrics.memoryUsage}MB` : 'N/A',
    });
  }

  public createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      border-radius: 4px;
      min-width: 150px;
      pointer-events: none;
    `;

    const update = () => {
      const metrics = this.getMetrics();
      overlay.innerHTML = `
        <div>FPS: ${metrics.fps}</div>
        <div>Render: ${metrics.renderTime.toFixed(2)}ms</div>
        ${metrics.memoryUsage ? `<div>Memory: ${metrics.memoryUsage}MB</div>` : '<div>Memory: N/A</div>'}
      `;
      requestAnimationFrame(update);
    };

    update();
    return overlay;
  }
}

export const performanceMonitor = new PerformanceMonitor();

/**
 * 使用 requestIdleCallback 优化非关键渲染
 */
export function scheduleIdleTask(task: () => void, options?: { timeout?: number }): number {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(task, options);
  }
  // 降级到 setTimeout
  return globalThis.setTimeout(task, 1) as unknown as number;
}

export function cancelIdleTask(id: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * 批量DOM更新优化
 */
export class BatchRenderer {
  private pendingUpdates: (() => void)[] = [];
  private rafId: number | null = null;

  public schedule(update: () => void): void {
    this.pendingUpdates.push(update);
    
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    const updates = this.pendingUpdates.slice();
    this.pendingUpdates = [];
    this.rafId = null;

    // 批量执行更新
    for (const update of updates) {
      try {
        update();
      } catch (error) {
        console.error('[BatchRenderer] Update failed:', error);
      }
    }
  }

  public cancel(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingUpdates = [];
  }
}

export const batchRenderer = new BatchRenderer();
