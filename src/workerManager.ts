/**
 * LaTeX渲染Worker管理器
 * 提供主线程与Worker之间的通信接口
 */

import type { WorkerRequest, WorkerResponse } from './worker';

export class RenderWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: WorkerResponse) => void;
    reject: (error: Error) => void;
  }>();
  private requestIdCounter = 0;
  private isReady = false;
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initWorker();
  }

  private async initWorker(): Promise<void> {
    try {
      // 使用Vite的worker导入语法
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
      });

      return new Promise<void>((resolve, reject) => {
        if (!this.worker) {
          reject(new Error('Worker initialization failed'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Worker ready timeout'));
        }, 5000);

        this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse | { type: string }>) => {
          const data = event.data;

          if ('type' in data && data.type === 'ready') {
            clearTimeout(timeout);
            this.isReady = true;
            resolve();
            return;
          }

          // 处理正常响应
          const response = data as WorkerResponse;
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            if (response.success) {
              pending.resolve(response);
            } else {
              pending.reject(new Error(response.error || 'Worker error'));
            }
          }
        });

        this.worker.addEventListener('error', (error) => {
          console.error('[RenderWorker] Error:', error);
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      console.error('[RenderWorker] Initialization failed:', error);
      throw error;
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  public async renderLatex(latex: string, options?: Record<string, unknown>): Promise<string> {
    await this.readyPromise;

    if (!this.worker || !this.isReady) {
      throw new Error('Worker not ready');
    }

    const id = this.generateRequestId();
    const request: WorkerRequest = {
      id,
      type: 'render',
      latex,
      options,
    };

    return new Promise<string>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => {
          if (response.html) {
            resolve(response.html);
          } else {
            reject(new Error('No HTML in response'));
          }
        },
        reject,
      });

      this.worker!.postMessage(request);

      // 超时保护
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Render timeout'));
        }
      }, 10000);
    });
  }

  public async batchRenderLatex(
    items: Array<{ id: string; latex: string }>,
    options?: Record<string, unknown>
  ): Promise<Array<{ id: string; html: string; success: boolean; error?: string }>> {
    await this.readyPromise;

    if (!this.worker || !this.isReady) {
      throw new Error('Worker not ready');
    }

    const id = this.generateRequestId();
    const request: WorkerRequest = {
      id,
      type: 'batch-render',
      items,
      options,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => {
          if (response.results) {
            resolve(response.results);
          } else {
            reject(new Error('No results in response'));
          }
        },
        reject,
      });

      this.worker!.postMessage(request);

      // 超时保护
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Batch render timeout'));
        }
      }, 30000);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
    this.pendingRequests.clear();
  }
}

// 单例实例
let workerManager: RenderWorkerManager | null = null;

export function getRenderWorker(): RenderWorkerManager {
  if (!workerManager) {
    workerManager = new RenderWorkerManager();
  }
  return workerManager;
}

export function terminateRenderWorker(): void {
  if (workerManager) {
    workerManager.terminate();
    workerManager = null;
  }
}
