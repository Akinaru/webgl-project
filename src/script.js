import Experience from './Experience/Experience.js'
import { isMobileOrTouchDevice } from './Experience/Utils/Sizes.js'

let experienceInstance = null
const HIDE_UI_BODY_CLASS = 'is-ui-hidden'

function readBooleanUrlParam(paramName)
{
    const rawValue = new URLSearchParams(window.location.search).get(paramName)
    if(typeof rawValue !== 'string')
    {
        return false
    }

    const normalizedValue = rawValue.trim().toLowerCase()
    return normalizedValue === 'true' || normalizedValue === '1'
}

const shouldHideUi = readBooleanUrlParam('hideui')
document.body.classList.toggle(HIDE_UI_BODY_CLASS, shouldHideUi)

function showDesktopRecommendationScreen()
{
    if(document.querySelector('.device-warning'))
    {
        return
    }

    document.body.classList.add('is-device-blocked')

    const warning = document.createElement('main')
    warning.className = 'device-warning'
    warning.setAttribute('role', 'main')
    warning.innerHTML = `
        <div class="device-warning__mobile-layout">
            <h1 class="device-warning__title">Cette expérience est optimisée pour ordinateur</h1>
            <p class="device-warning__text">Utilisez un écran plus grand avec clavier et souris pour une meilleure expérience.</p>
            <video
                class="device-warning__teaser"
                src="/teaser.mov"
                autoplay
                loop
                playsinline
                aria-hidden="true"
            ></video>
        </div>
    `
    document.body.append(warning)
}

function hideDesktopRecommendationScreen()
{
    document.body.classList.remove('is-device-blocked')
    const warning = document.querySelector('.device-warning')
    warning?.remove?.()
}

function startExperience()
{
    if(experienceInstance)
    {
        return
    }

    const canvas = document.querySelector('canvas.webgl')
    if(!canvas)
    {
        throw new Error('Canvas ".webgl" introuvable dans index.html')
    }

    experienceInstance = new Experience(canvas, {
        hideUi: shouldHideUi
    })
}

function applyDeviceGate()
{
    if(isMobileOrTouchDevice())
    {
        showDesktopRecommendationScreen()
        return
    }

    hideDesktopRecommendationScreen()
    startExperience()
}

applyDeviceGate()
window.addEventListener('resize', applyDeviceGate)
