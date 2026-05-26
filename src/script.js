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
        <div class="boot__home">
            <div class="boot__logo-viewer" style="transform: translateY(-32px); --boot-logo-width: 680px; --boot-logo-height: 295px;">
                <img class="boot__logo-image" src="/textures/ui/logo.png" alt="Logo Bloom" />
            </div>
            <section class="device-warning__panel" aria-label="Compatibilité appareil">
                <h1 class="device-warning__title">Cette expérience est optimisée pour ordinateur</h1>
                <p class="device-warning__text">Utilisez un écran plus grand avec clavier et souris pour une meilleure expérience.</p>
            </section>
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
