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
        this.inputs = inputs
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

        this.visible = true

        if(!this.panelActive)
        {
            return
        }

        this.setUI()
        this.setKeyboardShortcuts()
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

        this.ui.registerPlugin(EssentialsPlugin)
        this.ui.registerPlugin(CamerakitPlugin)

        this.styleUI()
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
        style.zIndex = '30'
    }

    setKeyboardShortcuts()
    {
        this.onWindowKeyDown = (event) =>
        {
            if(event.repeat || this.shouldIgnoreShortcut(event.target))
            {
                return
            }

            if(event.code === 'KeyH')
            {
                this.toggleVisibility()
            }
        }

        this.inputs?.on?.('keydown.debug', this.onWindowKeyDown)
    }

    shouldIgnoreShortcut(target)
    {
        if(!(target instanceof HTMLElement))
        {
            return false
        }

        return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    }

    toggleVisibility()
    {
        if(!this.ui)
        {
            return
        }

        this.visible = !this.visible
        this.ui.hidden = !this.visible
    }

    addFolder(title, { parent = this.ui, expanded = false } = {})
    {
        if(!parent?.addFolder)
        {
            return null
        }

        return parent.addFolder({
            title,
            expanded
        })
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

        if(typeof object[key] === 'function')
        {
            return this.addButton(container, {
                title: options.label || key,
                onClick: () =>
                {
                    object[key]()
                }
            })
        }

        return container.addBinding(object, key, options)
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
            ...options
        })

        binding?.on?.('change', (event) =>
        {
            color.set(event.value)
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
        this.inputs?.off?.('keydown.debug')

        this.autoRefreshCallbacks.clear()
        this.physicsSyncCleanup?.()

        if(this.inspectorInstance?.unmountInspector)
        {
            this.inspectorInstance.unmountInspector()
            this.inspectorInstance = null
        }

        this.ui?.dispose?.()
    }
}
