import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2020', emptyOutDir: false, modulePreload: false, cssCodeSplit: false, assetsInlineLimit: 1000000, rollupOptions: { output: { codeSplitting: false } } } });
