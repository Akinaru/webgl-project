import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'
import DialogueRepository from './DialogueRepository.js'
import DialogueConditionResolver from './DialogueConditionResolver.js'
import DialogueActionExecutor from './DialogueActionExecutor.js'
import DialogueUI from './DialogueUI.js'

export default class DialogueManager extends EventEmitter
{
    constructor()
    {
        super()

        this.experience = new Experience()
        this.debug = this.experience.debug
        this.repository = new DialogueRepository()
        this.conditionResolver = new DialogueConditionResolver(this)
        this.actionExecutor = new DialogueActionExecutor(this)
        this.ui = new DialogueUI(this)

        this.flags = {}
        this.queue = []
        this.state = this.createEmptyState()
        this.autoAdvancePollTimer = null
        this.autoAdvanceDelayTimer = null

        this.setDebug()
    }

    createEmptyState()
    {
        return {
            running: false,
            dialogueKey: null,
            dialogue: null,
            nodeId: null,
            node: null,
            waitingChoice: false,
            choices: [],
            context: {},
            continueLocked: false,
            continueProgress: 1
        }
    }

    isRunning()
    {
        return this.state.running
    }

    isWaitingChoice()
    {
        return this.state.waitingChoice
    }

    setFlag(key, value = true)
    {
        if(typeof key !== 'string' || key.trim() === '')
        {
            return
        }

        this.flags[key] = value
    }

    getFlag(key)
    {
        return this.flags[key]
    }

    hasFlag(key)
    {
        return Boolean(this.flags[key])
    }

    startByKey(dialogueKey, context = {})
    {
        if(typeof dialogueKey !== 'string' || dialogueKey.trim() === '')
        {
            return false
        }

        const dialogue = this.repository.getByKey(dialogueKey)
        if(!dialogue)
        {
            console.warn(`[Dialogue] Introuvable: ${dialogueKey}`)
            return false
        }

        if(this.isRunning())
        {
            this.queue.push({
                dialogueKey,
                context
            })
            return false
        }

        if(dialogue.once && this.hasFlag(`dialogue.once.${dialogueKey}`))
        {
            return false
        }

        this.state = {
            running: true,
            dialogueKey,
            dialogue,
            nodeId: null,
            node: null,
            waitingChoice: false,
            choices: [],
            context
        }

        this.trigger('start', [{
            key: dialogueKey
        }])

        this.experience?.sound?.unlock?.()
        this.experience?.sound?.playDialogue?.(dialogue.sound)

        this.goToNode(dialogue.startNode)
        return true
    }

    goToNode(nextNodeId)
    {
        if(!this.isRunning())
        {
            return
        }

        if(!nextNodeId)
        {
            this.endCurrentDialogue()
            return
        }

        const node = this.state.dialogue.nodes?.[nextNodeId]
        if(!node)
        {
            console.warn(`[Dialogue] Node introuvable: ${nextNodeId}`)
            this.endCurrentDialogue()
            return
        }

        this.state.nodeId = nextNodeId
        this.state.node = node
        this.state.waitingChoice = false
        this.state.choices = []

        const autoSoundPath = node.type === 'line' ? `sounds/dialogues/${this.state.dialogueKey}/${nextNodeId}.mp3` : null
        const soundToPlay = node.sound || (autoSoundPath ? { path: autoSoundPath, name: nextNodeId } : null)

        let hasStartedNodeAudio = false
        if(soundToPlay)
        {
            this.experience?.sound?.unlock?.()
            hasStartedNodeAudio = this.experience?.sound?.playDialogue?.(soundToPlay) === true
        }
        else if(!this.state.dialogue?.sound)
        {
            this.experience?.sound?.stopDialogue?.()
        }

        this.actionExecutor.executeMany(node.actions, this.createActionContext())

        switch(node.type)
        {
            case 'line':
                this.configureContinueGateForLine({ hasStartedNodeAudio })
                this.emitState()
                break

            case 'choice':
                this.unlockContinueGate()
                this.prepareChoices(node)
                this.emitState()
                break

            case 'branch':
                this.handleBranch(node)
                break

            case 'action':
                this.actionExecutor.executeMany(node.run, this.createActionContext())
                this.goToNode(node.next)
                break

            case 'end':
                this.endCurrentDialogue(node)
                break

            default:
                console.warn(`[Dialogue] Type de node inconnu: ${node.type}`)
                this.endCurrentDialogue()
                break
        }
    }

