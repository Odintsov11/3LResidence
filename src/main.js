
/**
 * 3L Residences — main.js
 * Modules: config, utils, CMS data readers, brands accordion,
 * divider reveals, counters, tabbed sliders, Swiper, guestroom tabs,
 * heading animations, bootstrap. Everything is scoped inside an IIFE.
 */
(() => {
  "use strict";

  /* ── 1. Config ─────────────────────────────────── */

  const CONFIG = {
    slider: {
      autoplayDelay: 5000,
      imageInDuration: 0.7,
      imageOutDuration: 0.5,
      staggerIn: 0.15,
      staggerOut: 0.05,
    },
    divider: {
      bottomOffset: 72,
      borderRadius: 16,
      sideOffsetDesktop: 72,
      sideOffsetMobile: 16,
      sideRevealPortion: 30,
    },
    counters: {
      duration: 1.5,
    },
    guestroomTabs: {
      retryAttempts: 10,
      retryDelay: 200,
    },
    resizeDebounce: 250,
  };

  const REDUCED_MOTION =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  /* ── 2. Utils ──────────────────────────────────── */

  function debounce(fn, wait = 100) {
    let timeout;

    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const requestScrollRefresh = debounce(() => {
    if (typeof ScrollTrigger !== "undefined") {
      ScrollTrigger.refresh();
    }
  }, 200);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toInt(value, fallback = 0) {
    const number = parseInt(value, 10);

    return Number.isFinite(number) ? number : fallback;
  }

  const imageLoader = (() => {
    const cache = new Map();

    return {
      load(url) {
        if (!url) {
          return Promise.resolve(null);
        }

        if (!cache.has(url)) {
          cache.set(
            url,
            new Promise((resolve) => {
              const image = new Image();

              image.decoding = "async";
              image.fetchPriority = "low";

              image.onload = () => resolve(image);
              image.onerror = () => resolve(null);
              image.src = url;
            })
          );
        }

        return cache.get(url);
      },
    };
  })();

  /* ── 3. Slider data from hidden CMS nodes ──────── */

  function readSlidersData() {
    const items = document.querySelectorAll(".js-data-tabs");
    const grouped = {};

    items.forEach((item) => {
      const group = (item.getAttribute("data-group") || "default")
        .toLowerCase()
        .trim();

      const images = Array.from(
        item.querySelectorAll(".js-slider-image-source")
      )
        .map((image) => {
          const url = (
            image.currentSrc ||
            image.getAttribute("src") ||
            ""
          ).trim();

          const alt = (image.getAttribute("alt") || "").trim();

          return {
            url,
            alt,
          };
        })
        .filter((image) => image.url);

      const slide = {
        group,
        tabName: (item.getAttribute("data-tab") || "").trim(),
        title: (item.getAttribute("data-title") || "").trim(),
        description: (item.getAttribute("data-desc") || "").trim(),
        gridTemplate: (item.getAttribute("data-grid") || "default")
          .toLowerCase()
          .trim(),
        order: toInt(item.getAttribute("data-order")),
        images,
      };

      (grouped[group] ??= []).push(slide);
    });

    Object.values(grouped).forEach((slides) => {
      slides.sort((a, b) => a.order - b.order);
    });

    return grouped;
  }

  /* ── 4a. Brands accordion ──────────────────────── */

  function initBrandsAccordion() {
    const accordion = document.querySelector(".brands_accordion");
    const mask = document.querySelector(".brands_mask");

    if (!accordion || !mask) return;

    if (accordion.dataset.initialized === "true") return;
    accordion.dataset.initialized = "true";

    const items = Array.from(accordion.querySelectorAll(".brands_item"));

    const images = Array.from(mask.querySelectorAll(".brands_image"));

    const positions = Array.from(
      accordion.querySelectorAll(".brands_position")
    );

    const thumbnailContainer = mask.querySelector(".brands_thumbnail");

    if (!items.length || !images.length || !thumbnailContainer) {
      return;
    }

    let activeImage = images[0] || null;
    let activeThumbnailUrl = "";

    // Invalidates in-flight thumbnail loads when hover changes.
    let hoverToken = 0;

    /*
     * Начальное состояние основных изображений
     */
    images.forEach((image, index) => {
      gsap.set(image, {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: index === 0 ? 10 : 1,
        clipPath: index === 0 ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
      });
    });

    /*
     * Начальное состояние thumbnail
     */
    gsap.set(thumbnailContainer, {
      opacity: 0,
      y: 80,
      pointerEvents: "none",
    });

    /*
     * Подготовка CMS-позиций.
     * Изображение НЕ грузится заранее — только при первом hover.
     * Пустые CMS-поля (w-dyn-bind-empty / плейсхолдер) не считаются thumbnail.
     */
    positions.forEach((position) => {
      const source = position.querySelector(".brands_position-source");

      const thumbnailUrl =
        source?.currentSrc || source?.getAttribute("src") || "";

      const isEmpty =
        !thumbnailUrl || source.classList.contains("w-dyn-bind-empty");

      if (isEmpty) {
        position.classList.remove("has_thumbnail");
        return;
      }

      position.classList.add("has_thumbnail");
      position.dataset.thumbnail = thumbnailUrl;
    });

    /*
     * Hover по позиции материала
     */
    accordion.addEventListener("mouseover", (event) => {
      const position = event.target.closest(".brands_position.has_thumbnail");

      if (!position || !accordion.contains(position)) {
        return;
      }

      if (event.relatedTarget && position.contains(event.relatedTarget)) {
        return;
      }

      showThumbnail(position.dataset.thumbnail);
    });

    accordion.addEventListener("mouseout", (event) => {
      const position = event.target.closest(".brands_position.has_thumbnail");

      if (!position || !accordion.contains(position)) {
        return;
      }

      if (event.relatedTarget && position.contains(event.relatedTarget)) {
        return;
      }

      hideThumbnail();
    });

    /*
     * Клик по заголовку аккордеона
     */
    accordion.addEventListener("click", (event) => {
      const heading = event.target.closest(".brands_heading");

      if (!heading || !accordion.contains(heading)) {
        return;
      }

      const item = heading.closest(".brands_item");

      if (!item) return;

      const itemIndex = items.indexOf(item);
      const isActive = item.classList.contains("is-active");

      hideThumbnail();

      if (isActive) {
        closeItem(item);
        showImage(0);
        return;
      }

      items.forEach((currentItem) => {
        if (currentItem.classList.contains("is-active")) {
          closeItem(currentItem);
        }
      });

      openItem(item);
      showImage(itemIndex);
    });

    /*
     * Начальное состояние аккордеона:
     * первая комната открыта
     */
    items.forEach((item, index) => {
      const isActive = index === 0;

      const heading = item.querySelector(".brands_heading");
      const content = item.querySelector(".brands_content");
      const icon = item.querySelector(".brands_icon");
      const line = item.querySelector(".brands_accordion-line");

      item.classList.toggle("is-active", isActive);
      content?.classList.toggle("is-active", isActive);
      icon?.classList.toggle("is-active", isActive);

      heading?.setAttribute("aria-expanded", String(isActive));

      if (content) {
        gsap.set(content, {
          height: isActive ? "auto" : 0,
          overflow: "hidden",
        });
      }

      if (line) {
        gsap.set(line, {
          width: isActive ? 0 : "100%",
        });
      }

      if (icon) {
        gsap.set(icon, {
          rotation: isActive ? 45 : 0,
          opacity: isActive ? 0.2 : 1,
        });
      }
    });

    function openItem(item) {
      const heading = item.querySelector(".brands_heading");
      const content = item.querySelector(".brands_content");
      const icon = item.querySelector(".brands_icon");
      const line = item.querySelector(".brands_accordion-line");

      item.classList.add("is-active");
      content?.classList.add("is-active");
      icon?.classList.add("is-active");

      heading?.setAttribute("aria-expanded", "true");

      if (content) {
        gsap.to(content, {
          height: "auto",
          duration: 0.5,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (line) {
        gsap.to(line, {
          width: 0,
          duration: 0.5,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (icon) {
        gsap.to(icon, {
          rotation: 45,
          opacity: 0.2,
          duration: 0.5,
          ease: "power2.out",
          overwrite: true,
        });
      }
    }

    function closeItem(item) {
      const heading = item.querySelector(".brands_heading");
      const content = item.querySelector(".brands_content");
      const icon = item.querySelector(".brands_icon");
      const line = item.querySelector(".brands_accordion-line");

      item.classList.remove("is-active");
      content?.classList.remove("is-active");
      icon?.classList.remove("is-active");

      heading?.setAttribute("aria-expanded", "false");

      if (content) {
        gsap.to(content, {
          height: 0,
          duration: 0.4,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (line) {
        gsap.to(line, {
          width: "100%",
          duration: 0.4,
          ease: "power2.out",
          overwrite: true,
        });
      }

      if (icon) {
        gsap.to(icon, {
          rotation: 0,
          opacity: 1,
          duration: 0.4,
          ease: "power2.out",
          overwrite: true,
        });
      }
    }

    function showImage(index) {
      const nextImage = images[index];

      if (!nextImage || nextImage === activeImage) {
        return;
      }

      const previousImage = activeImage;
      activeImage = nextImage;

      gsap.killTweensOf(images);

      const timeline = gsap.timeline();

      if (previousImage) {
        timeline.to(previousImage, {
          clipPath: "inset(0 100% 0 0)",
          duration: 0.4,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(previousImage, {
              zIndex: 1,
            });
          },
        });
      }

      timeline
        .set(
          nextImage,
          {
            zIndex: 10,
            clipPath: "inset(0 100% 0 0)",
          },
          0.3
        )
        .to(
          nextImage,
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 0.4,
            ease: "power2.out",
          },
          0.4
        );
    }

    /*
     * Ленивая загрузка thumbnail: изображение запрашивается
     * при первом hover, дальше берётся из кэша imageLoader.
     */
    async function showThumbnail(url) {
      if (!url) return;

      const token = ++hoverToken;

      const image = await imageLoader.load(url);

      // Курсор уже ушёл или картинка не загрузилась.
      if (token !== hoverToken || !image) {
        return;
      }

      gsap.killTweensOf(thumbnailContainer);

      if (activeThumbnailUrl !== url) {
        activeThumbnailUrl = url;

        thumbnailContainer.style.backgroundImage = `url("${url}")`;

        gsap.set(thumbnailContainer, {
          opacity: 0,
          y: 50,
        });
      }

      gsap.to(thumbnailContainer, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "power2.out",
        overwrite: true,
      });
    }

    function hideThumbnail() {
      hoverToken += 1;

      gsap.killTweensOf(thumbnailContainer);

      gsap.to(thumbnailContainer, {
        opacity: 0,
        y: 80,
        duration: 0.3,
        ease: "power2.in",
        overwrite: true,
      });
    }
  }

  /* ── 4b. Divider image reveals ─────────────────── */

  function initDividerReveals() {
    const dividers = gsap.utils
      .toArray(".divider_wrapper")
      .filter((divider) => {
        return (
          !divider.matches("[data-no-reveal]") &&
          !divider.querySelector('img[fetchpriority="high"]')
        );
      });

    if (!dividers.length) {
      return;
    }

    const { bottomOffset, borderRadius, sideRevealPortion } = CONFIG.divider;

    if (REDUCED_MOTION) {
      dividers.forEach((divider) => {
        gsap.set(divider, {
          clipPath: "none",
        });
      });

      return;
    }

    const clamp = gsap.utils.clamp(0, 1);
    const media = gsap.matchMedia();

    media.add(
      {
        isDesktop: "(min-width: 992px)",
        isMobile: "(max-width: 991px)",
      },
      (context) => {
        const sideOffset = context.conditions.isDesktop
          ? CONFIG.divider.sideOffsetDesktop
          : CONFIG.divider.sideOffsetMobile;

        dividers.forEach((divider) => {
          gsap.set(divider, {
            clipPath: `inset(0px ${sideOffset}px 100% ${sideOffset}px round ${borderRadius}px)`,
            z: 0,
          });

          const state = {
            percent: 100,
          };

          gsap.to(state, {
            percent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: divider,
              start: `top bottom-=${bottomOffset}px`,
              end: `bottom bottom-=${bottomOffset}px`,
              scrub: 0.25,
              onToggle: (self) => {
                divider.style.willChange = self.isActive ? "clip-path" : "auto";
              },
            },
            onUpdate: () => {
              const sideProgress = clamp(1 - state.percent / sideRevealPortion);

              const side = (sideOffset * (1 - sideProgress)).toFixed(2);

              divider.style.clipPath = `inset(0px ${side}px ${state.percent.toFixed(
                2
              )}% ${side}px round ${borderRadius}px)`;
            },
          });
        });
      }
    );

    return () => media.revert();
  }

  /* ── 4c. Counters ──────────────────────────────── */

  function initCounters() {
    const section = document.querySelector(".section_parameters");

    if (!section) {
      return;
    }

    const formatNumber = (number) => {
      return Math.floor(number).toLocaleString("en-US");
    };

    section.querySelectorAll(".parameters_number").forEach((element) => {
      const raw = element.textContent.trim();

      const value = parseFloat(raw.replace(/[^\d.]/g, ""));

      const suffix = raw.replace(/[\d.,]/g, "");

      if (!Number.isFinite(value)) {
        return;
      }

      if (REDUCED_MOTION) {
        gsap.set(element, {
          opacity: 1,
        });

        return;
      }

      const counter = {
        value: 0,
      };

      const trigger = {
        trigger: section,
        start: "top 75%",
        toggleActions: "play none none reset",
      };

      gsap.to(counter, {
        value,
        duration: CONFIG.counters.duration,
        ease: "power1.out",
        scrollTrigger: trigger,
        onUpdate: () => {
          element.textContent = `${formatNumber(counter.value)}${suffix}`;
        },
      });

      gsap.fromTo(
        element,
        {
          opacity: 0.1,
        },
        {
          opacity: 1,
          duration: CONFIG.counters.duration,
          scrollTrigger: trigger,
        }
      );
    });
  }

  /* ── 4d. Tabbed sliders (ARIA tabs pattern) ────── */

  let sliderUid = 0;

  function createTabbedSlider(root, slides) {
    const tabsList = root.querySelector(".slider_tabs-list");
    const contentItem = root.querySelector(".slider_content-item");
    const imageGrid = root.querySelector(".slider_image-grid");

    if (!tabsList || !contentItem || !imageGrid || !slides.length) {
      return;
    }

    const {
      autoplayDelay,
      imageInDuration,
      imageOutDuration,
      staggerIn,
      staggerOut,
    } = CONFIG.slider;

    const isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    const state = {
      index: 0,
      inView: false,
      hovered: false,
      animating: false,
      progressTween: null,
    };

    // Guards against images of a previous slide landing after a switch.
    let renderVersion = 0;

    const canPlay = () => {
      return state.inView && !state.hovered && !state.animating;
    };

    // Unique id base per slider instance for tab/panel wiring.
    const uid = root.getAttribute("slider-group") || `slider-${++sliderUid}`;
    const panelId = `panel-${uid}`;

    tabsList.innerHTML = "";
    tabsList.setAttribute("role", "tablist");
    tabsList.setAttribute("aria-label", `${uid} slides`);

    contentItem.setAttribute("role", "tabpanel");
    contentItem.id = panelId;
    contentItem.setAttribute("aria-labelledby", `tab-${uid}-0`);

    const tabsFragment = document.createDocumentFragment();

    slides.forEach((slide, index) => {
      const tab = document.createElement("button");
      const isFirst = index === 0;

      tab.type = "button";
      tab.id = `tab-${uid}-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panelId);
      tab.setAttribute("aria-selected", isFirst ? "true" : "false");
      // Roving tabindex: only the active tab is in the Tab order.
      tab.setAttribute("tabindex", isFirst ? "0" : "-1");

      tab.className = `slider_tab-button${isFirst ? " is-active" : ""}`;

      tab.innerHTML =
        `<div class="slider_time-overlay"></div>` +
        `<div class="slider_tab-text">${escapeHtml(
          slide.tabName || `Tab ${index + 1}`
        )}</div>`;

      tab.addEventListener("click", () => {
        if (state.index === index || state.animating) {
          return;
        }

        switchToSlide(index);
      });

      if (!isTouchDevice) {
        tab.addEventListener("mouseenter", () => {
          state.hovered = true;
          state.progressTween?.pause();
        });

        tab.addEventListener("mouseleave", () => {
          state.hovered = false;
          resumeAutoplay();
        });
      }

      tabsFragment.appendChild(tab);
    });

    tabsList.appendChild(tabsFragment);

    const tabButtons = tabsList.querySelectorAll(".slider_tab-button");

    // Arrow-key navigation between tabs.
    tabsList.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }

      event.preventDefault();

      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = (state.index + dir + slides.length) % slides.length;

      switchToSlide(next);
      tabButtons[next].focus();
    });

    function renderContent(slide) {
      contentItem.innerHTML =
        `<h3>${escapeHtml(slide.title || "")}</h3>` +
        `<p>${escapeHtml(slide.description || "")}</p>`;
    }

    async function appendImages(slide, version) {
      const images = (slide.images || []).filter((image) => image?.url);

      if (!images.length) {
        return;
      }

      const loadedImages = await Promise.all(
        images.map((image) => {
          return imageLoader.load(image.url);
        })
      );

      // User may have switched slides while images were loading.
      if (version !== renderVersion) {
        return;
      }

      const fragment = document.createDocumentFragment();
      const masks = [];

      images.forEach((imageData, index) => {
        const mask = document.createElement("div");

        mask.className = "slider_image-mask";

        const image = loadedImages[index]
          ? loadedImages[index].cloneNode()
          : document.createElement("img");

        if (!loadedImages[index]) {
          image.src = imageData.url;
        }

        image.className = "slider_image";
        image.alt = imageData.alt || "";

        mask.appendChild(image);

        gsap.set(mask, {
          clipPath: "inset(0 100% 0 0)",
        });

        fragment.appendChild(mask);
        masks.push(mask);
      });

      // Re-check before touching the DOM.
      if (version !== renderVersion) {
        return;
      }

      imageGrid.appendChild(fragment);

      gsap.to(masks, {
        clipPath: "inset(0 0% 0 0)",
        duration: imageInDuration,
        stagger: staggerIn,
        ease: "power2.out",
      });

      requestScrollRefresh();
    }

    function resetOverlays() {
      tabButtons.forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-selected", "false");
        button.setAttribute("tabindex", "-1");

        const overlay = button.querySelector(".slider_time-overlay");

        if (overlay) {
          gsap.killTweensOf(overlay);

          gsap.set(overlay, {
            width: "0%",
          });
        }
      });
    }

    function switchToSlide(index) {
      if (index < 0 || index >= slides.length || state.animating) {
        return;
      }

      state.animating = true;

      state.progressTween?.kill();
      state.progressTween = null;

      resetOverlays();

      state.index = index;

      const activeTab = tabButtons[index];

      activeTab.classList.add("is-active");
      activeTab.setAttribute("aria-selected", "true");
      activeTab.setAttribute("tabindex", "0");
      contentItem.setAttribute("aria-labelledby", activeTab.id);

      const slide = slides[index];

      const oldMasks = imageGrid.querySelectorAll(".slider_image-mask");

      const onSwapComplete = () => {
        const version = ++renderVersion;

        imageGrid.innerHTML = "";

        renderContent(slide);

        imageGrid.setAttribute("grid-template", slide.gridTemplate);

        appendImages(slide, version);

        state.animating = false;

        startAutoplay();
      };

      if (oldMasks.length) {
        gsap.to(oldMasks, {
          clipPath: "inset(0 100% 0 0)",
          duration: imageOutDuration,
          stagger: staggerOut,
          ease: "power2.in",
          onComplete: onSwapComplete,
        });
      } else {
        onSwapComplete();
      }
    }

    function startAutoplay() {
      if (!canPlay()) {
        return;
      }

      state.progressTween?.kill();

      const overlay = tabButtons[state.index]?.querySelector(
        ".slider_time-overlay"
      );

      if (!overlay) {
        return;
      }

      state.progressTween = gsap.fromTo(
        overlay,
        {
          width: "0%",
        },
        {
          width: "100%",
          duration: autoplayDelay / 1000,
          ease: "none",
          overwrite: true,
          onComplete: () => {
            if (canPlay()) {
              switchToSlide((state.index + 1) % slides.length);
            }
          },
        }
      );
    }

    function resumeAutoplay() {
      if (!canPlay()) {
        return;
      }

      if (state.progressTween?.paused()) {
        state.progressTween.play();
      } else {
        startAutoplay();
      }
    }

    renderContent(slides[0]);

    imageGrid.setAttribute("grid-template", slides[0].gridTemplate);

    root.style.display = "";

    let initialImagesRequested = false;

    function loadInitialImages() {
      if (initialImagesRequested) {
        return;
      }

      initialImagesRequested = true;

      const initialVersion = ++renderVersion;

      appendImages(slides[0], initialVersion);
    }

    /*
     * Загружаем изображения первого таба только тогда,
     * когда слайдер приблизился к viewport.
     */
    if ("IntersectionObserver" in window) {
      const imageObserver = new IntersectionObserver(
        (entries, observer) => {
          const entry = entries[0];

          if (!entry?.isIntersecting) {
            return;
          }

          observer.disconnect();
          loadInitialImages();
        },
        {
          rootMargin: "600px 0px",
          threshold: 0,
        }
      );

      imageObserver.observe(root);
    } else {
      loadInitialImages();
    }

    ScrollTrigger.create({
      trigger: root,
      start: "top 95%",
      end: "bottom 5%",
      onToggle: (self) => {
        state.inView = self.isActive;

        if (self.isActive) {
          loadInitialImages();
          resumeAutoplay();
        } else {
          state.progressTween?.pause();
        }
      },
    });
  }

  /* ── 4e. Swiper ────────────────────────────────── */

  const CLIP_HIDDEN = "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)";

  const CLIP_VISIBLE = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";

  function initSwipers() {
    if (typeof Swiper === "undefined") {
      return null;
    }

    const swiperElements = document.querySelectorAll(".swiper");

    swiperElements.forEach((swiperElement) => {
      if (swiperElement.swiper) {
        return;
      }

      const wrapper = Array.from(swiperElement.children).find((element) =>
        element.classList.contains("swiper-wrapper")
      );

      const slides = wrapper
        ? Array.from(wrapper.children).filter((element) =>
            element.classList.contains("swiper-slide")
          )
        : [];

      if (!slides.length) {
        return;
      }

      const reveal = (elements) => {
        const freshSlides = elements.filter((slide) => !slide.dataset.revealed);

        if (!freshSlides.length) {
          return;
        }

        freshSlides.forEach((slide) => {
          slide.dataset.revealed = "1";
        });

        gsap.to(freshSlides, {
          clipPath: CLIP_VISIBLE,
          duration: 0.7,
          ease: "power2.out",
          stagger: 0.12,
        });
      };

      const hide = (slide) => {
        delete slide.dataset.revealed;

        gsap.set(slide, {
          clipPath: CLIP_HIDDEN,
        });
      };

      const usesListSemantics = wrapper?.getAttribute("role") === "list";

      new Swiper(swiperElement, {
        slidesPerView: "auto",
        spaceBetween: 32,
        speed: 600,
        a11y: {
          enabled: true,
          slideRole: usesListSemantics ? "listitem" : "group",
        },
        keyboard: {
          enabled: true,
          onlyInViewport: true,
        },
        breakpoints: {
          320: {
            slidesPerView: 1.1,
            spaceBetween: 16,
          },
          768: {
            slidesPerView: 1.5,
          },
          1024: {
            slidesPerView: 2.5,
            spaceBetween: 32,
          },
        },
        on: {
          init() {
            gsap.set(slides, {
              clipPath: CLIP_HIDDEN,
            });

            const visibleCount = Math.ceil(this.params.slidesPerView) + 1;

            reveal(Array.from(slides).slice(0, visibleCount));
          },

          slideChange() {
            const visibleEnd =
              this.activeIndex + Math.ceil(this.params.slidesPerView) + 1;

            reveal(Array.from(slides).slice(this.activeIndex, visibleEnd));

            Array.from(slides).forEach((slide, index) => {
              if (index < this.activeIndex - 1 || index > visibleEnd) {
                hide(slide);
              }
            });
          },
        },
      });
    });

    return {
      refresh: () => {
        swiperElements.forEach((swiperElement) => {
          swiperElement.swiper?.update();
        });
      },
    };
  }

  /* ── 4f. Guestroom tabs ────────────────────────── */

  function initGuestroomTabs() {
    const { retryAttempts, retryDelay } = CONFIG.guestroomTabs;

    // Swiper may not be initialised yet — retry a few times.
    (function waitForSwiper(attempt = 0) {
      const swiperElement = document.querySelector(".swiper-guestroom");

      const tabs = swiperElement
        ?.querySelector(".tabs")
        ?.querySelectorAll(".slider_tab-button");

      if (swiperElement?.swiper && tabs?.length) {
        bindTabs(swiperElement, Array.from(tabs));
      } else if (attempt < retryAttempts) {
        setTimeout(() => waitForSwiper(attempt + 1), retryDelay);
      }
    })();

    function bindTabs(swiperElement, tabs) {
      const swiper = swiperElement.swiper;

      const slides = Array.from(
        swiperElement.querySelectorAll(".swiper-slide")
      );

      const firstIndex = Math.max(
        slides.findIndex((slide) => slide.dataset.room === "first"),
        0
      );

      const secondIndex = slides.findIndex(
        (slide) => slide.dataset.room === "second"
      );

      const lastIndex = slides.length - 1;

      if (secondIndex === -1) {
        return;
      }

      // ARIA tabs pattern for the static Webflow markup.
      const tabsWrapper = swiperElement.querySelector(".tabs");

      if (tabsWrapper) {
        tabsWrapper.setAttribute("role", "tablist");
        tabsWrapper.setAttribute("aria-label", "Guestroom slides");
      }

      tabs.forEach((tab, index) => {
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
        tab.setAttribute("tabindex", index === 0 ? "0" : "-1");
      });

      const activateTab = (index) => {
        swiper.slideTo(index === 0 ? firstIndex : secondIndex, 300);
      };

      tabs.forEach((tab, index) => {
        tab.addEventListener("click", (event) => {
          event.preventDefault();
          activateTab(index);
        });
      });

      tabsWrapper?.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }

        event.preventDefault();

        const current = tabs.findIndex(
          (tab) => tab.getAttribute("aria-selected") === "true"
        );

        const next =
          (Math.max(current, 0) +
            (event.key === "ArrowRight" ? 1 : -1) +
            tabs.length) %
          tabs.length;

        activateTab(next);
        tabs[next].focus();
      });

      function updateTabsState() {
        const currentIndex = swiper.activeIndex;

        const activeTab = currentIndex >= secondIndex ? 1 : 0;

        tabs.forEach((tab, index) => {
          const isActive = index === activeTab;

          tab.classList.toggle("is-active", isActive);
          tab.setAttribute("aria-selected", isActive ? "true" : "false");
          tab.setAttribute("tabindex", isActive ? "0" : "-1");

          const overlay = tab.querySelector(".slider_time-overlay");

          if (!overlay) {
            return;
          }

          let progress = 0;

          if (isActive) {
            const groupStart = index === 0 ? firstIndex : secondIndex;

            const groupEnd = index === 0 ? secondIndex - 1 : lastIndex;

            const total = Math.max(groupEnd - groupStart, 1);

            progress =
              currentIndex >= groupEnd
                ? 1
                : gsap.utils.clamp(
                    0.1,
                    1,
                    0.1 + ((currentIndex - groupStart) / total) * 0.9
                  );
          }

          gsap.to(overlay, {
            width: `${progress * 100}%`,
            duration: 0.3,
            ease: "power1.out",
            overwrite: true,
          });
        });
      }

      swiper.on("slideChange", updateTabsState);

      swiper.on("resize", debounce(updateTabsState, 200));

      updateTabsState();
    }
  }

  function prepareGuestroomSwiper() {
    const root = document.querySelector(".swiper-guestroom");

    if (!root) {
      return;
    }

    if (root.dataset.slidesPrepared === "true") {
      return;
    }

    const targetWrapper = root.querySelector(":scope > .js-guestroom-wrapper");

    const sources = root.querySelector(".guestroom_sources");

    const galleries = Array.from(
      root.querySelectorAll(".guestroom_sources .js-guestroom-gallery")
    );

    if (!targetWrapper || !sources || !galleries.length) {
      console.warn("[3L] Guestroom swiper structure is incomplete.");

      return;
    }

    const fragment = document.createDocumentFragment();

    galleries.slice(0, 2).forEach((gallery, galleryIndex) => {
      const room = galleryIndex === 0 ? "first" : "second";

      /*
       * Класс .js-guestroom-slide стоит на Collection List,
       * а настоящие слайды — его прямые дочерние элементы.
       */
      const sourceList = gallery.querySelector(".js-guestroom-slide");

      if (!sourceList) {
        return;
      }

      const slides = Array.from(sourceList.children).filter((element) =>
        element.classList.contains("swiper-slide")
      );

      slides.forEach((slide) => {
        slide.dataset.room = room;

        /*
         * Удаляем возможные состояния от прежней
         * ошибочной инициализации.
         */
        slide.classList.remove(
          "swiper-slide-active",
          "swiper-slide-next",
          "swiper-slide-prev",
          "swiper-slide-visible",
          "swiper-slide-fully-visible"
        );

        slide.removeAttribute("data-revealed");
        slide.removeAttribute("style");

        fragment.appendChild(slide);
      });
    });

    if (!fragment.childNodes.length) {
      console.warn("[3L] No guestroom slides were found.");

      return;
    }

    targetWrapper.replaceChildren(fragment);

    /*
     * После переноса исходные CMS-обёртки пустые.
     */
    sources.remove();

    root.dataset.slidesPrepared = "true";
  }

  /* ── 4g. Heading animations ────────────────────── */

  function initHeadingAnimations() {
    const headings = document.querySelectorAll(".heading-style-h2");

    if (!headings.length) {
      return;
    }

    if (typeof SplitText === "undefined") {
      return;
    }

    if (REDUCED_MOTION) {
      return;
    }

    const splits = new Map();

    headings.forEach((heading) => {
      const split = new SplitText(heading, {
        type: "words",
        wordsClass: "gsap_split_word",
      });

      splits.set(heading, split);

      gsap.set(split.words, {
        opacity: 0.15,
      });
    });

    ScrollTrigger.batch(".heading-style-h2", {
      start: "top 80%",

      onEnter: (enteredHeadings) => {
        enteredHeadings.forEach((heading) => {
          const split = splits.get(heading);

          if (!split) {
            return;
          }

          gsap.to(split.words, {
            opacity: 1,
            duration: 0.4,
            stagger: 0.05,
            ease: "power2.out",
          });
        });
      },

      onLeaveBack: (leftHeadings) => {
        leftHeadings.forEach((heading) => {
          const split = splits.get(heading);

          if (!split) {
            return;
          }

          gsap.set(split.words, {
            opacity: 0.15,
          });
        });
      },
    });
  }

  /* ── 5. Bootstrap ──────────────────────────────── */

  function initializeAll() {
    if (typeof gsap === "undefined") {
      console.warn("[3L] GSAP is not loaded — animations disabled.");

      return;
    }

    const plugins = ["ScrollTrigger", "ScrollSmoother", "SplitText"].filter(
      (name) => {
        const loaded = typeof window[name] !== "undefined";

        if (!loaded) {
          console.warn(
            `[3L] Plugin ${name} is not loaded — check script URLs.`
          );
        }

        return loaded;
      }
    );

    gsap.registerPlugin(...plugins.map((name) => window[name]));

    const hasScrollTrigger = plugins.includes("ScrollTrigger");

    const hasSmoother = hasScrollTrigger && plugins.includes("ScrollSmoother");

    if (!hasScrollTrigger) {
      console.warn("[3L] Scroll animations require ScrollTrigger.");

      return;
    }

    ScrollTrigger.config({
      ignoreMobileResize: true,
    });

    if (hasSmoother && !REDUCED_MOTION) {
      ScrollSmoother.create({
        wrapper: ".page-wrapper",
        content: ".main-wrapper",
        smooth: 1.5,
        effects: true,
        smoothTouch: 0.1,
        normalizeScroll: true,
      });
    }

    const slidersData = readSlidersData();

    document.querySelectorAll(".slider[slider-group]").forEach((slider) => {
      const group = (slider.getAttribute("slider-group") || "")
        .toLowerCase()
        .trim();

      const slides = slidersData[group];

      if (slides?.length) {
        createTabbedSlider(slider, slides);
      } else {
        slider.style.display = "none";
      }
    });

    const idle =
      window.requestIdleCallback ||
      ((callback) => {
        return setTimeout(callback, 1);
      });

    if (document.readyState === "complete") {
      requestScrollRefresh();
    } else {
      window.addEventListener("load", requestScrollRefresh, {
        once: true,
      });
    }


    requestAnimationFrame(() => {
      initDividerReveals();
      initHeadingAnimations();
      initBrandsAccordion();

      idle(
        () => {
          prepareGuestroomSwiper();
          const swipers = initSwipers();
          initGuestroomTabs();
          initCounters();

          ScrollTrigger.refresh();

          window.addEventListener(
            "resize",
            debounce(() => {
              swipers?.refresh();
              ScrollTrigger.refresh();
            }, CONFIG.resizeDebounce),
            {
              passive: true,
            }
          );
        },
        {
          timeout: 1000,
        }
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAll);
  } else {
    initializeAll();
  }
})();
