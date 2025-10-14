# Dofus Stuff Analyzer (V1 API)

Expose une route `GET /api/analyze?url=...` qui renvoie :
- titre, chaîne
- description (utilisée pour la détection)
- lien DofusBook s’il est présent
- transcript (extrait)
- candidats d’items (heuristique)
- classe + éléments (déduction simple)

## Déploiement Vercel

1) **Créer un nouveau projet** sur vercel.com → "New Project" → Import depuis Git
2) Sélectionner ce repo
3) Runtime: Node 18+ (par défaut, OK)
4) Build command: `next build` (par défaut)
5) Output: .vercel/output (géré par Next)
6) Déployer

> Rien à configurer côté env pour la V1.
> Si Vercel demande des permissions, accepter par défaut.

## Test

