Util
.factory('location', ['$cordovaGeolocation', 'load', 'storage', '$q', 'util', '$http', function ($cordovaGeolocation, load, storage, $q, util, $http) {
    var watch, locate;
    var options = {
        timeout: 10000,
        enableHighAccuracy: true,
        maximumAge: 5000
    };
    var watchOptions = {
        frequency: 1500,
        timeout: 20000,
        enableHighAccuracy: true
    };
    var geolocation = {
        get: function () {
            load.nav();
            console.log(options);
            locate = $cordovaGeolocation.getCurrentPosition(options)
            .finally(function (data) {
                load.hide();
            });
            return locate;
        },
        silent: function () {
            load.nav();
            locate = $cordovaGeolocation.getCurrentPosition(options)
                .finally(function () {
                    load.hide();
                });
            return locate;
        },
        local: function () {
            var deferred = $q.defer();
            var loc = storage.get("lastLocation");
            if (util.isValid(loc)) {
                var lastTime = new Date(loc.time);
                var currentTime = new Date();
                var diffMs = (currentTime - lastTime);
                var diffDays = Math.round(diffMs / 86400000);
                var diffHrs = Math.round((diffMs % 86400000) / 3600000);
                var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
                if (Math.abs(diffMins) > 7) {
                    deferred.reject(false);
                } else {
                    deferred.resolve(loc);
                }
            } else {
                deferred.reject(false);
            }
            return deferred.promise;
        },
        save: function (loc) {
            storage.save("lastLocation", loc);
        },
        watch: function () {
            watch = $cordovaGeolocation.watchPosition(watchOptions);
            return watch;
        },
        clear: function () {
            return watch.clearWatch();
        },
        reverseGeocode: function (lat, lon) {
            return $http.get('https://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lon);
        },
        geocode: function (address) {
            return $http.get('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(address));
        }
    };
    return geolocation;
}]);
