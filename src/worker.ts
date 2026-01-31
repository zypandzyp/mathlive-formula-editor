/**
 * Web Worker for background LaTeX rendering
 * 将LaTeX渲染工作移到后台线程，避免阻塞主线程
 */

import { convertLatexToMarkup } from 'mathlive';

export interface WorkerRequest {
  id: string;
  type: 'render' | 'batch-render';
  latex?: string;
  items?: Array<{ id: string; latex: string }>;
  options?: Record<string, unknown>;
}

export interface WorkerResponse {
  id: string;
  type: 'render' | 'batch-render';
  success: boolean;
  html?: string;
  results?: Array<{ id: string; html: string; success: boolean; error?: string }>;
  error?: string;
}

// Worker消息处理
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === 'render') {
      // 单个LaTeX渲染
      if (!request.latex) {
        throw new Error('Missing latex parameter');
      }

      const html = convertLatexToMarkup(request.latex, {
        serialize: false,
        ...request.options,
      } as never);

      const response: WorkerResponse = {
        id: request.id,
        type: 'render',
        success: true,
        html: html as string,
      };

      self.postMessage(response);
    } else if (request.type === 'batch-render') {
      // 批量LaTeX渲染
      if (!request.items || !Array.isArray(request.items)) {
        throw new Error('Missing items parameter');
      }

      const results = request.items.map((item) => {
        try {
          const html = convertLatexToMarkup(item.latex, {
            serialize: false,
            ...request.options,
          } as never);

          return {
            id: item.id,
            html: html as string,
            success: true,
          };
        } catch (error) {
          return {
            id: item.id,
            html: '',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const response: WorkerResponse = {
        id: request.id,
        type: 'batch-render',
        success: true,
        results,
      };

      self.postMessage(response);
    } else {
      throw new Error(`Unknown request type: ${(request as WorkerRequest).type}`);
    }
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      type: request.type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    self.postMessage(response);
  }
});

// 通知主线程worker已就绪
self.postMessage({ type: 'ready' });
