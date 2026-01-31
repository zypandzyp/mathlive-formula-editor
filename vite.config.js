import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/mathlive-formula-editor/',
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'add-font-display',
          Once(root) {
            root.walkAtRules('font-face', (rule) => {
              const hasFontDisplay = rule.some(node => 
                node.type === 'decl' && node.prop === 'font-display'
              );
              if (!hasFontDisplay) {
                rule.append({ prop: 'font-display', value: 'swap' });
              }
            });
          }
        }
      ]
    }
  }
}));
