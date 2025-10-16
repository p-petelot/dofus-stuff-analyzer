# Theme overlay setup
Import `/public/tokens.css` first dans `pages/_app.js`, puis `/public/overlay.css` pour appliquer la charte.
Liez-les avec `import '../public/tokens.css'` suivi de `import '../public/overlay.css'` dans l'entrée applicative.
`.btn` et `button` héritent des styles de boutons; `.card` active les panneaux gravés; `.badge` affiche l'accent métallisé.
Conservez vos classes actuelles et ajoutez seulement celles-ci si nécessaire pour bénéficier des tokens.
Focus visibles: outline vert/or basé sur `--color-accent` pour tout élément interactif.
Assurez-vous que chaque visuel ait un attribut alt descriptif ou un équivalent aria-label.
Vérifiez contrastes ≥4.5:1 et navigabilité complète au clavier sur cartes, boutons et navigation.
Palette: bg #0E1116, surface #121722, texte #E6ECFF, muted #7A8399, primaire #4DD77C, accent #D9A441, border #223146.
Polices: Inter (sans), Cinzel (display) via Google Fonts libres à auto-héberger si nécessaire.