    prepareChoices(node)
    {
        const availableChoices = (node.choices || []).filter((choice) =>
        {
            return this.conditionResolver.checkAll(choice.conditions || [], this.state.context)
        })

        this.state.waitingChoice = true
        this.state.choices = availableChoices
    }

    handleBranch(node)
    {
        const matchingBranch = (node.branches || []).find((branch) =>
        {
            return this.conditionResolver.checkAll(branch.conditions || [], this.state.context)
        })

        const nextNode = matchingBranch?.next || node.fallbackNext
        this.goToNode(nextNode)
    }

    continue()
    {
        if(!this.isRunning() || this.state.waitingChoice)
        {
            return
        }

        if(!this.canContinueCurrentNode())
        {
            return
        }

        const next = this.state.node?.next
        if(next)
        {
            this.goToNode(next)
            return
        }

        this.endCurrentDialogue()
    }

    skipCurrentNode()
    {
        if(!this.isRunning() || this.state.waitingChoice)
        {
            return
        }

        this.clearAutoAdvanceTimers()
        this.experience?.sound?.stopDialogue?.()

        const next = this.state.node?.next
        if(next)
        {
            this.goToNode(next)
            return
        }

        this.endCurrentDialogue()
    }

    choose(choiceId)
    {
        if(!this.isRunning() || !this.state.waitingChoice)
        {
            return
        }

        const choice = this.state.choices.find((item) => item.id === choiceId)
        if(!choice)
        {
            return
        }

        this.state.waitingChoice = false
        this.state.choices = []
        this.actionExecutor.executeMany(choice.actions, this.createActionContext({
            choiceId: choice.id
        }))
        this.goToNode(choice.next)
    }

    chooseByIndex(index)
    {
        if(index < 0 || index >= this.state.choices.length)
        {
            return
        }

        this.choose(this.state.choices[index].id)
    }

    skip()
    {
        if(!this.isRunning())
        {
            return
        }

        this.endCurrentDialogue()
    }

    endCurrentDialogue(node = this.state.node)
    {
        if(!this.isRunning())
        {
            return
        }

        this.clearAutoAdvanceTimers()

        if(node?.type === 'end')
        {
            this.actionExecutor.executeMany(node.actions, this.createActionContext())
        }

        if(this.state.dialogue?.once)
        {
            this.setFlag(`dialogue.once.${this.state.dialogueKey}`, true)
        }

        const endedKey = this.state.dialogueKey
        this.experience?.sound?.stopDialogue?.()
        this.state = this.createEmptyState()

        this.trigger('end', [{
            key: endedKey
        }])
        this.emitState()
        this.startNextQueuedDialogue()
    }

    startNextQueuedDialogue()
    {
        const queued = this.queue.shift()
        if(!queued)
        {
            return
        }

        this.startByKey(queued.dialogueKey, queued.context)
    }

    emitState()
    {
        this.refreshContinueGateState()
        this.trigger('state', [{
            ...this.state
        }])
    }

    configureContinueGateForLine({ hasStartedNodeAudio = false } = {})
    {
        this.state.continueLocked = Boolean(hasStartedNodeAudio)
        this.state.continueProgress = this.state.continueLocked ? 0 : 1
        this.refreshContinueGateState()
        this.scheduleAutoAdvanceForLine()
    }

    unlockContinueGate()
    {
        this.state.continueLocked = false
        this.state.continueProgress = 1
    }

    refreshContinueGateState()
    {
        if(!this.isRunning() || this.state.waitingChoice || this.state.node?.type !== 'line')
        {
            this.unlockContinueGate()
            return
        }

        if(!this.state.continueLocked)
        {
            this.state.continueProgress = 1
            return
        }

        const channelPlayback = this.experience?.sound?.getChannelProgress?.('dialogue')
        const isPlaying = channelPlayback?.isPlaying === true

        if(!isPlaying)
        {
            this.unlockContinueGate()
            return
        }

        this.state.continueProgress = Number.isFinite(channelPlayback?.progress)
            ? channelPlayback.progress
            : this.state.continueProgress
    }

