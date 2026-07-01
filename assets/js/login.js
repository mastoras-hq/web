(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var button = document.getElementById('submit');
  var message = document.getElementById('message');
  var returnTo = new URLSearchParams(location.search).get('returnTo') || '/advisor/';
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) returnTo = '/advisor/';

  window.mastorasAuth.getSession().then(function (session) {
    if (session) location.replace(returnTo);
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    button.disabled = true;
    message.textContent = 'Sending your secure sign-in link…';
    var result = await window.mastorasAuth.client.auth.signInWithOtp({
      email: document.getElementById('email').value.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: location.origin + '/auth/callback/?returnTo=' + encodeURIComponent(returnTo)
      }
    });
    button.disabled = false;
    message.textContent = result.error
      ? 'The link could not be sent. Check the approved email and try again.'
      : 'Check your inbox. The link can be used once and expires shortly.';
  });
}());
