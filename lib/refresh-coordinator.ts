/** Coalesce polling, but preserve a required reload after a mutation. */
export function createRefreshCoordinator() {
  let active: Promise<void> | null = null;
  function run(load: () => Promise<void>, required = false): Promise<void> {
    if (active) return required ? active.then(() => run(load), () => run(load)) : active;
    const request = Promise.resolve().then(load);
    active = request;
    void request.finally(() => { if (active === request) active = null; }).catch(() => {});
    return request;
  }
  return { run };
}
