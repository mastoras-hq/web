if (window.Lenis) {
  new window.Lenis({
    autoRaf: true,
    duration: 1.2,
    easing: (time) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
  });
}
