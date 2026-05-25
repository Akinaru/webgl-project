import SceneEnum from '../Enum/SceneEnum.js'

export default class LoadingPhrases
{
    constructor()
    {
        this.phrases = {
            [`null_to_${SceneEnum.MAP}`]: "Éveil de l'écosystème de Bloom...",
            [`${SceneEnum.MAP}_to_${SceneEnum.RECUPERATION}`]: "Préparation de la zone de récupération des ressources...",
            [`${SceneEnum.RECUPERATION}_to_${SceneEnum.RECYCLAGE}`]: "Initialisation des processus de recyclage...",
            [`${SceneEnum.RECYCLAGE}_to_${SceneEnum.DISTRIBUTION}`]: "Configuration du réseau de distribution...",
            'default': "Chargement en cours..."
        }
    }

    /**
     * Récupère la phrase correspondante à une transition entre deux scènes.
     * @param {string} fromKey - La clé de la scène de départ.
     * @param {string} toKey - La clé de la scène de destination.
     * @returns {string} La phrase d'attente.
     */
    getPhrase(fromKey, toKey)
    {
        const transitionKey = `${fromKey}_to_${toKey}`
        return this.phrases[transitionKey] || this.phrases['default']
    }
}
