/* Wonky Boy — rng.js
 * Seeded, deterministic random. Board layout + hazard placement must be
 * identical every time board N is entered, on every device. Live movement
 * sloppiness deliberately uses its own unseeded stream.
 */
(function (global) {
  'use strict';

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* mulberry32 — small, fast, good enough for level generation */
  function Rng(seed) {
    if (typeof seed === 'string') seed = hashString(seed);
    this.s = (seed >>> 0) || 1;
  }

  Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.chance = function (p) { return this.next() < p; };

  Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /* Weighted pick: items is [{w:number, ...}] */
  Rng.prototype.weighted = function (items) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += items[i].w;
    if (total <= 0) return null;
    var r = this.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= items[i].w;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  global.SB = global.SB || {};
  global.SB.Rng = Rng;
  global.SB.hashString = hashString;
})(window);
