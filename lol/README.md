# Champion Ocean Challenge

Suivi du challenge « jouer tous les champions du jeu, une fois chacun, en ranked Solo/Duo »,
pour deux joueurs. Site statique, données rapatriées automatiquement depuis l'API Riot.

## Fonctionnement

L'API Riot n'est pas appelable depuis un navigateur (pas de CORS, et la clé serait publique).
Le site ne l'appelle donc jamais directement :

```
GitHub Action (toutes les 3 h)
  └─ node lol/scripts/sync.mjs   ← clé API en secret du dépôt
       └─ commit de lol/data/stats.json
            └─ lol/index.html lit ce JSON (+ Data Dragon pour la liste des champions)
```

Le site reste 100 % statique et hébergeable sur GitHub Pages, sans serveur ni coût.

## Mise en route

1. **Obtenir une clé API.** Sur [developer.riotgames.com](https://developer.riotgames.com),
   demander une **Personal API Key**. La clé de développement affichée sur la page d'accueil
   expire au bout de 24 h : elle ne convient pas pour une synchronisation automatique.

2. **Enregistrer la clé.** Dans le dépôt : `Settings → Secrets and variables → Actions →
   New repository secret`, nom `RIOT_API_KEY`.

3. **Renseigner les joueurs** dans [`config.json`](config.json) :

   ```json
   {
     "region": { "platform": "euw1", "routing": "europe" },
     "players": [
       { "id": "joueur1", "name": "Corentin", "riotId": "Pseudo#TAG", "color": "#C8AA6E" }
     ]
   }
   ```

   - `platform` : `euw1`, `eun1`, `na1`, `kr`, `br1`… (serveur de jeu)
   - `routing` : `europe` pour EUW/EUNE, `americas`, `asia`, `sea`
   - `riotId` : le Riot ID complet, visible en jeu (`Pseudo#TAG`)
   - `id` : identifiant interne, à ne plus changer une fois la synchro lancée
   - `challengeStart` : date ISO facultative (`"2026-01-15"`) pour ne compter que les
     parties postérieures. `null` = tout l'historique disponible.

4. **Lancer la première synchro** depuis l'onglet `Actions → Sync LoL challenge → Run workflow`.

5. **Activer GitHub Pages** (`Settings → Pages`, branche `main`). Le site est alors sur
   `https://<utilisateur>.github.io/calculateur-tdee/lol/`.

## Points à connaître

- **Rattrapage progressif.** Chaque exécution récupère au maximum 80 nouveaux matchs
  (limite de débit de l'API Riot : ~100 requêtes / 2 min). Un gros historique se remplit donc
  sur plusieurs exécutions ; le pied de page indique combien de matchs restent à rapatrier.
  Pour accélérer, relancer le workflow manuellement plusieurs fois de suite.
- **Profondeur d'historique.** L'API Riot ne sert pas l'intégralité de l'historique d'un compte.
  Les champions joués il y a plusieurs années peuvent ne jamais remonter.
- **Règles appliquées.** Seule la file ranked Solo/Duo (queue 420) compte. Un champion est
  validé dès qu'il a été joué, victoire non requise. Les remakes
  (`gameEndedInEarlySurrender`) sont exclus des stats comme de la validation.
- **PUUID.** Il n'est jamais écrit dans `stats.json` : il est re-résolu depuis le Riot ID à
  chaque exécution, pour ne pas exposer d'identifiant de compte dans un dépôt public.
- **Champion adverse.** Le champion d'en face sur la lane est enregistré dans `stats.json`
  (`oppChampId`) et affiché dans l'historique. Un écran de matchups pourra être ajouté plus
  tard sans avoir à retélécharger quoi que ce soit.

## Lancer la synchro en local

```bash
RIOT_API_KEY=RGAPI-xxxx node lol/scripts/sync.mjs
```

Variables optionnelles : `MAX_NEW_MATCHES` (défaut 80),
`RIOT_REQUEST_DELAY_MS` (défaut 1250).

Pour prévisualiser le site : `python3 -m http.server` à la racine du dépôt, puis
<http://localhost:8000/lol/>.
