Settings
.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
    .state('tab.settings', {
        url: '/settings',
        views: {
            'tab-settings': {
                templateUrl: 'app/Settings/views/tab-settings.html',
                controller: 'SettingsController'
            }
        }
    })
});
