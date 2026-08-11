/**
 * Intermédiaire minimal entre le site et GitHub Actions.
 *
 * Le site est statique : il ne peut ni appeler l'API Riot (pas de CORS, et la clé serait
 * publique), ni déclencher un workflow GitHub (il faudrait un jeton dans la page). Ce
 * Worker détient le jeton et se contente de relayer une seule action : « lance la
 * synchronisation ».
 *
 * Variables à définir côté Cloudflare :
 *   GITHUB_TOKEN     jeton à portée fine, droit Actions en écriture sur le dépôt (secret)
 *   REPO             ex. Corentin-Bourgeois/calculateur-tdee
 *   ALLOWED_ORIGIN   ex. https://corentin-bourgeois.github.io
 *   WORKFLOW         facultatif, défaut lol-sync.yml
 *   BRANCH           facultatif, défaut main
 */

const DEFAUT_WORKFLOW = 'lol-sync.yml';
const DEFAUT_BRANCHE = 'main';

export default {
  async fetch(request, env) {
    const origineAutorisee = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origineAutorisee,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return reponse({ erreur: 'Méthode non autorisée' }, 405, cors);
    }

    // Garde-fou simple : l'endpoint est public, on limite au site déclaré. Ce n'est pas
    // une protection forte — l'entête Origin est falsifiable hors navigateur — mais le
    // pire qu'un tiers puisse faire ici est de déclencher une synchronisation.
    const origine = request.headers.get('Origin');
    if (origineAutorisee !== '*' && origine && origine !== origineAutorisee) {
      return reponse({ erreur: 'Origine non autorisée' }, 403, cors);
    }

    if (!env.GITHUB_TOKEN || !env.REPO) {
      return reponse({ erreur: 'Worker mal configuré : GITHUB_TOKEN ou REPO manquant' }, 500, cors);
    }

    const workflow = env.WORKFLOW || DEFAUT_WORKFLOW;
    const branche = env.BRANCH || DEFAUT_BRANCHE;

    const r = await fetch(
      `https://api.github.com/repos/${env.REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'no-trick-poney-challenge',
          'Content-Type': 'application/json',
        },
        // duree_minutes à 0 : un seul passage, puisque c'est un déclenchement à la demande.
        body: JSON.stringify({ ref: branche, inputs: { duree_minutes: '0' } }),
      },
    );

    if (r.status === 204) {
      return reponse({ ok: true }, 200, cors);
    }

    const detail = await r.text().catch(() => '');
    return reponse({ erreur: `GitHub a répondu ${r.status}`, detail: detail.slice(0, 300) }, 502, cors);
  },
};

function reponse(corps, status, cors) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
