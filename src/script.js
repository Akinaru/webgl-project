import Experience from './Experience/Experience.js'
import { isMobileOrTouchDevice } from './Experience/Utils/Sizes.js'

let experienceInstance = null

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
        <section class="device-warning__panel" aria-label="Compatibilite appareil">
            <h1 class="device-warning__title">Cette experience est optimisee pour ordinateur</h1>
            <p class="device-warning__text">Utilise un ecran plus grand avec clavier et souris pour une meilleure experience.</p>
        </section>
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

    experienceInstance = new Experience(canvas)
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
