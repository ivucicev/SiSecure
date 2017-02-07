Util
.factory('popup', ['$ionicPopup', function($ionicPopup) {
    var alertPopup = {
        createPopup: function(title, text, buttonText, buttonClass) {
            return $ionicPopup.alert({
                title: title,
                template: text,
                buttons: [{
                    text: '<b>' + buttonText + '</b>',
                    type: 'button-' + buttonClass
                }]
            });
        },
        custom: function(title, template) {
            return this.createPopup((title), (template), 'Cancel', 'assertive button-clear');
        },
        error: function(text) {
            return this.createPopup('<i class="ion-close-circled"></i> ' + ('Error'), (text), 'Ok', 'assertive');
        },
        success: function(text) {
            return this.createPopup('<i class="ion-checkmark-circled"></i> ' + ('Success'), (text), 'Ok', 'positive');
        },
        warning: function(text) {
            return this.createPopup('<i class="ion-alert-circled"></i> ' + ('Warning'), (text), 'Ok', 'energized');
        },
        noTranslate: function(text) {
            return this.createPopup('<i class="ion-checkmark-circled"></i> ', text, 'Ok', 'energized');
        }
    };
    return alertPopup;
}]);
