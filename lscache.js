/**
 * lscache library
 * Copyright (c) 2011, Pamela Fox
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jshint undef:true, browser:true, node:true */
/* global define, chrome */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module !== "undefined" && module.exports) {
    // CommonJS/Node module
    module.exports = factory();
  } else {
    // Browser globals
    root.lscache = factory();
  }
}(this, function () {

  // Prefix for all lscache keys
  var CACHE_PREFIX = 'lscache-';

  // Suffix for the key name on the expiration items in storage
  var CACHE_SUFFIX = '-cacheexpiration';

  // Expiration date radix (set to Base-36 for most space savings)
  var EXPIRY_RADIX = 10;

  // Time resolution in minutes
  var EXPIRY_UNITS = 60 * 1000;

  // ECMAScript max Date (epoch + 1e8 days)
  var MAX_DATE = Math.floor(8.64e15 / EXPIRY_UNITS);

  // Type of storage being used, based on requested type that is functional
  var storageType;

  // The storage object to be used, as indicated by storageType
  var storage;

  var cachedStorage;
  var cachedJSON;
  var cacheBucket = '';
  var warnings = false;

  function getSessionStorage() {
    try {
      if (sessionStorage) {
        return sessionStorage;
      } else {
        return undefined;
      }
    } catch (ex) {
      return undefined;
    }
  }

  function getLocalStorage() {
    try {
      if (localStorage) {
        return localStorage;
      } else {
        return undefined;
      }
    } catch (ex) {
      return undefined;
    }
  }

  function getSyncStorage() {
    try {
      // Chrome and firefox both support sync storage at chrome.
      if (chrome && chrome.storage && chrome.storage.sync) {
        return chrome.storage.sync;
      } else {
        return undefined;
      }
    } catch (ex) {
      return undefined;
    }
  }

  // Determines if syncStorage, localStorage, or sessionStorage is supported;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  // It's not run at parse-time as it takes 200ms in Android.
  function supportsStorage(type) {

    // The storage type and if supported is known - proceed
    if (cachedStorage !== undefined) {
      return cachedStorage;
    }

    /*
    console.log('===================================================================');
    console.log('session Storage', getSessionStorage());
    console.log('local Storage', getLocalStorage());
    console.log('sync Storage', getSyncStorage());
    console.log('===================================================================');
    */

    switch (type) {
    case 'session':
      storage = getSessionStorage();
      break;
    case 'sync':
      storage = getSyncStorage();
      break;
    default:  // 'local', invlaid, or unspecified type uses local
      type = 'local';
      storage = getLocalStorage();
      break;
    }
    storageType = type;

    try {
      var key = '__lscachetest__';
      var value = key;

      setItem(key, value);
      removeItem(key);
      cachedStorage = true;
    } catch (e) {
      // If we hit the limit, and we don't have an empty localStorage then it means we have support
      if (isOutOfSpace(e) && storage.length) {
        cachedStorage = true; // just maxed it out and even the set test failed.
      } else {
        cachedStorage = false;
        storage = undefined;
      }
    }
    return cachedStorage;
  }

  // Check to set if the error is us dealing with being out of space
  function isOutOfSpace(e) {
    return e && (
      e.name === 'QUOTA_EXCEEDED_ERR' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.name === 'QuotaExceededError'
    );
  }

  // Determines if native JSON (de-)serialization is supported in the browser.
  function supportsJSON() {
    /*jshint eqnull:true */
    if (cachedJSON === undefined) {
      cachedJSON = (window.JSON != null);
    }
    return cachedJSON;
  }

  /**
   * Returns a string where all RegExp special characters are escaped with a \.
   * @param {String} text
   * @return {string}
   */
  function escapeRegExpSpecialCharacters(text) {
    return text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
  }

  /**
   * Returns the full string for the storage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
    return key + CACHE_SUFFIX;
  }

  /**
   * Returns the number of minutes since the epoch, allowing for fractional component
   * @return {number}
   */
  function currentTime() {
    return (new Date().getTime()) / EXPIRY_UNITS;
  }

  /**
   * Wrapper functions for storage methods
   */

  function getItem(key) {
    return storage.getItem(CACHE_PREFIX + cacheBucket + key);
  }

  function setItem(key, value) {
    // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
    storage.removeItem(CACHE_PREFIX + cacheBucket + key);
    storage.setItem(CACHE_PREFIX + cacheBucket + key, value);
  }

  function removeItem(key) {
    storage.removeItem(CACHE_PREFIX + cacheBucket + key);
  }

  function eachKey(fn) {
    var prefixRegExp = new RegExp('^' + CACHE_PREFIX + escapeRegExpSpecialCharacters(cacheBucket) + '(.*)');
    // Loop in reverse as removing items will change indices of tail
    for (var i = storage.length - 1; i >= 0; --i) {
      var key = storage.key(i);
      key = key && key.match(prefixRegExp);
      key = key && key[1];
      if (key && key.indexOf(CACHE_SUFFIX) < 0) {
        fn(key, expirationKey(key));
      }
    }
  }

  function flushItem(key) {
    var exprKey = expirationKey(key);

    removeItem(key);
    removeItem(exprKey);
  }

  function flushExpiredItem(key) {
    var exprKey = expirationKey(key);
    var expr = getItem(exprKey);

    if (expr) {
      var expirationTime = parseFloat(expr);

      // Check if we should actually kick item out of storage
      if (currentTime() >= expirationTime) {
        removeItem(key);
        removeItem(exprKey);
        return true;
      }
    }
  }

  function warn(message, err) {
    if (!warnings) return;
    if (!('console' in window) || typeof window.console.warn !== 'function') return;
    window.console.warn("lscache - " + message);
    if (err) window.console.warn("lscache - The error was: " + err.message);
  }

  var lscache = {
    /**
     * Select the desired storage type (sync, local, session).  The requested type is
     * tested and the highest functioning type is returned
     * @param {string} type ('sync', 'local'->default, 'session')
     * @return {string} type actually functioning ('sync', 'local', 'session', or undefined)
     */
    init: function (props) {
      var ret = {};

      if (props instanceof Object) {
        Object.keys(props).forEach(function(key) {
          switch (key) {
          // Use a storage type other than the default localStorage (session)
          case 'storageType':
            cachedStorage = undefined;
            var supported = supportsStorage(props[key]);
            ret.supported = supported;
            ret.usingStorageType = storageType;
            break;
          default:
            throw new Error('Unknown property', key, props[key]);
          }
        });
      }

      return ret;
    },

    /**
     * Stores the value in storage. Expires after specified number of minutes.
     * @param {string} key
     * @param {Object|string} value
     * @param {number} time
     */
    set: function (key, value, time) {
      if (!supportsStorage()) return;

      // If we don't get a string value, try to stringify
      // In future, storage may properly support storing non-strings
      // and this can be removed.

      if (!supportsJSON()) return;
      try {
        value = JSON.stringify(value);
      } catch (e) {
        // Sometimes we can't stringify due to circular refs
        // in complex objects, so we won't bother storing then.
        return;
      }

      try {
        setItem(key, value);
      } catch (e) {
        if (isOutOfSpace(e)) {
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          var storedKeys = [];
          var storedKey;
          eachKey(function (key, exprKey) {
            var expiration = getItem(exprKey);
            if (expiration) {
              expiration = parseFloat(expiration);
            } else {
              // TODO: Store date added for non-expiring items for smarter removal
              expiration = MAX_DATE;
            }
            storedKeys.push({
              key: key,
              size: (getItem(key) || '').length,
              expiration: expiration
            });
          });
          // Sorts the keys with oldest expiration time last
          storedKeys.sort(function (a, b) { return (b.expiration - a.expiration); });

          var targetSize = (value || '').length;
          while (storedKeys.length && targetSize > 0) {
            storedKey = storedKeys.pop();
            warn("Cache is full, removing item with key '" + key + "'");
            flushItem(storedKey.key);
            targetSize -= storedKey.size;
          }
          try {
            setItem(key, value);
          } catch (e) {
            // value may be larger than total quota
            warn("Could not add item with key '" + key + "', perhaps it's too big?", e);
            return;
          }
        } else {
          // If it was some other error, just give up.
          warn("Could not add item with key '" + key + "'", e);
          return;
        }
      }

      // If a time is specified, store expiration info in storage
      if (time) {
        setItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX));
      } else {
        // In case they previously set a time, remove that info from storage.
        removeItem(expirationKey(key));
      }
    },

    /**
     * Retrieves specified value from storage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function (key) {
      if (!supportsStorage()) return null;

      // Return the de-serialized item if not expired
      if (flushExpiredItem(key)) { return null; }

      // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
      var value = getItem(key);
      if (!value || !supportsJSON()) {
        return value;
      }

      try {
        // We can't tell if its JSON or a string, so we try to parse
        return JSON.parse(value);
      } catch (e) {
        // If we can't parse, it's probably because it isn't an object
        return value;
      }
    },

    /**
     * Removes a value from storage.
     * Equivalent to 'delete' in memcache, but that's a keyword in JS.
     * @param {string} key
     */
    remove: function (key) {
      if (!supportsStorage()) return;

      flushItem(key);
    },

    /**
     * Returns whether local storage is supported.
     * Currently exposed for testing purposes.
     * @return {boolean}
     */
    supported: function () {
      return supportsStorage();
    },

    /**
     * Flushes all lscache items and expiry markers without affecting rest of storage
     */
    flush: function () {
      if (!supportsStorage()) return;

      eachKey(function (key) {
        flushItem(key);
      });
    },

    /**
     * Flushes expired lscache items and expiry markers without affecting rest of storage
     */
    flushExpired: function () {
      if (!supportsStorage()) return;

      eachKey(function (key) {
        flushExpiredItem(key);
      });
    },

    /**
     * Appends CACHE_PREFIX so lscache will partition data in to different buckets.
     * @param {string} bucket
     */
    setBucket: function (bucket) {
      cacheBucket = bucket;
    },

    /**
     * Resets the string being appended to CACHE_PREFIX so lscache will use the default storage behavior.
     */
    resetBucket: function () {
      cacheBucket = '';
    },

    /**
     * Sets whether to display warnings when an item is removed from the cache or not.
     */
    enableWarnings: function (enabled) {
      warnings = enabled;
    }
  };

  // Return the module
  return lscache;
}));
