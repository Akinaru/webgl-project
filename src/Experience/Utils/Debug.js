import * as THREE from 'three'
import { Pane } from 'tweakpane'
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'
import * as CamerakitPlugin from '@tweakpane/plugin-camerakit'
import packageInfo from '../../../package.json'

const HASH_TOKEN_SEPARATOR = /[,+|]/g

export default class Debug
{
    constructor({ inputs = null } = {})
    {
        this.flags = this.parseHashFlags(window.location.hash)

        this.isDebugEnabled = this.flags.has('debug')
        this.isStatsEnabled = this.flags.has('stats')
        this.isInspectorEnabled = this.flags.has('inspector')

        this.active = this.isDebugEnabled
        this.panelActive = this.isDebugEnabled || this.isStatsEnabled

        this.autoRefreshCallbacks = new Set()
        this.physicsWireframeProvider = null
        this.physicsFolder = null
        this.physicsState = null
        this.physicsSyncCleanup = null

        this.inspectorContext = null
        this.inspectorInstance = null
        this.inspectorInitPromise = null
        this.folderPaths = new WeakMap()
        this.exportEntries = new Set()

        if(!this.panelActive)
        {
            return
        }

        this.setUI()
    }

    parseHashFlags(rawHash)
    {
        const normalizedHash = rawHash.replace('#', '').trim().toLowerCase()
        if(!normalizedHash)
        {
            return new Set()
        }

        const tokens = normalizedHash
            .split(HASH_TOKEN_SEPARATOR)
            .map((token) => token.trim())
            .filter(Boolean)
            .map((token) => token.replace(/[^a-z0-9_-]/g, ''))
            .filter(Boolean)

        return new Set(tokens)
    }

    setUI()
    {
        this.ui = new Pane({
            title: `🛠 Debug v${packageInfo.version}`,
            expanded: true
        })
        this.folderPaths.set(this.ui, [])

        this.ui.registerPlugin(EssentialsPlugin)
        this.ui.registerPlugin(CamerakitPlugin)

        this.styleUI()
        this.setClipboardExportButton()
    }

    styleUI()
    {
        if(!this.ui?.element)
        {
            return
        }

        const style = this.ui.element.style
        style.position = 'fixed'
        style.top = '16px'
        style.right = '16px'
        style.width = '360px'
        style.maxHeight = 'calc(100vh - 32px)'
        style.overflow = 'auto'
        style.zIndex = '120'
    }

    addFolder(title, { parent = this.ui, expanded = false } = {})
    {
        if(!parent?.addFolder)
        {
            return null
        }

        const folder = parent.addFolder({
            title,
            expanded
        })

        const parentPath = this.folderPaths.get(parent) ?? []
        this.folderPaths.set(folder, [...parentPath, title])

        return folder
    }

    addButton(container, { title, onClick } = {})
    {
        if(!container?.addButton)
        {
            return null
        }

        const button = container.addButton({ title: title || 'action' })
        if(typeof onClick === 'function')
        {
            button.on('click', () =>
            {
                onClick()
            })
        }

        return button
    }

    addBinding(container, object, key, options = {})
    {
        if(!container || !object || typeof key !== 'string')
        {
            return null
        }

        const {
            export: shouldExport = true,
            ...bindingOptions
        } = options

        if(typeof object[key] === 'function')
        {
            return this.addButton(container, {
                title: bindingOptions.label || key,
                onClick: () =>
                {
                    object[key]()
                }
            })
        }

        const binding = container.addBinding(object, key, bindingOptions)
        if(shouldExport)
        {
            this.registerExportEntry(binding, {
                container,
                label: bindingOptions.label || key,
                getValue: () => this.serializeValue(object[key]),
                readonly: Boolean(bindingOptions.readonly)
            })
        }
        return binding
    }

    addManualBinding(container, object, key, options = {}, mode = 'manual')
    {
        const binding = this.addBinding(container, object, key, options)
        if(!binding || typeof binding.refresh !== 'function')
        {
            return binding
        }

        const refresh = () =>
        {
            binding.refresh()
        }

        if(mode === 'auto')
        {
            this.autoRefreshCallbacks.add(refresh)
        }

        const originalDispose = binding.dispose?.bind(binding)
        binding.dispose = () =>
        {
            this.autoRefreshCallbacks.delete(refresh)
            originalDispose?.()
        }

        return binding
    }

    addButtons(container, { label = 'actions', columns = 2, buttons = [] } = {})
    {
        if(!container?.addBlade || buttons.length === 0)
        {
            return null
        }

        const safeColumns = Math.max(1, Math.floor(columns))
        const rows = Math.max(1, Math.ceil(buttons.length / safeColumns))

        const blade = container.addBlade({
            view: 'buttongrid',
            label,
            size: [safeColumns, rows],
            cells: (x, y) =>
            {
                const index = y * safeColumns + x
                const button = buttons[index]
                return {
                    title: button?.label || ''
                }
            }
        })

        blade.on('click', (event) =>
        {
            const [x, y] = event.index
            const index = y * safeColumns + x
            const button = buttons[index]
            button?.onClick?.()
        })

        return blade
    }

    addColorBinding(container, object, key, options = {})
    {
        const color = object?.[key]
        if(!(color instanceof THREE.Color))
        {
            return null
        }

        const colorState = { value: `#${color.getHexString()}` }
        const binding = this.addBinding(container, colorState, 'value', {
            label: options.label || key,
            export: false,
            ...options
        })

        binding?.on?.('change', (event) =>
        {
            color.set(event.value)
        })

        this.registerExportEntry(binding, {
            container,
            label: options.label || key,
            getValue: () => `#${color.getHexString()}`,
            readonly: Boolean(options.readonly)
        })

        return binding
    }