    canContinueCurrentNode()
    {
        this.refreshContinueGateState()
        return this.state.continueLocked !== true
    }

    getContinuePromptState()
    {
        this.refreshContinueGateState()
        return {
            locked: this.state.continueLocked === true,
            progress: Number.isFinite(this.state.continueProgress) ? this.state.continueProgress : 0
        }
    }

    scheduleAutoAdvanceForLine()
    {
        this.clearAutoAdvanceTimers()
        if(!this.isRunning() || this.state.waitingChoice || this.state.node?.type !== 'line')
        {
            return
        }

        this.autoAdvancePollTimer = window.setInterval(() =>
        {
            if(!this.isRunning() || this.state.waitingChoice || this.state.node?.type !== 'line')
            {
                this.clearAutoAdvanceTimers()
                return
            }

            this.refreshContinueGateState()
            if(this.state.continueLocked)
            {
                return
            }

            this.clearAutoAdvanceTimers()
            this.autoAdvanceDelayTimer = window.setTimeout(() =>
            {
                this.autoAdvanceDelayTimer = null
                if(!this.isRunning() || this.state.waitingChoice || this.state.node?.type !== 'line')
                {
                    return
                }

                this.continue()
            }, 1000)
        }, 50)
    }

    clearAutoAdvanceTimers()
    {
        if(this.autoAdvancePollTimer !== null)
        {
            window.clearInterval(this.autoAdvancePollTimer)
            this.autoAdvancePollTimer = null
        }

        if(this.autoAdvanceDelayTimer !== null)
        {
            window.clearTimeout(this.autoAdvanceDelayTimer)
            this.autoAdvanceDelayTimer = null
        }
    }

    createActionContext(extra = {})
    {
        return {
            dialogueKey: this.state.dialogueKey,
            nodeId: this.state.nodeId,
            ...this.state.context,
            ...extra
        }
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('💬 Dialogue', { expanded: false })
        this.debugState = {
            running: false,
            key: 'none'
        }

        this.debug.addManualBinding(this.debugFolder, this.debugState, 'running', {
            label: 'Dialogue en cours',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'key', {
            label: 'Cle du dialogue courant',
            readonly: true
        }, 'auto')

        this.debug.addButton(this.debugFolder, {
            title: 'Stop Current Dialogue',
            onClick: () =>
            {
                this.queue.length = 0
                this.skip()
            }
        })

        this.debugDialogueFolder = this.debug.addFolder('🧪 Declencher un dialogue', {
            parent: this.debugFolder,
            expanded: false
        })

        const dialogueKeys = this.repository
            .getAllKeys()
            .sort((a, b) => a.localeCompare(b))

        dialogueKeys.forEach((dialogueKey) =>
        {
            this.debug.addButton(this.debugDialogueFolder, {
                title: dialogueKey,
                onClick: () =>
                {
                    if(this.isRunning())
                    {
                        this.skip()
                    }

                    this.setFlag(`dialogue.once.${dialogueKey}`, false)
                    this.startByKey(dialogueKey, {
                        fromDebug: true
                    })
                }
            })
        })

        this.debug.addButton(this.debugFolder, {
            title: 'Open Dialogue Creator',
            onClick: () =>
            {
                const targetUrl = new URL('/page.html', window.location.origin).toString()
                window.open(targetUrl, '_blank', 'noopener,noreferrer')
            }
        })

        this.on('state.dialogueDebug', () =>
        {
            this.debugState.running = this.isRunning()
            this.debugState.key = this.state.dialogueKey || 'none'
        })
    }

    destroy()
    {
        this.experience?.sound?.stopDialogue?.()
        this.clearAutoAdvanceTimers()
        this.ui.destroy()
        this.debugFolder?.dispose?.()
        this.queue.length = 0
        this.state = this.createEmptyState()
    }
}
