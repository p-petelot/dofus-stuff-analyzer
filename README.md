# Dofus Couture

Dofus Couture est une maison de direction artistique pour les créateurs de skins Dofus. Dépose, colle ou importe une image de référence et l'application extrait instantanément les couleurs dominantes pour imaginer des collections harmonieuses.

## Lancer le projet

```bash
npm install
npm run dev
```

La page est disponible sur http://localhost:3000.

## Construire pour la production

```bash
npm run build
npm start
```

## Fonctionnalités principales

- Glisser-déposer ou coller une image depuis le presse-papiers.
- Visualisation de l'aperçu directement dans l'atelier.
- Extraction rapide des teintes principales avec codes Hex et RGB affichés en anneau hexagonal.
- Copie en un clic (clic ou tap) pour intégrer les couleurs dans ton outil favori.

## Ressources DofusDB

- L'API publique de DofusDB est disponible via `https://api.dofusdb.fr/` et expose des collections comme `items`, `sets` ou `weapons` (documentation embarquée dans le site officiel).
- L'accès direct depuis cette sandbox retourne actuellement une réponse HTTP 403 (voir `curl https://api.dofusdb.fr/items?lang=fr&size=1`). Il faudra prévoir un proxy côté serveur ou ajouter les en-têtes attendus par DofusDB (référent, User-Agent navigateur) pour consommer les données en production.
