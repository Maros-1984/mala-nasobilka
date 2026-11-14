// Task pool filtering and the endless practice queue. Pure, no DOM.

export const taskKey = (t) => `${t.t}#${t.n}`;

export function filterPool(index, f) {
  const tests = new Map(index.tests.map((t) => [t.id, t]));
  return index.tasks.filter((task) => {
    const test = tests.get(task.t);
    return test
      && f.subjects.includes(test.subject)
      && f.points.includes(task.points)
      && test.year >= f.yearFrom && test.year <= f.yearTo;
  });
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Tasks of one test sharing a source text form one unit, kept in task order.
function units(tasks) {
  const byGroup = new Map();
  const out = [];
  for (const t of tasks) {
    if (!t.group) {
      out.push([t]);
      continue;
    }
    const k = `${t.t}/${t.group}`;
    if (!byGroup.has(k)) {
      byGroup.set(k, []);
      out.push(byGroup.get(k));
    }
    byGroup.get(k).push(t);
  }
  out.forEach((u) => u.sort((a, b) => a.n - b.n));
  return out;
}

/**
 * Endless queue. Each cycle serves every unsolved task of the pool once, in random
 * order with shared-text groups kept together. A task reported wrong is re-inserted
 * `retryGap` positions later. When everything is solved, a new cycle serves all tasks.
 */
export function createQueue(pool, { rng = Math.random, solved = new Set(), retryGap = 5 } = {}) {
  let queue = [];

  function refill() {
    let todo = pool.filter((t) => !solved.has(taskKey(t)));
    if (!todo.length) {
      solved.clear();
      todo = pool.slice();
    }
    queue = shuffle(units(todo), rng).flat();
  }

  return {
    next() {
      if (!pool.length) return null;
      if (!queue.length) refill();
      return queue[0];
    },
    report(task, correct) {
      const i = queue.findIndex((t) => taskKey(t) === taskKey(task));
      if (i >= 0) queue.splice(i, 1);
      if (correct) {
        solved.add(taskKey(task));
      } else {
        queue.splice(Math.min(retryGap, queue.length), 0, task);
      }
    },
    /** The task after the current one, for prefetching. */
    peekNext() {
      return queue[1] || null;
    },
    get solved() {
      return solved;
    },
  };
}
