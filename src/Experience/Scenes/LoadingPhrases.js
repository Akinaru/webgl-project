import SceneEnum from '../Enum/SceneEnum.js'

export default class LoadingPhrases
{
    constructor()
    {
        this.phrases = [
            "Altera est une cité reconstruite sur les ruines du capitalisme depuis 2050.",
            "Bloom te guidera. Écoute-la : elle connaît chaque goutte de cette cité.",
            "À Altera, l’eau n’a pas de prix… mais elle a une valeur. Chaque geste compte.",
            "Certains choix semblent petits. Ils sont en réalité décisifs.",
            "Ici, on ne possède pas l’eau. On la garde, on la partage, on la respecte."
        ]
        this.lastIndex = -1
    }

    /**
     * Récupère une phrase d'attente aléatoire.
     * @returns {string} La phrase d'attente.
     */
    getRandomPhrase()
    {
        if(this.phrases.length === 0)
        {
            return "Chargement en cours..."
        }

        let index = Math.floor(Math.random() * this.phrases.length)
        
        // Évite de répéter la même phrase deux fois de suite si possible
        if(index === this.lastIndex && this.phrases.length > 1)
        {
            index = (index + 1) % this.phrases.length
        }

        this.lastIndex = index
        return this.phrases[index]
    }

    /**
     * Récupère la phrase correspondante à une transition entre deux scènes.
     * @param {string} fromKey - La clé de la scène de départ.
     * @param {string} toKey - La clé de la scène de destination.
     * @returns {string} La phrase d'attente.
     */
    getPhrase(fromKey, toKey)
    {
        return this.getRandomPhrase()
    }
}
