/* jshint undef:true, browser:true, node:true */
/* global QUnit, test, equal, asyncTest, start, define, deepEqual, chrome */

var startTests = function (lscache) {
  
  var originalConsole = window.console;

  QUnit.module('lscache', {
    setup: function() {
      // Reset localStorage before each test
      try {
        localStorage.clear();
      } catch(e) {}
    },
    teardown: function() {
      // Reset localStorage after each test
      try {
        localStorage.clear();
      } catch(e) {}
      window.console = originalConsole;
      lscache.enableWarnings(false);
    }
  });

  test('Testing init() for sync storage on unsupported browser (phantomjs)', function() {
    var using;

    using = lscache.init({ storageType: 'sync' });
    equal(using.supported, true, 'We expect using sync on phantomjs to be supported');
    equal(using.usingStorageType, 'local', 'We expect using sync on phantomjs to be `local`');

    lscache.flush();
  });

  test('Testing syncStorage on unsupported browser (phantomjs)', function() {
    var key = 'localkey';
    var value = 2;

    lscache.init({ storageType: 'sync' });
    lscache.set(key, value);
    lscache.init({ storageType: 'local' });
    equal(lscache.get(key), value, 'We expect sync value on phantomjs to actually be local storage ' + (value));
    lscache.init({ storageType: 'session' });
    equal(lscache.get(key), null, 'We expect sync value on phantomjs to not be session storage');

    lscache.flush();
  });

  QUnit.start();
};

startTests(lscache);
