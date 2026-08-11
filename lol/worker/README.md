# Déclencher la synchronisation depuis le site

Le site est statique. Il ne peut ni appeler l'API Riot — pas de CORS, et la clé serait
lisible dans la page — ni déclencher un workflow GitHub, qui demande un jeton. Ce petit
Worker Cloudflare détient le jeton et relaie une seule action : « lance la synchronisation ».

Une fois en place, le bouton **Actualiser** du site déclenche vraiment la récupération
auprès de Riot, pour vous comme pour Mehdi, sans compte GitHub.

Tout est gratuit et il n'y a rien à maintenir.

---

## 1. Créer le jeton GitHub

Sur <https://github.com/settings/personal-access-tokens/new> :

| Champ | Valeur |
|---|---|
| Token name | `no-trick-poney-sync` |
| Expiration | 1 an, ou « No expiration » |
| Repository access | **Only select repositories** → `calculateur-tdee` |
| Permissions → Repository → **Actions** | **Read and write** |

Aucune autre permission n'est nécessaire. Copier le jeton affiché : il ne sera plus
jamais montré.

Ce jeton ne donne le droit que de déclencher des workflows sur ce seul dépôt. Il ne
permet ni de lire votre code privé, ni de toucher à vos autres dépôts.

## 2. Créer le Worker

Sur <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Start with Hello
World** → **Deploy**.

Puis **Edit code**, remplacer tout le contenu par celui de [`worker.js`](worker.js), et
**Deploy**.

## 3. Renseigner les variables

Dans le Worker → **Settings** → **Variables and Secrets** :

| Nom | Type | Valeur |
|---|---|---|
| `GITHUB_TOKEN` | **Secret** | le jeton de l'étape 1 |
| `REPO` | Texte | `Corentin-Bourgeois/calculateur-tdee` |
| `ALLOWED_ORIGIN` | Texte | `https://corentin-bourgeois.github.io` |

`GITHUB_TOKEN` doit être de type **Secret**, pas Texte : il devient alors illisible depuis
l'interface.

## 4. Brancher le site

Copier l'URL du Worker, de la forme
`https://quelque-chose.votre-compte.workers.dev`, et la coller dans
[`../config.json`](../config.json) :

```json
"syncEndpoint": "https://quelque-chose.votre-compte.workers.dev"
```

Tant que ce champ est vide, le bouton se contente de relire les données déjà publiées —
le site fonctionne, simplement sans déclenchement à la demande.

---

## Vérifier

Depuis un terminal :

```bash
curl -X POST https://quelque-chose.votre-compte.workers.dev \
     -H "Origin: https://corentin-bourgeois.github.io"
```

- `{"ok":true}` : tout est en place.
- `GitHub a répondu 404` : le jeton n'a pas accès au dépôt, ou le nom dans `REPO` est faux.
- `GitHub a répondu 403` : la permission **Actions : Read and write** manque.
- `Worker mal configuré` : `GITHUB_TOKEN` ou `REPO` n'est pas défini.

## Sécurité

L'endpoint est public et vérifie l'entête `Origin`, qui est falsifiable hors navigateur.
Ce n'est donc pas une protection forte, et c'est assumé : la seule chose qu'un tiers
puisse en faire est de déclencher une synchronisation. Le jeton, lui, ne quitte jamais
Cloudflare.

Si un jour ce jeton devait fuiter, il suffit de le révoquer sur GitHub : il ne donne accès
à rien d'autre qu'au déclenchement de workflows sur ce dépôt.
