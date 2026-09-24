import { Distributor } from '../models/Distributor.js';
import '../models/Company.js';
import { extractIds } from '../utils/filename.js';

let distributorCache = { expiresAt: 0, value: null };

async function activeDistributors() {
  if (distributorCache.value && distributorCache.expiresAt > Date.now()) return distributorCache.value;
  const value = await Distributor.find({ active: true }).populate('company').lean();
  if (value.length) distributorCache = { expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}

// Legal and filler tokens that appear in registered names but are almost never
// typed into report filenames ("(Pvt) Ltd", "& Co"). "M/S" is removed before
// tokenizing so a real initial such as "S.S" is kept.
const IGNORED_NAME_WORDS = new Set(['pvt', 'private', 'ltd', 'limited', 'and', 'the', 'of']);

// Trade words shared by hundreds of distributors. A name only matches when at
// least one of its other, distinctive words is in the filename.
const GENERIC_NAME_WORDS = new Set([
  'medicine', 'medical', 'medicose', 'company', 'co', 'trader', 'traders', 'distributor', 'distribution',
  'enterprise', 'pharma', 'pharmacy', 'pharmaceutical', 'store', 'agency', 'house', 'drug', 'service',
  'son', 'brother', 'new', 'center', 'centre',
].map(stem));

function stem(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

function normalizedWords(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\bahmed\b/g, 'ahmad')
    .replace(/\bshebaz\b/g, 'shehbaz')
    .replace(/\bsheikupura\b/g, 'sheikhupura')
    .replace(/\byaseen\b/g, 'yasin')
    .replace(/\bmanshera\b/g, 'mansehra')
    .replace(/\btts\b/g, 't t singh')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

export function distributorFilenameScore(filename, distributor) {
  const base = filename.replace(/\.[^.]+$/, '');
  const fileWordList = normalizedWords(base);
  const fileWords = new Set(fileWordList);
  // Filenames often join words ("ALNOOR"). Joined words are only searched for
  // inside a single filename word, never across word boundaries, so
  // "AL-FATEH PHARMA" cannot match "H&M PHARMA" through "fatehpharma".
  const inFileWord = (value) => fileWordList.some((word) => word.includes(value));
  const nameWords = normalizedWords(String(distributor?.name || '').replace(/\bm\s*\/\s*s\b\.?/gi, ' '))
    .filter((word) => !IGNORED_NAME_WORDS.has(word));
  const areaWords = normalizedWords(distributor?.area);

  // A joined pair of short tokens ("s"+"s", "al"+"noor") must be a whole
  // filename word, or at least 5 letters long when found inside one; otherwise
  // "m"+"a" would match inside "makkah" and "n"+"g" inside "closing".
  const joinedInFile = (value) => fileWords.has(value) || (value.length >= 5 && inFileWord(value));
  const matches = (words, index) => {
    const word = words[index];
    if (fileWords.has(word)) return true;
    if (word.length >= 4) return inFileWord(word);
    // Short tokens ("al", "nh") are too ambiguous alone; accept them only when
    // joined to a neighbouring word, e.g. "alnoor".
    return Boolean((words[index + 1] && joinedInFile(word + words[index + 1]))
      || (words[index - 1] && joinedInFile(words[index - 1] + word)));
  };
  const weight = (word) => (GENERIC_NAME_WORDS.has(word) ? 0.5 : 1);
  const overlap = (words, weigh = () => 1) => words.reduce((total, word, index) => total + (matches(words, index) ? weigh(word) : 0), 0);
  // The city is scored separately through the area, so a city inside the name
  // ("PREMIER SALES ISLAMABAD") does not make the name distinctive.
  const areaSet = new Set(areaWords);
  const distinctive = nameWords.map((word, index) => [word, index]).filter(([word]) => !GENERIC_NAME_WORDS.has(word) && !areaSet.has(word));
  const distinctiveMatched = distinctive.some(([, index]) => matches(nameWords, index));
  // The whole name written without spaces ("PHARMAZONE" for "PHARMA ZONE", or
  // the reverse) is a full match, but only when it lines up with whole
  // filename words: "AR ENTERPRISES" must not match inside "NISAR ENTERPRISES".
  const compactName = nameWords.join('');
  let wholeName = false;
  if (compactName.length >= 6) {
    for (let start = 0; start < fileWordList.length && !wholeName; start += 1) {
      let joined = '';
      for (let end = start; end < fileWordList.length && joined.length < compactName.length; end += 1) {
        joined += fileWordList[end];
        if (joined === compactName) wholeName = true;
      }
    }
  }
  const totalWeight = nameWords.reduce((total, word) => total + weight(word), 0);
  let nameScore = 0;
  if (wholeName) nameScore = 1;
  else if (!distinctive.length || distinctiveMatched) nameScore = overlap(nameWords, weight) / Math.max(totalWeight, 1);
  // Names made only of trade words ("M/S PHARMA DISTRIBUTION") are weak evidence.
  if (!distinctive.length) nameScore *= 0.75;
  const areaScore = areaWords.length ? overlap(areaWords) / areaWords.length : 0;

  // Report filenames frequently contain a shortened distributor name followed
  // by its city (for example "SHEHBAZ SHEIKHUPURA.pdf"). The city is a useful
  // discriminator, but the distributor name remains the stronger signal.
  return (nameScore * 0.7) + (areaScore * 0.3);
}

export async function suggestDistributors(filename, limit = 5) {
  const distributors = await activeDistributors();
  return distributors
    .map((distributor) => ({ distributor, score: distributorFilenameScore(filename, distributor) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ distributor, score }) => ({
      _id: distributor._id,
      name: distributor.name,
      area: distributor.area,
      company: distributor.company?.name || null,
      score: Math.round(score * 100) / 100,
    }));
}

function identity(distributor) {
  return `${normalizedWords(distributor.name).join(' ')}|${normalizedWords(distributor.area).join(' ')}`;
}

// Returns the single best match, or null when nothing scores high enough or
// when different distributors tie (e.g. the same name in two cities). Exact
// duplicate records (same name and area) are not treated as ambiguous.
export function bestByName(filename, distributors) {
  let best = [];
  let bestScore = 0;
  for (const distributor of distributors) {
    const score = distributorFilenameScore(filename, distributor);
    if (score > bestScore + 1e-9) {
      best = [distributor];
      bestScore = score;
    } else if (score > 0 && Math.abs(score - bestScore) <= 1e-9) {
      best.push(distributor);
    }
  }
  if (bestScore < 0.5) return null;
  return new Set(best.map(identity)).size === 1 ? best[0] : null;
}

// Distributors whose legacy code ("<company>-<distributor>-name.pdf") is in the filename.
async function codeCandidates(filename) {
  const ids = extractIds(filename);
  if (ids.distributorId === null) return [];
  const candidates = await Distributor.find({ distributorId: ids.distributorId, active: true }).populate('company').lean();
  const sameCompany = candidates.filter((item) => item.company?.legacyId === ids.companyId);
  return sameCompany.length ? sameCompany : candidates;
}

// Pure decision logic, separated from the database for testing.
export function chooseDistributor(filename, byCode, all) {
  const byName = bestByName(filename, all);
  if (byCode.length === 1) {
    const [candidate] = byCode;
    // A code that contradicts the distributor named in the filename is not
    // trusted (e.g. "1-1489-shehbaz sheikupura.pdf" where 1489 is another distributor).
    if (byName && identity(byName) !== identity(candidate) && distributorFilenameScore(filename, candidate) < 0.5) return null;
    return candidate;
  }
  // Distributor codes are not unique (many legacy records share 0 or 1), so
  // an ambiguous code is only trusted when the filename also names one of them.
  if (byCode.length > 1) {
    const named = bestByName(filename, byCode);
    if (named) return named;
  }
  return byName;
}

export async function resolveDistributor(filename) {
  const [byCode, all] = await Promise.all([codeCandidates(filename), activeDistributors()]);
  return chooseDistributor(filename, byCode, all);
}

function summary(distributor, score = null) {
  return { _id: distributor._id, name: distributor.name, area: distributor.area, company: distributor.company?.name || null, score };
}

// Used before conversion so the user can confirm or change the distributor.
export async function matchDistributor(filename) {
  const [byCode, all] = await Promise.all([codeCandidates(filename), activeDistributors()]);
  const match = chooseDistributor(filename, byCode, all);
  const seen = new Set();
  const suggestions = [
    ...(match ? [summary(match)] : []),
    ...(byCode.length <= 5 ? byCode.map((item) => summary(item)) : []),
    ...(await suggestDistributors(filename)),
  ].filter((item) => !seen.has(String(item._id)) && seen.add(String(item._id))).slice(0, 6);
  return { match: match ? summary(match) : null, suggestions };
}
