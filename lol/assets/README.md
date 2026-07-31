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

# Vidéos d'intro

Déposer ici les deux vidéos jouées après le choix du combattant :

    intro-corentin.mp4
    intro-mehdi.mp4

Le `.webm` est accepté en second choix (`intro-corentin.webm`), utile si vous voulez
un fichier plus léger pour les navigateurs qui le supportent.

Recommandations :

- format paysage, 1920×1080, quelques secondes suffisent
- viser moins de 10 Mo par vidéo : elles se chargent au clic, pas avant
- le son est autorisé, le clic sur le combattant vaut geste utilisateur

Tant qu'un fichier est absent, le choix mène directement au site sans vidéo, sans
message d'erreur. Un bouton « Passer l'intro » est toujours disponible.
