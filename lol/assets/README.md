# Illustration du hero

Déposer ici l'illustration affichée en haut du site, sous l'un de ces noms :

    hero.jpg   hero.jpeg   hero.png   hero.webp

La première extension présente est utilisée, les autres sont ignorées. Inutile donc de
renommer le fichier avant de le déposer.

Le site la fond dans le décor tout seul : dégradé sur les quatre bords, voile chaud,
vignette et désaturation légère. Aucun recadrage manuel n'est nécessaire.

Recommandations :

- format paysage large, idéalement 2400×1200 ou plus
- le sujet doit être à peu près centré horizontalement et dans le tiers supérieur,
  le cadrage vertical est calé sur `center 32%`
- `.jpg` de préférence, pour le poids

Tant que le fichier est absent, le hero affiche un dégradé sombre de repli : le site
reste présentable, il n'y a jamais d'image cassée.

Pour changer le cadrage, ajuster `background-position` sur `.hero-img` dans `../index.html`.
