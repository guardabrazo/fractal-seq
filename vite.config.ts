import { defineConfig } from 'vite'

export default defineConfig({
    base: '/fractal-seq/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
    },
})
