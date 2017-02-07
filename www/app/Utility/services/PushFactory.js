Util.factory('push', ['$http', 'GOOGLE', 'APP', '$q', 'load', function($http, GOOGLE, APP, $q, load) {
    return {
        sendPush: function(tokens, msg) {
            load.nav();
            var deferred= $q.defer();
            return $http({
                url: ' https://push.ionic.io/api/v1/push',
                headers: {
                            'X-Ionic-Application-Id': String(APP.ID),
                            'Content-Type': 'application/json',
                            'Authorization': 'basic ' + btoa(APP.SECRET_KEY + ':')
                        },
                method: "POST",
                data: {
                    //user_ids: tokens,
                    tokens: tokens,
                    notification: {
                        alert: msg,
                        ios: {},
                        android: {
                            collapseKey: 'Foo',
                            delayWhileIdle: true,
                            timeToLive: 300,
                            payload: {
                                key1: 111,
                                key2: 222
                            }
                        }
                    }
                }
            }).success(function(res) {
                deferred.resolve(res);
            }).error(function(err) {
                deferred.reject(err);
            }).finally(function() {
                load.hide();
            });
            return deferred.promise;
        }
    }
}]);
