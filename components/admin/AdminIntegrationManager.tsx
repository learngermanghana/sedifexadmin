'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Link2, RefreshCw, ShieldCheck, ShieldX, Store } from 'lucide-react';

type StoreOption = { id: string; name: string; email?: string };
type KeyInfo = {
  id: string;
  storeId: string;
  name: string;
  websiteUrl: string;
  keyPreview: string;
  source: string;
  status: string;
  createdAt: string | null;
  canRevoke: boolean;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';
const apiUrl = '/api/admin/integration-keys';

export default function AdminIntegrationManager({ stores }: { stores: StoreOption[] }) {
  const [storeId, setStoreId] = useState('');
  const [name, setName] = useState('Client website');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!storeId) {
      setKeys([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(apiUrl + '?storeId=' + encodeURIComponent(storeId), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to load keys.');
        setKeys(body.keys || []);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load keys.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [storeId, reload]);

  function selectStore(nextId: string) {
    setStoreId(nextId);
    setToken('');
    setCopied(false);
    setMessage('');
    setError('');
    setWebsiteUrl('');
  }

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !name.trim() || working) return;
    setWorking(true);
    setToken('');
    setCopied(false);
    setError('');
    setMessage('');
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, name, websiteUrl }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Creation failed.');
      setToken(body.token);
      setMessage('Integration created. Copy this key now; it cannot be retrieved later.');
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed.');
    } finally {
      setWorking(false);
    }
  }

  async function revokeKey(key: KeyInfo) {
    if (!storeId || working || !window.confirm('Revoke "' + key.name + '"? Its website integration will stop working immediately after the API receives this change.')) return;
    setWorking(true);
    setError('');
    setMessage('');
    setToken('');
    try {
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, keyId: key.id }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Revocation failed.');
      setMessage('Integration revoked. Update the client website with a new key before reconnecting.');
      setReload(value => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revocation failed.');
    } finally {
      setWorking(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError('Clipboard access failed. Select and copy the token manually.');
    }
  }

  const selectedStore = stores.find(store => store.id === storeId);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700"><Link2 className="h-4 w-4" /> Website Integration Setup</div>
          <h2 className="text-xl font-bold text-slate-950">Create a client integration without their login</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Select a Sedifex store, issue a dedicated website key, then configure that key in the client website&apos;s server environment. Client passwords are never used.</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" /> Platform admins only</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Store className="h-4 w-4" /> Client store</span>
            <select className={inputClass} value={storeId} onChange={e => selectStore(e.target.value)}>
              <option value="">Choose a client store…</option>
              {stores.map(store => <option key={store.id} value={store.id}>{store.name}{store.email ? ' · ' + store.email : ''}</option>)}
            </select>
          </label>
          {selectedStore ? <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">Store ID: {selectedStore.id}</p> : null}

          <form onSubmit={createKey} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Integration name</span>
              <input className={inputClass} required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Client website" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Website URL (optional)</span>
              <input className={inputClass} type="url" pattern="https://.*" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://client-website.com" />
              <span className="mt-1 block text-xs text-slate-500">For identification only; it does not restrict where a stolen key can be used.</span>
            </label>
            <button disabled={!storeId || !name.trim() || working} type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              <KeyRound className="h-4 w-4" /> {working ? 'Working…' : 'Create integration key'}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
          {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
          {token ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-950"><KeyRound className="h-4 w-4" /> New secret · displayed only once</p>
              <p className="mt-2 text-xs text-amber-900">Save this as a server-side environment variable, never in frontend source code or a public repository.</p>
              <div className="mt-3 break-all rounded-lg border border-amber-200 bg-white p-3 font-mono text-xs text-slate-900" aria-label="One-time integration secret">{token}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copyToken} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy key'}</button>
                <button type="button" onClick={() => { setToken(''); setCopied(false); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700">Hide key</button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-slate-950 p-5 text-sm text-white">
            <p className="mb-3 font-semibold">Client website configuration</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-200">SEDIFEX_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net{'\n'}SEDIFEX_STORE_ID={storeId || 'SELECT_A_STORE'}{'\n'}SEDIFEX_INTEGRATION_API_KEY={'<copy-key-once>'}{'\n'}SEDIFEX_CONTRACT_VERSION=2026-04-13</pre>
            <p className="mt-3 text-xs leading-5 text-slate-400">Call Sedifex APIs from the website backend with x-api-key and X-Sedifex-Contract-Version headers. Do not place the secret in NEXT_PUBLIC or VITE variables.</p>
          </div>
        </div>
      </div>

      {storeId ? (
        <div className="mt-7 border-t border-slate-200 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-950">Existing integrations for {selectedStore?.name || storeId}</h3>
            <button type="button" onClick={() => setReload(value => value + 1)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>
          {loading ? <p className="text-sm text-slate-500">Loading store keys…</p> : keys.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No keys found for this store.</p> : (
            <div className="space-y-2">
              {keys.map(key => (
                <div key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{key.name} <span className={'ml-2 rounded-full px-2 py-1 text-xs ' + (key.status === 'revoked' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>{key.status}</span></p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">{key.keyPreview} · {key.source} · {key.createdAt ? new Date(key.createdAt).toLocaleDateString() : 'Date unknown'}</p>
                    {key.websiteUrl ? <p className="mt-1 break-all text-xs text-slate-500">{key.websiteUrl}</p> : null}
                  </div>
                  {key.canRevoke && key.status !== 'revoked' ? (
                    <button type="button" disabled={working} onClick={() => revokeKey(key)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><ShieldX className="h-4 w-4" /> Revoke</button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">Legacy keys are visible here for reference but require a separate rotation process. Creation and revocation are recorded in Sedifex admin audit logs.</p>
        </div>
      ) : null}
    </section>
  );
}
