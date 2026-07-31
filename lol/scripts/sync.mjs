#!/usr/bin/env node
/**
 * Synchronise l'historique ranked Solo/Duo depuis l'API Riot vers lol/data/stats.json.
 *
 * Usage :
 *   RIOT_API_KEY=RGAPI-xxxx node lol/scripts/sync.mjs
 *
 * Variables d'environnement optionnelles :
 *   RIOT_REQUEST_DELAY_MS  délai entre deux appels API (défaut 1250 ms, ~96 req/2min)
 *   MAX_NEW_MATCHES        nombre max de nouveaux matchs récupérés par exécution (défaut 80)
 *
 * Le script est incrémental : il ne retélécharge jamais un match déjà présent dans
 * stats.json. La première exécution ne rattrape donc qu'une partie du backlog, les
 * suivantes finissent le travail.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOL_DIR = join(HERE, '..');
const CONFIG_PATH = join(LOL_DIR, 'config.json');
const STATS_PATH = join(LOL_DIR, 'data', 'stats.json');

const API_KEY = process.env.RIOT_API_KEY;
const REQUEST_DELAY_MS = Number(process.env.RIOT_REQUEST_DELAY_MS || 1250);
const MAX_NEW_MATCHES = Number(process.env.MAX_NEW_MATCHES || 80);

const PLACEHOLDER_RIOT_IDS = ['AAAAAA#EUW', 'BBBBBB#EUW'];

if (!API_KEY) {
  console.error('RIOT_API_KEY manquante. Ajoute-la en secret du dépôt (Settings > Secrets and variables > Actions).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCallAt = 0;

/** Appel API Riot avec throttling, retry sur 429 et 5xx. */
async function riot(url, { retries = 5 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = REQUEST_DELAY_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    let res;
    try {
      res = await fetch(url, { headers: { 'X-Riot-Token': API_KEY } });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * 2 ** attempt);
      continue;
    }

    if (res.ok) return res.json();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || 10);
      console.warn(`  rate limit atteint, pause de ${retryAfter}s`);
      await sleep((retryAfter + 1) * 1000);
      continue;
    }

    if (res.status >= 500 && attempt < retries) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }

    const body = await res.text().catch(() => '');
    const error = new Error(`Riot API ${res.status} sur ${url}\n${body}`);
    error.status = res.status;
    throw error;
  }
  throw new Error(`Échec après ${retries} tentatives : ${url}`);
}

