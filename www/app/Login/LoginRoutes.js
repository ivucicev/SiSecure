Login
.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
    .state('login', {
        url: '/',
        templateUrl: 'app/login/views/login.html',
        controller: 'LoginController'
    })
});
