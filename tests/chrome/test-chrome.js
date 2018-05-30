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

  asyncTest('Dummy async test', 0, function() {
    setTimeout(function() {
      start();
    }, 1);
  });

  test('Testing init() for supported and unsupported storage Types', function() {
    var using;

    using = lscache.init({ storageType: 'sync' });
    equal(using.supported, true, 'We expect using sync on chrome to be supported');
    equal(using.usingStorageType, 'sync', 'We expect using sync on chrome to be `sync`');

    lscache.flush();
  });

  test('Testing syncStorage on chrome browser', function() {
    var lkey = 'localkey';
    var lvalue = 2;
    var skey = 'synckey';
    var svalue = 3;

    lscache.init({ storageType: 'local' });
    lscache.set(lkey, lvalue);
    lscache.init({ storageType: 'sync' });
    lscache.set(skey, svalue);
    equal(lscache.get(lkey), null, 'We expect local value to be unavailable in sync storage');
    equal(lscache.get(skey), svalue, 'We expect sync value to be ' + (svalue));
    lscache.init({ storageType: 'local' });
    equal(lscache.get(lkey), lvalue, 'We expect local value on local storage to be ' + (lvalue));
    equal(lscache.get(skey), null, 'We expect sync value to be unavailable on local storage');

    lscache.flush();
  });

  QUnit.start();
};

startTests(lscache);
