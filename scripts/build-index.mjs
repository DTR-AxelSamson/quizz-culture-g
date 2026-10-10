// Valide les fichiers data/themes/*.json et met à jour data/themes.json (l'ordre de passage des thèmes).
// Les thèmes déjà présents gardent leur place ; les nouveaux sont ajoutés à la fin.
// Usage : node scripts/build-index.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data/themes');
const indexPath = join(root, 'data/themes.json');

const errors = [];
const themes = new Map();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const where = `data/themes/${file}`;
  let t;
  try { t = JSON.parse(readFileSync(join(dir, file), 'utf8')); } catch (e) { errors.push(`${where}: JSON invalide (${e.message})`); continue; }
  if (`${t.id}.json` !== file) errors.push(`${where}: l'id "${t.id}" ne correspond pas au nom du fichier`);
  for (const k of ['titre', 'categorie', 'emoji', 'accroche']) if (!t[k]) errors.push(`${where}: champ "${k}" manquant`);
  if (!Array.isArray(t.questions) || t.questions.length < 5) errors.push(`${where}: au moins 5 questions attendues`);
  (t.questions || []).forEach((q, i) => {
    const w = `${where} #${i + 1}`;
    if (!q.q) errors.push(`${w}: question vide`);
    if (!Array.isArray(q.choix) || q.choix.length !== 4) errors.push(`${w}: 4 choix attendus`);
    else if (new Set(q.choix.map((c) => c.trim().toLowerCase())).size !== 4) errors.push(`${w}: choix en double`);
    if (!q.fiche?.titre || !q.fiche?.texte || !q.fiche?.wiki) errors.push(`${w}: fiche incomplète (titre, texte, wiki)`);
  });
  themes.set(t.id, t);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const previous = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
const order = previous.map((t) => t.id).filter((id) => themes.has(id));
for (const id of themes.keys()) if (!order.includes(id)) order.push(id);

const index = order.map((id) => {
  const { titre, categorie, emoji } = themes.get(id);
  return { id, titre, categorie, emoji };
});
writeFileSync(indexPath, `[\n${index.map((t) => '  ' + JSON.stringify(t)).join(',\n')}\n]\n`);
console.log(`${index.length} thèmes, ${[...themes.values()].reduce((s, t) => s + t.questions.length, 0)} questions → data/themes.json`);
