Util
.factory('storage', ['$window', function($window) {
    var storage = {
        save: function(key, value) {
            if (typeof value !== 'string' && typeof value !== 'number' || typeof value !== 'boolean') {
                $window.localStorage.setItem(key, JSON.stringify(value));
            } else {
                $window.localStorage.setItem(key, value);
            }
            return 1;
        },
        get: function(key) {
            try {
                return JSON.parse($window.localStorage.getItem(key));
            } catch (e) {
                return $window.localStorage.getItem(key);
            }
        },
        remove: function(key) {
            $window.localStorage.removeItem(key);
        },
        flush: function() {
            $window.localStorage.clear();
        }
    };
    return storage;
}]);
