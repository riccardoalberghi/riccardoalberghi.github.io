/* Interactive figures for blog posts.
 *
 * Figures only swap between pre-rendered images: nothing is computed in the
 * browser. Load this file from a post with `extra_js: [/assets/js/blog-widgets.js]`
 * in its front matter (and the stylesheet with `extra_css`).
 *
 * Image explorer: any element with the class "bw" holding controls.
 *
 *   <figure class="bw" data-bw-json="/images/post/data.json">
 *     <img data-bw-src="/images/post/star_{d}_{mode}.webp" src="...default..." alt="...">
 *     <input type="range" data-bw-key="d" min="0" max="4" value="2" data-bw-labels="a|b|c|d|e">
 *     <input type="radio" name="unique-name" data-bw-key="mode" value="log" checked>
 *     <output data-bw-show="d"></output>              label of the current value of d
 *     <output data-bw-text="strehl.{d}_{mode}"></output>  value read from the JSON file
 *     <button type="button" data-bw-play="d">Play</button>  steps through a slider
 *   </figure>
 *
 * Every {key} in a template is replaced by the current value of the control
 * with that data-bw-key.
 *
 * Before/after wipe: an element with the class "bw-compare" holding two
 * images (the second one inside .bw-compare__top) and a range input.
 */
(function () {
  "use strict";

  var jsonCache = {};

  function getJSON(url) {
    if (!jsonCache[url]) {
      jsonCache[url] = fetch(url).then(function (response) {
        if (!response.ok) throw new Error(url + ": " + response.status);
        return response.json();
      });
    }
    return jsonCache[url];
  }

  function fill(template, state) {
    return template.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : match;
    });
  }

  function lookup(data, path) {
    return path.split(".").reduce(function (obj, key) {
      return obj == null ? undefined : obj[key];
    }, data);
  }

  function preload(url) {
    var img = new Image();
    img.src = url;
  }

  function Figure(root) {
    this.root = root;
    this.controls = Array.prototype.slice.call(root.querySelectorAll("[data-bw-key]"));
    this.images = Array.prototype.slice.call(root.querySelectorAll("[data-bw-src]"));
    this.shows = Array.prototype.slice.call(root.querySelectorAll("[data-bw-show]"));
    this.texts = Array.prototype.slice.call(root.querySelectorAll("[data-bw-text]"));
    this.prefetchTimer = null;

    var self = this;
    this.controls.forEach(function (el) {
      el.addEventListener(el.type === "range" ? "input" : "change", function () {
        self.update();
      });
    });
    root.querySelectorAll("[data-bw-play]").forEach(function (button) {
      self.setupPlay(button);
    });

    var jsonUrl = root.getAttribute("data-bw-json");
    if (jsonUrl && this.texts.length) {
      getJSON(jsonUrl).then(function (data) {
        self.data = data;
        self.update();
      }).catch(function (err) {
        console.warn("blog-widgets:", err);
      });
    }
    this.update();
  }

  Figure.prototype.state = function () {
    var state = {};
    this.controls.forEach(function (el) {
      if (el.type === "radio" && !el.checked) return;
      state[el.getAttribute("data-bw-key")] = el.value;
    });
    return state;
  };

  Figure.prototype.label = function (key) {
    var controls = this.controls.filter(function (el) {
      return el.getAttribute("data-bw-key") === key && (el.type !== "radio" || el.checked);
    });
    if (!controls.length) return "";
    var el = controls[0];
    var labels = el.getAttribute("data-bw-labels");
    if (labels) {
      return labels.split("|")[Number(el.value) - Number(el.min || 0)] || el.value;
    }
    return el.getAttribute("data-bw-label") || el.value;
  };

  Figure.prototype.urls = function (state) {
    return this.images.map(function (img) {
      return fill(img.getAttribute("data-bw-src"), state);
    });
  };

  Figure.prototype.update = function () {
    var self = this;
    var state = this.state();

    this.images.forEach(function (img, i) {
      var url = fill(img.getAttribute("data-bw-src"), state);
      if (img.getAttribute("data-bw-current") === url) return;
      img.setAttribute("data-bw-current", url);
      if (!img.getAttribute("src")) {
        img.src = url;
        return;
      }
      // Swap only once the new image is ready, so the figure never flickers.
      var loader = new Image();
      loader.onload = function () {
        if (img.getAttribute("data-bw-current") === url) img.src = url;
      };
      loader.src = url;
    });

    this.shows.forEach(function (el) {
      el.textContent = self.label(el.getAttribute("data-bw-show"));
    });

    if (this.data) {
      this.texts.forEach(function (el) {
        var value = lookup(self.data, fill(el.getAttribute("data-bw-text"), state));
        if (value === undefined) return;
        if (typeof value === "number") {
          var digits = el.getAttribute("data-bw-digits");
          value = value.toFixed(digits === null ? 2 : Number(digits));
        }
        if (el.hasAttribute("data-bw-html")) el.innerHTML = value;
        else el.textContent = value;
      });
    }

    clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(function () {
      self.prefetchNeighbours(state);
    }, 200);
  };

  // Warm the cache with every image one step away from the current state.
  Figure.prototype.prefetchNeighbours = function (state) {
    var self = this;
    this.controls.forEach(function (el) {
      var key = el.getAttribute("data-bw-key");
      var values = [];
      if (el.type === "range") {
        var v = Number(el.value);
        if (v - 1 >= Number(el.min)) values.push(v - 1);
        if (v + 1 <= Number(el.max)) values.push(v + 1);
      } else if (el.type === "radio" && !el.checked) {
        values.push(el.value);
      }
      values.forEach(function (value) {
        var next = Object.assign({}, state);
        next[key] = String(value);
        self.urls(next).forEach(preload);
      });
    });
  };

  // A play button steps through a slider. data-bw-loop wraps around instead of
  // bouncing back (for animations that must not run backwards), and
  // data-bw-autoplay plays while the figure is on screen, unless the reader
  // prefers reduced motion or has paused it.
  Figure.prototype.setupPlay = function (button) {
    var self = this;
    var key = button.getAttribute("data-bw-play");
    var input = this.root.querySelector('input[type="range"][data-bw-key="' + key + '"]');
    if (!input) return;
    var interval = Number(button.getAttribute("data-bw-interval")) || 90;
    var loop = button.hasAttribute("data-bw-loop");
    var timer = null;
    var direction = 1;
    var pausedByReader = false;

    // Fetch every frame first so the animation plays smoothly.
    function preloadFrames() {
      var state = self.state();
      for (var v = Number(input.min); v <= Number(input.max); v++) {
        var frame = Object.assign({}, state);
        frame[key] = String(v);
        self.urls(frame).forEach(preload);
      }
    }

    function start() {
      preloadFrames();
      button.setAttribute("aria-pressed", "true");
      timer = setInterval(function () {
        var next = Number(input.value) + direction;
        if (next > Number(input.max) || next < Number(input.min)) {
          if (loop) {
            next = next > Number(input.max) ? Number(input.min) : Number(input.max);
          } else {
            direction = -direction;
            next = Number(input.value) + direction;
          }
        }
        input.value = next;
        self.update();
      }, interval);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      button.setAttribute("aria-pressed", "false");
    }

    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", function () {
      if (timer) {
        stop();
        pausedByReader = true;
      } else {
        pausedByReader = false;
        start();
      }
    });
    function takeOver() {
      if (timer) stop();
      pausedByReader = true;
    }
    input.addEventListener("pointerdown", takeOver);
    input.addEventListener("keydown", takeOver);

    // Other controls change which frames are shown: fetch the new set.
    this.controls.forEach(function (el) {
      if (el !== input) {
        el.addEventListener("change", function () {
          if (timer) preloadFrames();
        });
      }
    });

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (button.hasAttribute("data-bw-autoplay") && !reduceMotion && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !timer && !pausedByReader) start();
          else if (!entry.isIntersecting && timer) stop();
        });
      }, { threshold: 0.4 }).observe(this.root);
    }
  };

  function Compare(root) {
    var input = root.querySelector('input[type="range"]');
    function set() {
      root.style.setProperty("--bw-pos", input.value + "%");
    }
    input.addEventListener("input", set);
    set();
  }

  function init() {
    document.querySelectorAll(".bw").forEach(function (root) {
      new Figure(root);
    });
    document.querySelectorAll(".bw-compare").forEach(function (root) {
      new Compare(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