    addThreeColorBinding(container, object, key, options = {})
    {
        return this.addColorBinding(container, object, key, options)
    }

    addAutoRefresh(callback)
    {
        if(typeof callback !== 'function')
        {
            return () => {}
        }

        this.autoRefreshCallbacks.add(callback)
        return () =>
        {
            this.autoRefreshCallbacks.delete(callback)
        }
    }

    registerPhysicsWireframeProvider(provider)
    {
        if(!this.isDebugEnabled || !provider || typeof provider.get !== 'function' || typeof provider.set !== 'function')
        {
            return
        }

        this.physicsWireframeProvider = provider

        if(!this.physicsFolder)
        {
            this.physicsFolder = this.addFolder('🧱 Physics', { expanded: false })
        }

        if(!this.physicsState)
        {
            this.physicsState = {
                wireframe: Boolean(this.physicsWireframeProvider.get())
            }

            const binding = this.addBinding(this.physicsFolder, this.physicsState, 'wireframe', {
                label: 'wireframe'
            })

            binding?.on?.('change', (event) =>
            {
                this.physicsWireframeProvider?.set?.(Boolean(event.value))
            })
        }

        this.physicsSyncCleanup?.()
        this.physicsSyncCleanup = this.addAutoRefresh(() =>
        {
            if(!this.physicsWireframeProvider || !this.physicsState)
            {
                return
            }

            this.physicsState.wireframe = Boolean(this.physicsWireframeProvider.get())
        })
    }

    setClipboardExportButton()
    {
        if(!this.ui)
        {
            return
        }

        this.addButton(this.ui, {
            title: 'Save To Clipboard',
            onClick: async () =>
            {
                await this.copyDebugValuesToClipboard()
            }
        })
    }

    registerExportEntry(binding, {
        container = this.ui,
        label = '',
        getValue = () => null,
        readonly = false
    } = {})
    {
        if(readonly || !binding || typeof getValue !== 'function')
        {
            return binding
        }

        const entry = {
            container,
            label,
            getValue
        }
        this.exportEntries.add(entry)

        const originalDispose = binding.dispose?.bind(binding)
        binding.dispose = () =>
        {
            this.exportEntries.delete(entry)
            originalDispose?.()
        }

        return binding
    }

    buildDebugExportPayload()
    {
        const payload = {}

        for(const entry of this.exportEntries)
        {
            const folderPath = this.folderPaths.get(entry.container) ?? []
            let cursor = payload

            for(const segment of folderPath)
            {
                if(!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment]))
                {
                    cursor[segment] = {}
                }

                cursor = cursor[segment]
            }

            cursor[entry.label] = entry.getValue()
        }

        return payload
    }

    async copyDebugValuesToClipboard()
    {
        const payload = this.buildDebugExportPayload()
        const text = JSON.stringify(payload, null, 2)

        try
        {
            await navigator.clipboard.writeText(text)
            console.info('[Debug] Valeurs copiees dans le presse-papiers')
        }
        catch(error)
        {
            console.warn('[Debug] Impossible de copier les valeurs debug:', error)
        }
    }

    serializeValue(value)
    {
        if(value instanceof THREE.Color)
        {
            return `#${value.getHexString()}`
        }

        if(Array.isArray(value))
        {
            return value.map((item) => this.serializeValue(item))
        }

        if(value && typeof value === 'object')
        {
            const output = {}
            for(const [key, nestedValue] of Object.entries(value))
            {
                output[key] = this.serializeValue(nestedValue)
            }
            return output
        }

        return value
    }

    syncInspectorContext(context)
    {
        if(!this.isInspectorEnabled || !context?.renderer || !context?.scene || !context?.camera)
        {
            return
        }

        this.inspectorContext = context

        if(this.inspectorInstance)
        {
            this.inspectorInstance.updateInspector({
                renderer: context.renderer,
                scene: context.scene,
                camera: context.camera
            })
            return
        }

        if(!this.inspectorInitPromise)
        {
            this.inspectorInitPromise = this.initInspector()
        }
    }

    async initInspector()
    {
        if(!this.isInspectorEnabled || !this.inspectorContext)
        {
            return
        }

        try
        {
            const [{ injectInspector }] = await Promise.all([
                import('threejs-inspector'),
                import('threejs-inspector/threejs-inspector.css')
            ])

            if(!this.inspectorContext)
            {
                return
            }

            this.inspectorInstance = injectInspector({
                renderer: this.inspectorContext.renderer,
                scene: this.inspectorContext.scene,
                camera: this.inspectorContext.camera
            })
        }
        catch(error)
        {
            console.warn('[Debug] Impossible d initialiser Three.js Inspector:', error)
        }
    }

    update()
    {
        if(!this.panelActive)
        {
            return
        }

        for(const callback of this.autoRefreshCallbacks)
        {
            callback()
        }
    }

    destroy()
    {
        this.autoRefreshCallbacks.clear()
        this.exportEntries.clear()
        this.physicsSyncCleanup?.()

        if(this.inspectorInstance?.unmountInspector)
        {
            this.inspectorInstance.unmountInspector()
            this.inspectorInstance = null
        }

        this.ui?.dispose?.()
    }
}
