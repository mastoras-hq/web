(async function () {
  'use strict';

  var returnTo = new URLSearchParams(location.search).get('returnTo') || '/advisor/';
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) returnTo = '/advisor/';
  try {
    await window.mastorasAuth.requireSession();
    location.replace(returnTo);
  } catch (error) {
    document.getElementById('status').textContent = 'Sign in failed. Returning to login…';
    setTimeout(function () { location.replace('/login/'); }, 1200);
  }
}());
