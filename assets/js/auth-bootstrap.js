(function () {
  'use strict';

  var SUPABASE_URL = 'https://pxrfgltynqdceyozpovq.supabase.co';
  // Publishable browser key: safe to expose only because all business tables
  // deny anon/authenticated direct access. Never place the service-role key here.
  var SUPABASE_PUBLISHABLE_KEY = 'MASTORAS_SUPABASE_PUBLISHABLE_KEY';
  var API_ORIGIN = 'https://api.mastoras.uk';

  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Pinned Supabase client failed to load.');
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  var nativeFetch = window.fetch.bind(window);

  async function session() {
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session;
  }

  async function requireSession() {
    var current = await session();
    if (!current) {
      var returnTo = location.pathname + location.search;
      location.replace('/login/?returnTo=' + encodeURIComponent(returnTo));
      throw new Error('Authentication required');
    }
    return current;
  }

  async function authenticatedFetch(input, init) {
    var url = typeof input === 'string' ? input : input.url;
    if (!url || !url.startsWith(API_ORIGIN)) return nativeFetch(input, init);

    var current = await requireSession();
    var options = Object.assign({}, init || {});
    var headers = new Headers(options.headers || (input instanceof Request ? input.headers : {}));
    headers.set('Authorization', 'Bearer ' + current.access_token);
    options.headers = headers;

    var response = await nativeFetch(input, options);
    if (response.status !== 401) return response;

    var refreshed = await client.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      await client.auth.signOut();
      location.replace('/login/');
      return response;
    }
    headers.set('Authorization', 'Bearer ' + refreshed.data.session.access_token);
    return nativeFetch(input, options);
  }

  async function signOut() {
    await client.auth.signOut();
    location.replace('/login/');
  }

  window.mastorasAuth = {
    client: client,
    getSession: session,
    requireSession: requireSession,
    signOut: signOut
  };
  window.fetch = authenticatedFetch;
}());
