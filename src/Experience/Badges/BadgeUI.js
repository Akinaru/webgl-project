import * as BadgeConstants from './Badges.constants.js'

export default class BadgeUI
{
    constructor(badgeManager)
    {
        this.badgeManager = badgeManager
        this.badgeElementsByKey = new Map()
        this.notificationHideTimer = null
        this.notificationClearTimer = null

        this.setElements()
        this.setEvents()
    }

    setElements()
    {
        this.root = document.createElement('aside')
        this.root.className = 'activity-badges'
        this.root.setAttribute('aria-live', 'polite')

        this.progressTrack = document.createElement('div')
        this.progressTrack.className = 'activity-badges__track'

        this.progressRail = document.createElement('div')
        this.progressRail.className = 'activity-badges__rail'
        this.progressTrack.appendChild(this.progressRail)

        this.progressFill = document.createElement('div')
        this.progressFill.className = 'activity-badges__fill'
        this.progressRail.appendChild(this.progressFill)

        this.badgeList = document.createElement('div')
        this.badgeList.className = 'activity-badges__list'

        const activities = this.badgeManager.getActivities()
        activities.forEach((activity) =>
        {
            const badgeElement = this.createBadgeElement(activity)
            this.badgeElementsByKey.set(activity.key, badgeElement)
            this.badgeList.appendChild(badgeElement)
        })

        this.notification = document.createElement('div')
        this.notification.className = 'activity-badges__notification'
        this.notification.setAttribute('role', 'status')

        this.notificationTitle = document.createElement('p')
        this.notificationTitle.className = 'activity-badges__notification-title'
        this.notificationTitle.textContent = 'Badge obtenu'
        this.notification.appendChild(this.notificationTitle)

        this.notificationText = document.createElement('p')
        this.notificationText.className = 'activity-badges__notification-text'
        this.notification.appendChild(this.notificationText)

        this.root.appendChild(this.progressTrack)
        this.root.appendChild(this.badgeList)
        this.root.appendChild(this.notification)
        document.body.appendChild(this.root)
    }

    createBadgeElement(activity)
    {
        const item = document.createElement('div')
        item.className = 'activity-badges__item'
        item.dataset.activityKey = activity.key
        item.setAttribute('title', activity.label)

        const frame = document.createElement('div')
        frame.className = 'activity-badges__frame'
        frame.style.setProperty('--badge-frame-image', `url("${BadgeConstants.BADGE_FRAME_PATH}")`)
        item.appendChild(frame)

        const icon = document.createElement('img')
        icon.className = 'activity-badges__icon'
        icon.src = activity.iconPath
        icon.alt = activity.label
        frame.appendChild(icon)

        return item
    }

    setEvents()
    {
        this.badgeManager.on('state.badgeUI', (payload) =>
        {
            this.renderState(payload)
        })

        this.badgeManager.on('unlock.badgeUI', (payload) =>
        {
            this.renderUnlockNotification(payload)
        })
    }

    renderState(payload = {})
    {
        const activities = Array.isArray(payload.activities) ? payload.activities : []
        const progressRatio = Number.isFinite(payload.progressRatio) ? payload.progressRatio : 0

        this.progressFill.style.width = `${Math.max(0, Math.min(1, progressRatio)) * 100}%`

        activities.forEach((activity) =>
        {
            const badgeElement = this.badgeElementsByKey.get(activity.key)
            if(!badgeElement)
            {
                return
            }

            badgeElement.classList.toggle('is-unlocked', activity.unlocked === true)
        })
    }

    renderUnlockNotification(payload = {})
    {
        const activityLabel = payload.activity?.label || 'Badge debloque'
        this.notificationText.textContent = activityLabel
        this.notification.classList.remove('is-hiding')
        this.notification.classList.add('is-visible')

        this.clearNotificationTimers()

        this.notificationHideTimer = window.setTimeout(() =>
        {
            this.notification.classList.add('is-hiding')
            this.notificationHideTimer = null
        }, BadgeConstants.NOTIFICATION_DURATION_MS)

        this.notificationClearTimer = window.setTimeout(() =>
        {
            this.notification.classList.remove('is-visible')
            this.notification.classList.remove('is-hiding')
            this.notificationClearTimer = null
        }, BadgeConstants.NOTIFICATION_DURATION_MS + BadgeConstants.NOTIFICATION_HIDE_DELAY_MS)
    }

    clearNotificationTimers()
    {
        if(this.notificationHideTimer !== null)
        {
            window.clearTimeout(this.notificationHideTimer)
            this.notificationHideTimer = null
        }

        if(this.notificationClearTimer !== null)
        {
            window.clearTimeout(this.notificationClearTimer)
            this.notificationClearTimer = null
        }
    }

    destroy()
    {
        this.clearNotificationTimers()
        this.badgeElementsByKey.clear()
        this.root.remove()
    }
}
