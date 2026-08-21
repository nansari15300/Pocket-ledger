(function initHeroDeviceCarousels() {
  const roots = Array.from(document.querySelectorAll("[data-hero-carousel]"));
  if (roots.length === 0) return;

  roots.forEach((root) => {
    const track = root.querySelector(".device-carousel-track");
    const slides = Array.from(root.querySelectorAll(".device-carousel-slide"));
    const dots = Array.from(root.querySelectorAll(".device-carousel-dot"));
    if (!track || slides.length === 0) return;

    let index = 0;

    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === index);
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
      });
    }

    function go(delta) {
      index = (index + delta + slides.length) % slides.length;
      render();
    }

    root.querySelector(".device-carousel-btn.prev")?.addEventListener("click", (event) => {
      event.stopPropagation();
      go(-1);
    });
    root.querySelector(".device-carousel-btn.next")?.addEventListener("click", (event) => {
      event.stopPropagation();
      go(1);
    });
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        index = i;
        render();
      });
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    });

    render();
  });
})();
