import MetierEnum from '../Enum/MetierEnum.js'
import ActionId from './ActionId.js'

export const ACTION_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: ActionId.BLOOM_ROLE_INVENTEUR_CHOSEN,
        label: 'Choix du role inventeur',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.INVENTEUR,
                amount: 3
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_ROLE_MENEUR_CHOSEN,
        label: 'Choix du role meneur',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.MENEUR,
                amount: 3
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_ROLE_TRAVAILLEUR_CHOSEN,
        label: 'Choix du role travailleur',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.TRAVAILLEUR,
                amount: 3
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_ROLE_BOTANISTE_CHOSEN,
        label: 'Choix du role botaniste',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.BOTANISTE,
                amount: 3
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_BONUS_BOTANISTE_GRANTED,
        label: 'Bonus botaniste accorde',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.BOTANISTE,
                amount: 1
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_BONUS_TRAVAILLEUR_GRANTED,
        label: 'Bonus travailleur accorde',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.TRAVAILLEUR,
                amount: 1
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_BONUS_MENEUR_GRANTED,
        label: 'Bonus meneur accorde',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.MENEUR,
                amount: 1
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.BLOOM_BONUS_INVENTEUR_GRANTED,
        label: 'Bonus inventeur accorde',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.INVENTEUR,
                amount: 1
            })
        ]),
        category: 'dialogue'
    }),
    Object.freeze({
        id: ActionId.MAP_TREE_OBSERVED_CLOSE,
        label: 'Observer un arbre de pres',
        effects: Object.freeze([
            Object.freeze({
                metier: MetierEnum.BOTANISTE,
                amount: 1
            })
        ]),
        category: 'exploration'
    })
])

export const ACTION_DEFINITIONS_BY_ID = Object.freeze(
    ACTION_DEFINITIONS.reduce((definitionsById, definition) =>
    {
        definitionsById[definition.id] = definition
        return definitionsById
    }, {})
)
