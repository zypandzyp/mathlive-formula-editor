export {};

declare global {
  interface FileSystemHandle {
    requestPermission?: (descriptor?: unknown) => Promise<PermissionState>;
  }

  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  }

  interface Window {
    electronAPI?: {
      onMenuAction: (callback: (event: unknown, action: string) => void) => void;
      onNetworkStatus: (
        callback: (event: unknown, payload: { running: boolean; addresses: string[] }) => void,
      ) => void;
      openExternal: (url: string) => void;
      setThemePreference: (theme: 'light' | 'dark') => void;
      chooseJsonFile?: () => Promise<{ content: string; filePath: string } | null>;
      saveJsonFile?: (payload: { filePath: string; content: string }) => Promise<void>;
    };
  }
}
