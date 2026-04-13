export default class Metier
{
    constructor({
        id,
        label,
        color,
        initialValue = 0
    })
    {
        this.id = id
        this.label = label
        this.color = color
        this.value = 0

        this.setValue(initialValue)
    }

    setValue(nextValue)
    {
        if(!Number.isFinite(nextValue))
        {
            throw new Error(`Valeur invalide pour le metier "${this.id}": ${nextValue}`)
        }

        this.value = nextValue
        return this.value
    }

    add(amount)
    {
        if(!Number.isFinite(amount))
        {
            throw new Error(`Montant invalide pour le metier "${this.id}": ${amount}`)
        }

        this.value += amount
        return this.value
    }
}