function parseRiotId(riotId) {
  const [gameName, tagLine] = String(riotId).split('#');
  if (!gameName || !tagLine) {
    throw new Error(`Riot ID invalide : "${riotId}" (format attendu : Pseudo#TAG)`);
  }
  return { gameName: gameName.trim(), tagLine: tagLine.trim() };
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Récupère les identifiants de matchs ranked, du plus récent au plus ancien. */
async function fetchMatchIds(routing, puuid, queue, startTime) {
  const ids = [];
  for (let start = 0; start < 1000; start += 100) {
    const params = new URLSearchParams({ queue: String(queue), type: 'ranked', start: String(start), count: '100' });
    if (startTime) params.set('startTime', String(startTime));
    const page = await riot(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`);
    ids.push(...page);
    if (page.length < 100) break;
  }
  return ids;
}

/** Extrait de la réponse match-v5 les seules données utiles au site, pour un joueur. */
function extractMatch(match, puuid) {
  const info = match.info;
  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

  const role = me.teamPosition || me.individualPosition || '';
  const opponent = info.participants.find(
    (p) => p.teamId !== me.teamId && (p.teamPosition || p.individualPosition || '') === role && role !== '',
  );

  return {
    id: match.metadata.matchId,
    ts: info.gameEndTimestamp || info.gameCreation,
    dur: info.gameDuration,
    remake: Boolean(me.gameEndedInEarlySurrender),
    champId: me.championId,
    champ: me.championName,
    role: role || 'UNKNOWN',
    win: Boolean(me.win),
    k: me.kills,
    d: me.deaths,
    a: me.assists,
    cs: (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0),
    gold: me.goldEarned || 0,
    // Champion adverse sur la même lane : conservé pour un éventuel écran matchups.
    oppChampId: opponent ? opponent.championId : null,
    oppChamp: opponent ? opponent.championName : null,
  };
}

/** Classement Solo/Duo. Optionnel : une erreur ici ne doit pas casser la synchro. */
async function fetchRank(platform, puuid) {
  try {
    const entries = await riot(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
    const solo = (entries || []).find((e) => e.queueType === 'RANKED_SOLO_5x5');
    if (!solo) return null;
    return {
      tier: solo.tier,
      division: solo.rank,
      lp: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
    };
  } catch (err) {
    console.warn(`  classement indisponible (${err.status || err.message})`);
    return null;
  }
}

async function main() {
  const config = await loadJson(CONFIG_PATH, null);
  if (!config) throw new Error(`config.json introuvable à ${CONFIG_PATH}`);

  const { platform, routing } = config.region;
  const queue = config.queue ?? 420;
  const startTime = config.challengeStart ? Math.floor(new Date(config.challengeStart).getTime() / 1000) : null;

  const stats = await loadJson(STATS_PATH, { players: {} });
  stats.players = stats.players || {};

  let budget = MAX_NEW_MATCHES;
  let added = 0;

  for (const player of config.players) {
    console.log(`\n▸ ${player.name} (${player.riotId})`);

    if (PLACEHOLDER_RIOT_IDS.includes(player.riotId)) {
      console.warn('  Riot ID encore à sa valeur d\'exemple, joueur ignoré. Édite lol/config.json.');
      continue;
    }

    const { gameName, tagLine } = parseRiotId(player.riotId);

    // Le PUUID est volontairement re-résolu à chaque exécution plutôt que stocké :
    // il n'a rien à faire dans un fichier commité sur un dépôt public.
    let account;
    try {
      account = await riot(
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      );
    } catch (err) {
      if (err.status === 404) {
        console.error(`  Riot ID introuvable : "${player.riotId}". Vérifie l'orthographe et le tag.`);
        continue;
      }
      throw err;
    }

    const entry = stats.players[player.id] || {};
    let existing = entry.matches || [];

    // challengeStart borne aussi les matchs déjà en base : sans ça, restreindre la période
    // dans config.json ne ferait qu'arrêter d'en ajouter, sans retirer les anciens.
    if (startTime) {
      const before = existing.length;
      existing = existing.filter((m) => m.ts >= startTime * 1000);
      if (before !== existing.length) {
        console.log(`  ${before - existing.length} match(s) hors période retiré(s)`);
      }
    }

    const known = new Set(existing.map((m) => m.id));

    entry.riotId = player.riotId;
    entry.name = player.name;
    entry.rank = await fetchRank(platform, account.puuid);

    // L'API ne sert que le classement courant, sans historique : la courbe de LP ne peut
    // exister que si on relève le rang à chaque passage. On n'ajoute un point que lorsque
    // quelque chose a bougé, sinon le fichier grossirait à chaque exécution du cron.
    if (entry.rank) {
      const hist = entry.rankHistory || [];
      const dernier = hist[hist.length - 1];
      const inchange = dernier
        && dernier.tier === entry.rank.tier
        && dernier.division === entry.rank.division
        && dernier.lp === entry.rank.lp;
      if (!inchange) {
        hist.push({ ts: Date.now(), ...entry.rank });
      }
      entry.rankHistory = hist.slice(-800);
    }

    const allIds = await fetchMatchIds(routing, account.puuid, queue, startTime);
    const missing = allIds.filter((id) => !known.has(id));
    console.log(`  ${allIds.length} matchs ranked côté Riot, ${known.size} déjà en base, ${missing.length} à récupérer`);

    // Les plus récents d'abord, pour que le site soit à jour même si le backlog est long.
    const toFetch = missing.slice(0, Math.max(0, budget));
    for (const [i, matchId] of toFetch.entries()) {
      try {
        const match = await riot(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
        const row = extractMatch(match, account.puuid);
        if (row) {
          existing.push(row);
          added++;
        }
      } catch (err) {
        console.warn(`  match ${matchId} ignoré : ${err.status || err.message}`);
      }
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${toFetch.length}`);
    }
    budget -= toFetch.length;

    if (missing.length > toFetch.length) {
      entry.backlog = missing.length - toFetch.length;
      console.log(`  ${entry.backlog} matchs restants pour les prochaines exécutions`);
    } else {
      delete entry.backlog;
    }

    existing.sort((a, b) => b.ts - a.ts);
    entry.matches = existing;
    stats.players[player.id] = entry;
  }

  stats.generatedAt = new Date().toISOString();
  stats.queue = queue;
  stats.region = config.region;
  stats.challengeStart = config.challengeStart || null;

  await writeFile(STATS_PATH, JSON.stringify(stats, null, 2) + '\n');
  console.log(`\n✓ ${added} nouveau(x) match(s) écrit(s) dans ${STATS_PATH}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
