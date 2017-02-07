Util
.factory('modal', function($ionicModal) {
    var mods;
    var modalW = {
        reveal: function(template, data) {
            mod = $ionicModal.fromTemplateUrl(template, {
                scope: data,
                animation: 'slide-in-up'
            }).then(function(modal) {
                mods = modal;
                modal.show();
            });
            return mods;
        },
        destroy: function() {
            mods.hide();
            mods.remove();
        }
    };
    return modalW;
});
