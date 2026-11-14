// Evaluation of answers with the CERMAT partial-credit rules. Pure, no DOM.

export function normalizeText(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').replace(/\.$/, '').trim().toLocaleLowerCase('cs');
}

export function parseNumber(s) {
  const t = String(s ?? '').replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

function sameNumber(given, expected) {
  const g = parseNumber(given);
  return !Number.isNaN(g) && Math.abs(g - parseNumber(expected)) < 1e-9;
}

function matches(part, value, expected) {
  if (part.type === 'number') return sameNumber(value, expected);
  return normalizeText(value) !== '' && normalizeText(value) === normalizeText(expected);
}

function splitItems(value, kind) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  let items = raw.split(/[,;\n]+/);
  if (items.length === 1 && /\s/.test(raw)) items = raw.split(/\s+/);
  items = items.map((s) => s.trim()).filter(Boolean);
  return kind === 'number' ? items.map((s) => String(parseNumber(s))) : items.map(normalizeText);
}

function setErrors(part, value) {
  const want = new Set(part.kind === 'number' ? part.answer.map((s) => String(parseNumber(s))) : part.answer.map(normalizeText));
  const given = new Set(splitItems(value, part.kind));
  let errors = 0;
  for (const w of want) if (!given.has(w)) errors++;
  for (const g of given) if (!want.has(g)) errors++;
  return errors;
}

function partMax(part, taskMax, single) {
  if (part.type === 'set') return Math.max(...Object.values(part.table));
  if (part.points != null) return part.points;
  return single ? taskMax : 0;
}

// Returns {correct, points} for one part. `points` is what the part earns under "sum" scoring.
function gradePart(part, value, taskMax, single) {
  const max = partMax(part, taskMax, single);
  switch (part.type) {
    case 'choice':
    case 'match':
    case 'yesno': {
      const correct = value === part.answer;
      return { correct, points: correct ? max : 0 };
    }
    case 'number':
    case 'text': {
      const correct = [part.answer, ...(part.accept || [])].some((a) => matches(part, value, a));
      if (correct) return { correct, points: max };
      const partial = (part.partial || []).find((p) => matches(part, value, p.answer));
      return { correct: false, points: partial ? partial.points : 0 };
    }
    case 'set': {
      const errors = setErrors(part, value);
      const points = part.table[String(errors)] ?? 0;
      return { correct: errors === 0, points, errors };
    }
    case 'self': {
      const rated = typeof value === 'number';
      const points = rated ? Math.max(0, Math.min(value, max)) : 0;
      return { correct: rated && points === max, points, rated };
    }
    default:
      throw new Error(`unknown part type ${part.type}`);
  }
}

export function gradeTask(task, maxPoints, answers) {
  const single = task.parts.length === 1;
  const parts = task.parts.map((p) => ({ id: p.id, ...gradePart(p, answers[p.id], maxPoints, single) }));
  const sc = task.scoring;
  let points;
  if (sc.type === 'count') {
    const n = parts.filter((p) => p.correct).length;
    points = sc.table[String(n)] ?? 0;
  } else if (sc.type === 'all') {
    points = parts.every((p) => p.correct) ? sc.points : 0;
  } else {
    points = parts.reduce((s, p) => s + p.points, 0);
  }
  points = Math.min(points, maxPoints);
  const needsSelf = task.parts.some((p, i) => p.type === 'self' && !parts[i].rated);
  return { points, max: maxPoints, parts, needsSelf };
}

export function formatNumber(s) {
  const [int, dec] = String(s).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${grouped},${dec}` : grouped;
}

export function expectedText(part) {
  switch (part.type) {
    case 'yesno':
      return part.answer === 'A' ? 'ANO' : 'NE';
    case 'number':
      return formatNumber(part.answer) + (part.unit ? ` ${part.unit}` : '');
    case 'set':
      return part.answer.join(', ');
    default:
      return String(part.answer);
  }
}
