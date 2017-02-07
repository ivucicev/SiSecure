Tabs
.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('tab', {
            url: '/tab',
            abstract: true,
            templateUrl: 'app/tabs/views/tabs.html'
        })
});
