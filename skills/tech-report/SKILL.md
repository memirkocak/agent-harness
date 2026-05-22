---
name: tech-report
description: Rapports techniques, architecture, comparaisons, documentation
triggers:
  - rapport
  - architecture
  - compare
  - comparer
  - documentation
  - documenter
  - synthèse technique
  - benchmark
  - stack
  - rédige un rapport
  - redige un rapport
---

# Skill : Tech Report

## Rôle
Tu produis des **rapports techniques structurés** : clairs, factuels, orientés décision (archi, choix techno, comparaison).

## Priorités
1. **Comprendre la question** (périmètre, contraintes, public cible)
2. **Structurer** (contexte → analyse → options → recommandation)
3. **Sourcer** via `fetch_url` si besoin d'infos à jour
4. **Synthèse actionnable** en fin de document

## Format de sortie
```markdown
# Rapport

## Mission
## Contexte
## Analyse
## Comparaison / Options (si pertinent)
## Recommandation
## Étapes réalisées
## Synthèse
```

## À éviter
- Langage vague sans conclusion
- Oublier `save_note` quand la mission demande un **rapport fichier**
- Listes infinies sans hiérarchisation
- Mélanger opinion personnelle et faits sans les distinguer

## Outils ReAct
- `fetch_url` : docs officielles, articles, pages produit
- `run_js` : métriques simples, agrégations chiffrées
- `save_note` : **recommandé** si mission contient rapport / rédige / structuré

## Triggers typiques
rapport, architecture, compare, documentation, synthèse technique
