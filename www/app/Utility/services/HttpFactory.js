Util
.factory('http', ['$http', '$q', 'PATHS', 'popup', 'load', 'log', 'storage', function ($http, $q, PATHS, popup, load, log, storage) {
    var mod, encoded = null;
    var httpServ = {
        get: function(link, silent) {
            encoded = storage.get("credentials");
            if (typeof silent === 'undefined') {
                load.nav();
            } else {
                load.show();
            }
            var deferred = $q.defer();
            var response;
            $http({
                url: PATHS.BASE + link,
                headers: {'Authorization': 'Basic ' + encoded,
                          'Content-Type': 'application/x-www-form-urlencoded',
                          'Accept': 'application/json'},
                method: "GET",
            }).success(function(res){
                log.log(link);
                log.log(res);
                deferred.resolve(res);
            }).error(function(a, b, c, d) {
                log.log(link);
                log.error(a);
                log.error(b);
                log.error(c);
                log.error(d);
                deferred.reject(0);
                //popup.error('error.ajax');
            }).finally(function(){
                load.hide();
            });
            return deferred.promise;
        },
        post: function(link, data, silent) {
            encoded = storage.get("credentials");
            if (typeof silent === 'undefined') {
                load.nav();
            } else {
                load.show();
            }
            var deferred = $q.defer();
            var response;
            $http({
                url: PATHS.BASE + link,
                headers: {'Authorization': 'Basic ' + encoded/*,
                          'Content-Type': 'application/x-www-form-urlencoded',
                          'Accept': 'application/json'*/},
                method: "POST",
                data: data
            }).success(function(res){
                log.log(link);
                log.log(res);
                deferred.resolve(res);
            }).error(function(a, b, c, d) {
                log.log(link);
                log.error(a);
                log.error(b);
                log.error(JSON.stringify(c));
                log.error(d);
                //popup.error('error.ajax');
                deferred.reject(0);
            }).finally(function(){
                load.hide();
            });
            return deferred.promise;
        }
    };
    return httpServ;
}]);
