Util
.factory('dialog', ['$cordovaDialogs', function ($cordovaDialogs) {
	var dialog = {
		alert: function(text, title, buttonName) {
			return $cordovaDialogs.alert((text), (title), (buttonName));
		},
		confirm: function(text, title, buttonsArray) {
			return $cordovaDialogs.confirm((text), (title), buttonsArray);
		},
		prompt: function(text, title, buttonsArray, defaultText) {
			return $cordovaDialogs.prompt((text), (title), buttonsArray, (defaultText));
		}
	};
	return dialog;
}]);
