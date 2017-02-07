Util
.factory('network', ['$cordovaNetwork', function ($cordovaNetwork) {
	var network = {
		isOnline: function() {
			try {
				return $cordovaNetwork.isOnline();
			} catch (err) {
				return true;
			}
		},
		isOffline: function() {
			try {
				return $cordovaNetwork.isOffline();
			} catch (err) {
				return true;
			}
		},
		type: function() {
			return $cordovaNetwork.getNetwork();
		}
	};
	return network;
}]);
