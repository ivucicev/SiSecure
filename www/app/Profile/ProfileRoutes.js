Profile
.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
    .state('tab.profile', {
        url: '/profile',
        views: {
            'tab-profile': {
                templateUrl: 'app/Profile/views/tab-profile.html',
                controller: 'ProfileController'
            }
        }
    })
});
