import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                field: resolve(__dirname, 'field.html'),
                space: resolve(__dirname, 'space.html'),
                time: resolve(__dirname, 'time.html'),
                energy: resolve(__dirname, 'energy.html'),
            }
        }
    }
})
