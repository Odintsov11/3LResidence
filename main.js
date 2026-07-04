/**
 * 3L Residences — main.js (рефакторинг)
 *
 * Структура:
 *   1. Конфиг и фиче-флаги
 *   2. Утилиты (debounce, escape, JSON, загрузчик картинок)
 *   3. Чтение данных из CMS-нод
 *   4. Модули: аккордеон, дивайдеры, счётчики, динамические слайдеры,
 *      Swiper, табы guestroom, заголовки
 *   5. Bootstrap
 *
 * Все модули изолированы (IIFE), ничего не утекает в window.
 */
(() => {
  "use strict";

  /* ────────────────────────────────────────────────
   * 1. Конфиг
   * ──────────────────────────────────────────────── */

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
    accordion: {
      maxCachedThumbnails: 5,
    },
    guestroomTabs: {
      retryAttempts: 10,
      retryDelay: 200,
    },
    resizeDebounce: 250,
  };

  /**
   * Пока оставляем false, чтобы проверить все анимации.
   */
  const RESPECT_REDUCED_MOTION = false;

  const REDUCED_MOTION =
    RESPECT_REDUCED_MOTION &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  /* ────────────────────────────────────────────────
   * 2. Утилиты
   * ──────────────────────────────────────────────── */

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

  function parseJSONAttr(str) {
    if (typeof str !== "string") {
      return null;
    }

    const trimmed = str.trim();

    if (!trimmed || !/^[[{"]/.test(trimmed)) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
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

  /* ────────────────────────────────────────────────
   * 3. Данные слайдеров из скрытых CMS-нод
   * ──────────────────────────────────────────────── */

  function readSlidersData() {
    const items = document.querySelectorAll(".js-data-tabs");
    const grouped = {};

    items.forEach((item) => {
      const slide = {
        group: (item.getAttribute("data-group") || "default")
          .toLowerCase()
          .trim(),
        tabName: item.getAttribute("data-tab"),
        title: item.getAttribute("data-title"),
        description: item.getAttribute("data-desc"),
        gridTemplate: item.getAttribute("data-grid") || "default",
        order: toInt(item.getAttribute("data-order")),
        images: parseJSONAttr(item.getAttribute("data-images")) || [],
      };

      (grouped[slide.group] ??= []).push(slide);
    });

    Object.values(grouped).forEach((slides) => {
      slides.sort((a, b) => a.order - b.order);
    });

    return grouped;
  }

  /* ────────────────────────────────────────────────
   * 4a. Аккордеон брендов
   * ──────────────────────────────────────────────── */

  function initBrandsAccordion() {
    const sourceNodes = document.querySelectorAll(".js-data-accordeon");
    const accordion = document.querySelector(".brands_accordion");
    const mask = document.querySelector(".brands_mask");

    if (!sourceNodes.length || !accordion || !mask) {
      return;
    }

    const data = Array.from(sourceNodes)
      .map((node) => {
        const rawImage = node.getAttribute("data-image");
        let images = [];

        if (rawImage && rawImage.trim() && rawImage !== "Main Image") {
          const parsed = parseJSONAttr(rawImage);

          if (parsed) {
            images = Array.isArray(parsed) ? parsed : [parsed];
          } else {
            images = [{ url: rawImage.trim() }];
          }
        }

        return {
          title: node.getAttribute("data-title") || "",
          content: parseJSONAttr(node.getAttribute("data-content")) || [],
          images,
          order: toInt(node.getAttribute("data-order")),
        };
      })
      .sort((a, b) => a.order - b.order);

    if (!data.length) {
      return;
    }

    accordion.innerHTML = "";
    mask.innerHTML = "";

    const thumbnails = document.createElement("div");
    thumbnails.className = "brands_thumbnails";
    mask.appendChild(thumbnails);

    const imagesFragment = document.createDocumentFragment();
    const firstImageByItem = new Map();

    const accordionHtml = data
      .map((item, itemIndex) => {
        const contentHtml = (Array.isArray(item.content) ? item.content : [])
          .map((position) => {
            const thumbnail = (position.thumbnail || "").trim();

            return thumbnail
              ? `<div class="brands_position has_thumbnail" data-thumbnail="${escapeHtml(
                  thumbnail
                )}">${escapeHtml(position.text)}</div>`
              : `<div class="brands_position">${escapeHtml(
                  position.text
                )}</div>`;
          })
          .join("");

        item.images.forEach((imageData, imageIndex) => {
          if (!imageData?.url) {
            return;
          }

          const image = document.createElement("img");
          const isInitial = itemIndex === 0 && imageIndex === 0;

          image.src = imageData.url;
          image.alt = imageData.alt || item.title;
          image.className = "brands_image";

          gsap.set(image, {
            zIndex: isInitial ? 10 : 1,
            clipPath: isInitial ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
          });

          if (!firstImageByItem.has(itemIndex)) {
            firstImageByItem.set(itemIndex, image);
          }

          imagesFragment.appendChild(image);
        });

        return `
          <div class="brands_item${itemIndex === 0 ? " is-active" : ""}">
            <div class="brands_heading">
              <div class="brands_title">${escapeHtml(item.title)}</div>

              <div class="brands_icon${itemIndex === 0 ? " is-active" : ""}">
                <div class="icon-1x1-small w-embed">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0a12 12 0 1 0 12 12A12.013 12.013 0 0 0 12 0zm4 13h-3v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1 0-2h3V8a1 1 0 0 1 2 0v3h3a1 1 0 0 1 0 2z"/>
                  </svg>
                </div>
              </div>

              <div class="brands_accordion-line"></div>
            </div>

            <div
              class="brands_content${itemIndex === 0 ? " is-active" : ""}"
              style="height:${itemIndex === 0 ? "auto" : "0px"}"
            >
              <div class="brands_wrapper">
                ${contentHtml}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    accordion.innerHTML = accordionHtml;
    mask.appendChild(imagesFragment);

    accordion.addEventListener("mouseover", (event) => {
      const position = event.target.closest(".has_thumbnail");

      if (position && accordion.contains(position)) {
        showThumbnail(position.dataset.thumbnail);
      }
    });

    accordion.addEventListener("mouseout", (event) => {
      const position = event.target.closest(".has_thumbnail");

      if (position && !position.contains(event.relatedTarget)) {
        hideThumbnails();
      }
    });

    accordion.querySelectorAll(".has_thumbnail").forEach((element) => {
      imageLoader.load(element.dataset.thumbnail);
    });

    function showThumbnail(url) {
      if (!url) {
        return;
      }

      const existing = thumbnails.querySelector(
        `[data-src="${CSS.escape(url)}"]`
      );

      if (existing) {
        gsap.to(existing, {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
        });

        return;
      }

      const thumbnail = document.createElement("div");

      thumbnail.className = "brands_thumbnail";
      thumbnail.dataset.src = url;
      thumbnail.style.backgroundImage = `url("${url}")`;

      gsap.set(thumbnail, {
        opacity: 0,
        y: 80,
      });

      thumbnails.appendChild(thumbnail);

      gsap.to(thumbnail, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "power2.out",
      });
    }

    function hideThumbnails() {
      const allThumbnails = thumbnails.querySelectorAll(".brands_thumbnail");

      if (!allThumbnails.length) {
        return;
      }

      gsap.to(allThumbnails, {
        opacity: 0,
        y: 80,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          const max = CONFIG.accordion.maxCachedThumbnails;

          if (allThumbnails.length > max) {
            [...allThumbnails]
              .slice(0, -max)
              .forEach((element) => element.remove());
          }
        },
      });
    }

    const items = accordion.querySelectorAll(".brands_item");
    let activeImage = firstImageByItem.get(0) || null;

    accordion.addEventListener("click", (event) => {
      const heading = event.target.closest(".brands_heading");

      if (!heading) {
        return;
      }

      const item = heading.closest(".brands_item");
      const itemIndex = Array.from(items).indexOf(item);

      if (item.classList.contains("is-active")) {
        closeItem(item);
        showImage(0);
      } else {
        items.forEach((currentItem) => {
          if (currentItem.classList.contains("is-active")) {
            closeItem(currentItem);
          }
        });

        openItem(item);
        showImage(itemIndex);
      }
    });

    function openItem(item) {
      item.classList.add("is-active");

      gsap.to(item.querySelector(".brands_content"), {
        height: "auto",
        duration: 0.5,
        ease: "power2.out",
      });

      gsap.to(item.querySelector(".brands_accordion-line"), {
        width: 0,
        duration: 0.5,
      });

      gsap.to(item.querySelector(".brands_icon"), {
        opacity: 0.2,
        rotation: 45,
        duration: 0.5,
      });
    }

    function closeItem(item) {
      item.classList.remove("is-active");

      gsap.to(item.querySelector(".brands_content"), {
        height: 0,
        duration: 0.4,
        ease: "power2.out",
      });

      gsap.to(item.querySelector(".brands_accordion-line"), {
        width: "100%",
        duration: 0.4,
      });

      gsap.to(item.querySelector(".brands_icon"), {
        opacity: 1,
        rotation: 0,
        duration: 0.4,
      });
    }

    function showImage(itemIndex) {
      const nextImage = firstImageByItem.get(itemIndex);

      if (!nextImage || nextImage === activeImage) {
        return;
      }

      const previousImage = activeImage;
      activeImage = nextImage;

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
  }

  /* ────────────────────────────────────────────────
   * 4b. Раскрытие широких картинок-дивайдеров
   * ──────────────────────────────────────────────── */

  function initDividerReveals() {
    const dividers = gsap.utils.toArray(".divider_wrapper");

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

  /* ────────────────────────────────────────────────
   * 4c. Счётчики
   * ──────────────────────────────────────────────── */

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

  /* ────────────────────────────────────────────────
   * 4d. Динамические слайдеры
   * ──────────────────────────────────────────────── */

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

    /**
     * Единственное техническое исправление:
     * защищает от вставки изображений старого слайда,
     * если их загрузка завершилась после переключения.
     */
    let renderVersion = 0;

    const canPlay = () => {
      return state.inView && !state.hovered && !state.animating;
    };

    tabsList.innerHTML = "";
    tabsList.setAttribute("role", "tablist");

    const tabsFragment = document.createDocumentFragment();

    slides.forEach((slide, index) => {
      const tab = document.createElement("button");

      tab.type = "button";

      tab.setAttribute("aria-selected", index === 0 ? "true" : "false");

      tab.className = `slider_tab-button${index === 0 ? " is-active" : ""}`;

      tab.innerHTML =
        `<div class="slider_time-overlay"></div>` +
        `<div class="slider_tab-text">${escapeHtml(
          slide.tabName || `Таб ${index + 1}`
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

      /**
       * Пользователь уже мог перейти на другой слайд,
       * пока изображения загружались.
       */
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

      /**
       * Повторная проверка перед изменением DOM.
       */
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

      tabButtons[index].classList.add("is-active");

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

    const initialVersion = ++renderVersion;

    appendImages(slides[0], initialVersion);

    root.style.display = "";

    ScrollTrigger.create({
      trigger: root,
      start: "top 95%",
      end: "bottom 5%",
      onToggle: (self) => {
        state.inView = self.isActive;

        if (self.isActive) {
          resumeAutoplay();
        } else {
          state.progressTween?.pause();
        }
      },
    });
  }

  /* ────────────────────────────────────────────────
   * 4e. Swiper
   * ──────────────────────────────────────────────── */

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

      const slides = swiperElement.querySelectorAll(".swiper-slide");

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

      new Swiper(swiperElement, {
        slidesPerView: "auto",
        spaceBetween: 32,
        speed: 600,
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

  /* ────────────────────────────────────────────────
   * 4f. Guestroom tabs
   * ──────────────────────────────────────────────── */

  function initGuestroomTabs() {
    const { retryAttempts, retryDelay } = CONFIG.guestroomTabs;

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

      const abortController = new AbortController();

      tabs.forEach((tab, index) => {
        tab.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            swiper.slideTo(index === 0 ? firstIndex : secondIndex, 300);
          },
          {
            signal: abortController.signal,
          }
        );
      });

      function updateTabsState() {
        const currentIndex = swiper.activeIndex;

        const activeTab = currentIndex >= secondIndex ? 1 : 0;

        tabs.forEach((tab, index) => {
          tab.classList.toggle("is-active", index === activeTab);

          const overlay = tab.querySelector(".slider_time-overlay");

          if (!overlay) {
            return;
          }

          let progress = 0;

          if (index === activeTab) {
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

  /* ────────────────────────────────────────────────
   * 4g. Заголовки
   * ──────────────────────────────────────────────── */

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

  /* ────────────────────────────────────────────────
   * 5. Bootstrap
   * ──────────────────────────────────────────────── */

  function initializeAll() {
    if (typeof gsap === "undefined") {
      console.warn("[3L] GSAP не загружен — анимации отключены.");

      return;
    }

    const plugins = ["ScrollTrigger", "ScrollSmoother", "SplitText"].filter(
      (name) => {
        const loaded = typeof window[name] !== "undefined";

        if (!loaded) {
          console.warn(
            `[3L] Плагин ${name} не загружен — зависящие от него функции отключены. Проверьте URL подключения скриптов.`
          );
        }

        return loaded;
      }
    );

    gsap.registerPlugin(...plugins.map((name) => window[name]));

    const hasScrollTrigger = plugins.includes("ScrollTrigger");

    const hasSmoother = hasScrollTrigger && plugins.includes("ScrollSmoother");

    const hasSplitText = plugins.includes("SplitText");

    if (!hasScrollTrigger) {
      console.warn("[3L] Без ScrollTrigger скролл-анимации невозможны.");

      return;
    }

    ScrollTrigger.config({
      ignoreMobileResize: true,
    });

    if (hasSmoother) {
      ScrollSmoother.create({
        wrapper: ".page-wrapper",
        content: ".main-wrapper",
        smooth: REDUCED_MOTION ? 0 : 1.5,
        effects: !REDUCED_MOTION,
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

    document.querySelectorAll('img[loading="lazy"]').forEach((image) => {
      if (!image.complete) {
        image.addEventListener("load", requestScrollRefresh, {
          once: true,
        });
      }
    });

    requestAnimationFrame(() => {
      initDividerReveals();
      initHeadingAnimations();
      initBrandsAccordion();

      idle(
        () => {
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
