Util
.factory('load', ['$ionicLoading', '$rootScope', '$timeout', 'storage', 'util', function ($ionicLoading, $rootScope, $timeout, storage, util) {
    $rootScope.text = '';
    var loader = {
        show: function (title) {
            if (util.isValid(title)) {
                $rootScope.text = title;
            } else {
                $rootScope.text = '';
            }
            if (this._isVisible()) {
                return;
            } else {
                storage.save("loader", 1);
                $ionicLoading.show({
                    template: '<ion-spinner class="font-size: 50px"></ion-spinner><p ng-show="text">{{text}}</p>',
                    content: 'Loading',
                    animation: 'fadeIn'
                });
            }
        },
        nav: function () {
            $rootScope.loader = true;
        },
        hide: function () {
            $ionicLoading.hide();
            $rootScope.loader = false;
            $rootScope.text = '';
            storage.save("loader", 0);
        },
        _isVisible: function() {
            var l = storage.get("loader");
            if (l === 'undefined' || typeof l === 'undefined') {
                storage.save("loader", 0);
                return 0;
            } else {
                return l;
            }
        }
    };
    return loader;
}]);
