export async function authenticatedFetch(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (response.status === 401) {
    globalThis.window?.dispatchEvent(new Event('shared-account-auth-expired'));
    throw new Error('Authentication required');
  }
  return response;
}

export async function loadDashboardData(options = {}) {
  const names = ['transactions', 'salaries', 'projects', 'investments'];
  const responses = await Promise.all(names.map(name => authenticatedFetch(`/api/${name}`, options)));
  if (responses.some(response => !response.ok)) throw new Error('Account data unavailable');
  const values = await Promise.all(responses.map(response => response.json()));
  if (values.some(value => !Array.isArray(value))) throw new Error('Invalid account data');
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}
