(function () {
  'use strict';

  var mobileNav = document.getElementById('mobile-nav');
  var hamburger = document.querySelector('.hamburger');

  function setMobileNavOpen(open) {
    if (!mobileNav || !hamburger) return;
    mobileNav.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  }

  if (mobileNav && hamburger) {
    hamburger.addEventListener('click', function () {
      setMobileNavOpen(!mobileNav.classList.contains('open'));
    });

    mobileNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMobileNavOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMobileNavOpen(false);
    });
  }

  var secondaryButton = document.getElementById('svc-toggle-btn');
  var secondaryContent = document.getElementById('svc-secondary-content');
  if (secondaryButton && secondaryContent) {
    secondaryButton.addEventListener('click', function () {
      var open = secondaryContent.style.display === 'none';
      secondaryContent.style.display = open ? 'block' : 'none';
      secondaryButton.textContent = open
        ? '− Also available — 4 more services'
        : '+ Also available — 4 more services';
      secondaryButton.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('.faq-q').forEach(function (button) {
    button.addEventListener('click', function () {
      var answer = button.nextElementSibling;
      if (!answer || !answer.classList.contains('faq-a')) return;
      var open = answer.classList.contains('open');

      document.querySelectorAll('.faq-a').forEach(function (item) {
        item.classList.remove('open');
      });
      document.querySelectorAll('.faq-q').forEach(function (item) {
        item.classList.remove('active');
        item.setAttribute('aria-expanded', 'false');
      });

      if (!open) {
        answer.classList.add('open');
        button.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });
}());
