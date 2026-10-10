# Culture du jour

Un quiz de culture générale par jour, à installer sur son téléphone (PWA).

- **Un thème précis par jour** (Napoléon, les volcans, Tintin, les fromages de France…), 10 questions de difficulté croissante, façon « 4 à la suite ».
- **Une fiche pour chaque erreur** : un résumé à retenir, complété par l'introduction de l'article Wikipédia (chargée à la demande, jamais stockée).
- **Bibliothèque de fiches** : recherche, fiches « à revoir » / « acquises », et un mode **Réviser mes erreurs** qui repose les questions ratées.
- **Scores** : série de jours, taux de réussite, graphique des 30 derniers jours, réussite par catégorie, historique complet.
- **Léger** : tout l'historique tient en quelques Ko dans le `localStorage` (pour chaque jour : l'id du thème et les réponses choisies). Les fiches sont reconstruites à partir des fichiers de thèmes. Export / import des données en bas de l'écran Scores.
- **Hors ligne** : un service worker garde l'app et les thèmes déjà joués en cache.

Pas de dépendance, pas de build : HTML, CSS et JavaScript natifs.

## Mise en ligne sur GitHub Pages

1. Fusionner la branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. L'app est servie sur `https://<utilisateur>.github.io/quizz-cultureG/`.

## Installer sur le téléphone

- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).

## Ajouter des thèmes

Les thèmes tournent dans l'ordre de `data/themes.json` : un par jour, puis le cycle recommence (les questions déjà vues servent alors de révision).

1. Créer `data/themes/<id>.json` :

```json
{
  "id": "mon-theme",
  "titre": "Mon thème",
  "categorie": "Histoire",
  "emoji": "🏛️",
  "accroche": "Une phrase de présentation.",
  "questions": [
    {
      "q": "La question ?",
      "choix": ["Bonne réponse", "Leurre", "Leurre", "Leurre"],
      "fiche": {
        "titre": "Sujet de la fiche",
        "texte": "Trois à cinq phrases à retenir.",
        "wiki": "Titre de l'article Wikipédia"
      }
    }
  ]
}
```

La bonne réponse est **toujours la première** du tableau `choix` : l'app mélange les propositions.

2. Lancer `node scripts/build-index.mjs` : il valide les fichiers et ajoute les nouveaux thèmes à la fin de la rotation.
3. Changer `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Développement local

```sh
python3 -m http.server 8000
# puis http://localhost:8000
```
