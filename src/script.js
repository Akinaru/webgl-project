import './style.css'
import Experience from './Experience/Experience.js'

const canvas = document.querySelector('canvas.webgl')

if(!canvas)
{
    throw new Error('Canvas ".webgl" introuvable dans index.html')
}

const experience = new Experience(canvas)
experience.dialogueManager?.startByKey?.('bloom.intro')
