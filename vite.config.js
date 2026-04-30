import { defineConfig } from 'vite'
import railsEditorPlugin from './tools/vite/railsEditorPlugin.js'

export default defineConfig({
    plugins: [railsEditorPlugin()]
})
